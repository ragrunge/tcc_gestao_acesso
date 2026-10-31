-- Sessão e ator (desenho §2.4 e §3.4, item 4): o equivalente do SessaoGuard + PapelGuard, pelo caminho real.
--   * api.*: SET ROLE authenticated + request.jwt.claims (o que o PostgREST faz depois de verificar a JWT);
--   * srv.*: SET ROLE service_role (o que a Edge usa), com o sessao_id que api.sessao_atual devolveu.
-- Cada recusa é conferida pelo CÓDIGO do erro (JSON do RAISE PGRST), não só por "deu erro".
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(50);

-- ===== Fixtures ===================================================================================================
-- uNN = usuario_sistema.id, aNN = auth_user_id (sub), sNN = sessao.id, gNN = auth_session_id (session_id da JWT).
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO ids SELECT k, gen_random_uuid() FROM unnest(ARRAY[
  'u_si', 'a_si', 'u_ad', 'a_ad', 'u_po', 'a_po', 'u_des', 'a_des', 'u_troca', 'a_troca', 'u_venc', 'a_venc',
  'u_semprazo', 'a_semprazo', 'u_longo', 'a_longo']) k;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.usuario_sistema (id, nome, login, papel, ativo, deve_trocar_senha, senha_temporaria_expira_em, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'Sílvia Síndica', 't.sindica', 'sindico', true, false, NULL, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'Adão Administração', 't.admin', 'administracao', true, false, NULL, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Pedro Porteiro', 't.porteiro', 'porteiro', true, false, NULL, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_troca'), 'Tânia Troca', 't.troca', 'administracao', true, true, now() + interval '1 hour', pg_temp.id('a_troca'), pg_temp.email()),
  (pg_temp.id('u_venc'), 'Valter Vencido', 't.vencido', 'administracao', true, true, now() - interval '1 minute', pg_temp.id('a_venc'), pg_temp.email()),
  (pg_temp.id('u_semprazo'), 'Sérgio Sem Prazo', 't.semprazo', 'administracao', true, true, NULL, pg_temp.id('a_semprazo'), pg_temp.email()),
  (pg_temp.id('u_longo'), 'Lia Longa', 't.longa', 'sindico', true, false, NULL, pg_temp.id('a_longo'), pg_temp.email());
-- Desativado: insere ativo e desativa (o CHECK de desativação e o trigger marcar_desativacao valem).
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email)
VALUES (pg_temp.id('u_des'), 'Davi Desativado', 't.desativado', 'administracao', false, pg_temp.id('a_des'), pg_temp.email());
UPDATE public.usuario_sistema SET ativo = false WHERE id = pg_temp.id('u_des');

-- Sessões: nome -> (usuário, criada há, último uso há, expira em, longa, revogada)
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.sessao(p_k text, p_usuario text, p_criada interval, p_uso interval, p_expira interval,
                               p_longa boolean DEFAULT false, p_revogada boolean DEFAULT false) RETURNS void LANGUAGE sql AS $$
  INSERT INTO sess (k, sub) VALUES (p_k, pg_temp.id('a' || substr(p_usuario, 2)));
  INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em, manter_conectado, revogada_em, motivo_revogacao)
  SELECT s.sid, pg_temp.id(p_usuario), s.gid, now() - p_criada, now() - p_uso, now() + p_expira, p_longa,
         CASE WHEN p_revogada THEN now() END, CASE WHEN p_revogada THEN 'logout' END
    FROM sess s WHERE s.k = p_k;
$$;
SELECT pg_temp.sessao('si', 'u_si', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('si2', 'u_si', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('ad', 'u_ad', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('po', 'u_po', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('revogada', 'u_si', '1 minute', '1 minute', '13 hours', false, true);
SELECT pg_temp.sessao('expirada', 'u_si', '2 hours', '1 minute', '-1 minute');
SELECT pg_temp.sessao('prazo_hoje', 'u_si', '15 hours', '1 minute', '1 day');   -- expira_em longe, mas criada há > 14 h
SELECT pg_temp.sessao('inativa', 'u_si', '5 hours', '4 hours 1 minute', '9 hours');
SELECT pg_temp.sessao('quase_inativa', 'u_si', '5 hours', '3 hours 59 minutes', '9 hours');
SELECT pg_temp.sessao('desativado', 'u_des', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('troca', 'u_troca', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('vencida', 'u_venc', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('semprazo', 'u_semprazo', '1 minute', '1 minute', '13 hours');
SELECT pg_temp.sessao('longa', 'u_longo', '20 hours', '1 minute', '14 days', true);
CREATE FUNCTION pg_temp.sid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT sid FROM sess WHERE k = p $$;

-- Chamada como o PostgREST faria: papel authenticated + claims. 'ok' ou o código do erro.
CREATE FUNCTION pg_temp.como(p_claims jsonb, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql;
    r := 'ok';
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := (SQLERRM::jsonb) ->> 'code';
    WHEN OTHERS THEN r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.jwt(p_k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid) FROM sess WHERE k = p_k
$$;
CREATE FUNCTION pg_temp.api(p_k text, p_sql text DEFAULT 'SELECT api.sessao_atual()') RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como(pg_temp.jwt(p_k), p_sql)
$$;
-- Chamada como a Edge faria: service_role, sem claims de usuário.
CREATE FUNCTION pg_temp.srv(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    EXECUTE p_sql;
    r := 'ok';
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := (SQLERRM::jsonb) ->> 'code';
    WHEN OTHERS THEN r := SQLSTATE;
  END;
  RESET ROLE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.criar_preparar(p_k text, p_papel text DEFAULT 'porteiro') RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.srv(format($q$SELECT srv.usuario_criar_preparar(%L, 'Fulano de Teste', %L, %L)$q$,
    pg_temp.sid(p_k), 'novo.' || substr(md5(random()::text), 1, 8), p_papel))
$$;

-- ===== Identidade (JWT) ===========================================================================================
SELECT is(pg_temp.api('si'), 'ok', 'sessão válida do síndico: api.sessao_atual responde');
SELECT is(pg_temp.como(NULL, 'SELECT api.sessao_atual()'), 'NAO_AUTENTICADO', 'sem claims: NAO_AUTENTICADO');
SELECT is(pg_temp.como(pg_temp.jwt('si') || '{"role": "anon"}', 'SELECT api.sessao_atual()'), 'NAO_AUTENTICADO',
  'claim role diferente de authenticated: NAO_AUTENTICADO');
SELECT is(pg_temp.como(pg_temp.jwt('si') - 'session_id', 'SELECT api.sessao_atual()'), 'NAO_AUTENTICADO',
  'JWT sem session_id: NAO_AUTENTICADO');
SELECT is(pg_temp.como(pg_temp.jwt('si') || jsonb_build_object('session_id', gen_random_uuid()), 'SELECT api.sessao_atual()'),
  'SESSAO_INVALIDA', 'session_id que não está em sessao (login direto no GoTrue, sem passar pela Edge): SESSAO_INVALIDA');
SELECT is(pg_temp.como(pg_temp.jwt('si') || jsonb_build_object('sub', pg_temp.id('a_po')), 'SELECT api.sessao_atual()'),
  'SESSAO_INVALIDA', 'sub de outro usuário com o session_id do síndico: SESSAO_INVALIDA');
SELECT is(pg_temp.como(pg_temp.jwt('si') || '{"papel": "sindico", "app_metadata": {"papel": "sindico"}}',
  'SELECT api.sessao_atual()'), 'ok', 'claim extra de papel não muda nada (papel vem do banco)');

-- ===== Estado da sessão e do usuário ====================================================================================
SELECT is(pg_temp.api('revogada'), 'SESSAO_INVALIDA', 'sessão revogada: SESSAO_INVALIDA');
SELECT is(pg_temp.api('expirada'), 'SESSAO_INVALIDA', 'sessão expirada (expira_em no passado): SESSAO_INVALIDA');
SELECT is(pg_temp.api('prazo_hoje'), 'SESSAO_INVALIDA', 'criada há mais que o prazo absoluto de hoje (14 h): SESSAO_INVALIDA');
SELECT is(pg_temp.api('inativa'), 'SESSAO_INVALIDA', 'sem uso há mais de 4 h (inatividade): SESSAO_INVALIDA');
SELECT is(pg_temp.api('quase_inativa'), 'ok', 'sem uso há 3h59: ainda vale');
SELECT is(pg_temp.api('desativado'), 'SESSAO_INVALIDA', 'usuário desativado: SESSAO_INVALIDA');
SELECT is(pg_temp.api('vencida'), 'SESSAO_INVALIDA', 'troca pendente com a senha temporária vencida: SESSAO_INVALIDA');
SELECT is(pg_temp.api('semprazo'), 'SESSAO_INVALIDA', 'troca pendente SEM prazo gravado conta como vencida (falha fechada)');
SELECT is(pg_temp.api('troca'), 'ok', 'troca pendente válida: api.sessao_atual permite (a tela de troca precisa do usuário)');
SELECT is(pg_temp.criar_preparar('troca'), 'TROCA_DE_SENHA_OBRIGATORIA',
  'troca pendente: ação que exige papel (usuario.gerenciar, que a administração tem) recusa com 403 de troca');
SELECT is(pg_temp.criar_preparar('ad'), 'ok', 'a mesma ação, sem troca pendente: aceita');

-- Toque: ultimo_uso_em avança na chamada (sessão com último uso há 3h59).
SELECT ok((SELECT ultimo_uso_em > now() - interval '1 minute' FROM public.sessao WHERE id = pg_temp.sid('quase_inativa')),
  'a chamada válida grava ultimo_uso_em (toque)');

-- ===== Papel ATUAL, lido a cada chamada ==================================================================================
SELECT is(pg_temp.criar_preparar('si', 'sindico'), 'ok', 'síndico cria síndico');
SELECT is(pg_temp.criar_preparar('ad', 'sindico'), 'SEM_PERMISSAO', 'administração não cria síndico (usuario.gerenciar_sindico)');
SELECT is(pg_temp.criar_preparar('po'), 'SEM_PERMISSAO', 'porteiro não gerencia usuário');
UPDATE public.usuario_sistema SET papel = 'porteiro' WHERE id = pg_temp.id('u_ad');
SELECT is(pg_temp.criar_preparar('ad'), 'SEM_PERMISSAO', 'rebaixado a porteiro: a MESMA sessão perde a permissão na chamada seguinte');
SELECT is(pg_temp.api('ad', $$SELECT set_config('t.papel', api.sessao_atual() #>> '{usuario,papel}', true)$$), 'ok',
  'api.sessao_atual responde para o rebaixado');
SELECT is(current_setting('t.papel'), 'porteiro', 'api.sessao_atual devolve o papel novo, não o do login');
UPDATE public.usuario_sistema SET papel = 'administracao' WHERE id = pg_temp.id('u_ad');
SELECT is(pg_temp.criar_preparar('ad'), 'ok', 'promovido de volta: vale na chamada seguinte');

SELECT is(pg_temp.api('longa'), 'ok', 'sessão longa (manter conectado) do síndico criada há 20 h: vale');
UPDATE public.usuario_sistema SET papel = 'porteiro' WHERE id = pg_temp.id('u_longo');
SELECT is(pg_temp.api('longa'), 'SESSAO_INVALIDA', 'quem virou porteiro volta ao prazo padrão (14 h): a sessão de 20 h cai');

-- ===== Logout e revogação ==============================================================================================
SELECT is(pg_temp.api('si2', 'SELECT api.sessao_encerrar()'), 'ok', 'logout responde');
SELECT is(pg_temp.api('si2'), 'SESSAO_INVALIDA', 'depois do logout, o mesmo access token é recusado');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'auth.logout' AND registro_id = pg_temp.sid('si2')
  AND usuario_id = pg_temp.id('u_si')), 'logout auditado com o ator');
SELECT is(pg_temp.api('si'), 'ok', 'logout de uma sessão não derruba a outra do mesmo usuário');

SELECT is(pg_temp.srv(format('SELECT srv.usuario_desativar(%L, %L, NULL)', pg_temp.sid('si'), pg_temp.id('u_si'))),
  'AUTO_DESATIVACAO', 'ninguém desativa a si mesmo');
SELECT is(pg_temp.srv(format('SELECT srv.usuario_desativar(%L, %L, NULL)', pg_temp.sid('ad'), pg_temp.id('u_longo'))),
  'ok', 'administração desativa quem hoje é porteiro');
SELECT is(pg_temp.srv(format('SELECT srv.usuario_desativar(%L, %L, NULL)', pg_temp.sid('ad'), pg_temp.id('u_si'))),
  'SEM_PERMISSAO', 'administração não desativa o síndico');
SELECT is(pg_temp.srv(format('SELECT srv.usuario_desativar(%L, %L, NULL)', pg_temp.sid('si'), pg_temp.id('u_po'))),
  'ok', 'síndico desativa o porteiro');
SELECT is(pg_temp.api('po'), 'SESSAO_INVALIDA', 'desativado: a sessão aberta cai NA HORA (sem esperar o access token vencer)');
SELECT is((SELECT motivo_revogacao FROM public.sessao WHERE id = pg_temp.sid('po')), 'desativacao', 'revogada com motivo desativacao');

SELECT is(pg_temp.srv(format('SELECT srv.usuario_redefinir_senha(%L, %L, NULL)', pg_temp.sid('si'), pg_temp.id('u_ad'))),
  'ok', 'síndico redefine a senha da administração');
SELECT is(pg_temp.api('ad'), 'SESSAO_INVALIDA', 'redefinida: a sessão do alvo cai');
SELECT ok((SELECT deve_trocar_senha AND senha_temporaria_expira_em BETWEEN now() + interval '71 hours' AND now() + interval '73 hours'
             FROM public.usuario_sistema WHERE id = pg_temp.id('u_ad')), 'redefinição: troca obrigatória com prazo de 72 h');

-- ===== Troca obrigatória concluída ======================================================================================
-- A troca pela API admin do Auth derruba os refresh tokens: a Edge entra de novo e a sessão nova substitui a atual.
SELECT pg_temp.sessao('troca2', 'u_troca', '1 minute', '1 minute', '13 hours');
INSERT INTO sess (k, sub) VALUES ('troca_nova', pg_temp.id('a_troca'));
SELECT is(pg_temp.srv(format('SELECT srv.troca_concluir(%L, NULL, %L, %L)', pg_temp.sid('troca2'), pg_temp.id('a_si'), gen_random_uuid())),
  'SESSAO_INVALIDA', 'troca_concluir com auth_user_id de outra conta: recusa');
SELECT is(pg_temp.srv(format('SELECT srv.troca_concluir(%L, NULL, %L, %L)', pg_temp.sid('troca'), pg_temp.id('a_troca'),
  (SELECT gid FROM sess WHERE k = 'troca_nova'))), 'ok', 'troca concluída');
UPDATE sess SET sid = (SELECT id FROM public.sessao WHERE auth_session_id = sess.gid) WHERE k = 'troca_nova';
SELECT is(pg_temp.criar_preparar('troca_nova'), 'ok', 'a sessão nova (login com a senha nova) opera sem troca pendente');
SELECT ok((SELECT n.criada_em = o.criada_em AND n.expira_em = o.expira_em FROM public.sessao n, public.sessao o
            WHERE n.id = pg_temp.sid('troca_nova') AND o.id = pg_temp.sid('troca')), 'a sessão nova herda o prazo (trocar a senha não estica a sessão)');
SELECT is(pg_temp.api('troca'), 'SESSAO_INVALIDA', 'a sessão de antes da troca é revogada');
SELECT is(pg_temp.api('troca2'), 'SESSAO_INVALIDA', 'a troca revoga as OUTRAS sessões do usuário');

-- ===== srv.* só por service_role; api.* não chama srv ==================================================================
SELECT is(pg_temp.api('si', format('SELECT srv.usuario_desativar(%L, %L, NULL)', pg_temp.sid('si'), pg_temp.id('u_troca'))),
  '42501', 'authenticated não executa srv.* (nem com sessão válida de síndico)');
SELECT is(pg_temp.api('si', 'SELECT app.ator()'), '42501', 'authenticated não executa app.* direto');
SELECT is(pg_temp.srv(format('SELECT srv.usuario_criar_preparar(%L, ''Fulano'', ''x.y.z'', ''porteiro'')', gen_random_uuid())),
  'SESSAO_INVALIDA', 'srv.* com sessao_id inventado: SESSAO_INVALIDA');

SELECT * FROM finish();
ROLLBACK;
