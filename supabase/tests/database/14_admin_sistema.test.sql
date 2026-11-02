-- Administrador do sistema (0040, 0041). Mesmo harness do 13 (api.* como authenticated, srv.* como service_role) e o
-- laço de RPCs do 07. O que se prova: o papel tem só usuario.ver e usuario.gerenciar; gerencia contas de porteiro
-- (criar, editar, desativar, reativar, redefinir senha); é negado em conta de síndico e de admin_sistema (alvo, papel
-- novo e o próprio cadastro), com usuario.gerenciar_sindico só do síndico; é negado em TODA RPC de api.* fora da
-- própria sessão, do catálogo e da listagem de usuários, e nas srv.anexo_*; o catálogo não tem dado pessoal; a
-- administração continua só com usuario.ver; o síndico atribui e cria o papel.
-- Fixtures próprias (logins t14.*). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(53);

-- ===== Fixtures ====================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_si2', 'u_ad', 'u_as', 'u_as2', 'u_po', 'u_po2', 'u_au',
  'a_si', 'a_si2', 'a_ad', 'a_as', 'a_as2', 'a_po', 'a_po2', 'a_au', 'a_novo', 'a_novo2']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'T14 Sara Síndica', 't14.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_si2'), 'T14 Sílvio Síndico', 't14.sindico2', 'sindico', false, pg_temp.id('a_si2'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'T14 Ada Admin', 't14.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_as'), 'T14 Tito Técnico', 't14.tecnico', 'admin_sistema', false, pg_temp.id('a_as'), pg_temp.email()),
  (pg_temp.id('u_as2'), 'T14 Tina Técnica', 't14.tecnica2', 'admin_sistema', false, pg_temp.id('a_as2'), pg_temp.email()),
  (pg_temp.id('u_po'), 'T14 Pedro Porteiro', 't14.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_po2'), 'T14 Paulo Porteiro', 't14.porteiro2', 'porteiro', false, pg_temp.id('a_po2'), pg_temp.email()),
  (pg_temp.id('u_au'), 'T14 Alice Auditora', 't14.auditora', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());

CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('ad', pg_temp.id('a_ad')), ('as', pg_temp.id('a_as')),
  ('po2', pg_temp.id('a_po2'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;
CREATE FUNCTION pg_temp.sid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT sid FROM sess WHERE k = p $$;

-- ===== Harness =====================================================================================================
-- api.* como o PostgREST: resultado em jsonb ou {erro: código}.
CREATE FUNCTION pg_temp.val(p_k text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; c text;
BEGIN
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text INTO c FROM sess WHERE k = p_k;
  PERFORM set_config('request.jwt.claims', coalesce(c, ''), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO r;
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := jsonb_build_object('erro', (SQLERRM::jsonb) ->> 'code');
    WHEN OTHERS THEN r := jsonb_build_object('erro', SQLSTATE, 'msg', SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
-- Só o código: 'ok' ou o code do erro (para o laço de RPCs; aceita RPC que devolve void).
CREATE FUNCTION pg_temp.como(p_k text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text; c text;
BEGIN
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text INTO c FROM sess WHERE k = p_k;
  PERFORM set_config('request.jwt.claims', coalesce(c, ''), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT ' || p_sql;
    r := 'ok';
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := (SQLERRM::jsonb) ->> 'code';
    WHEN OTHERS THEN r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.srv(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO r;
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := jsonb_build_object('erro', (SQLERRM::jsonb) ->> 'code');
    WHEN OTHERS THEN r := jsonb_build_object('erro', SQLSTATE, 'msg', SQLERRM);
  END;
  RESET ROLE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.preparar(p_ator text, p_login text, p_papel text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.usuario_criar_preparar(%L, %L, %L, %L::public.papel)', pg_temp.sid(p_ator), 'T14 Pessoa Nova', p_login, p_papel))
$$;
CREATE FUNCTION pg_temp.criar(p_ator text, p_login text, p_papel text, p_auth text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.usuario_criar(%L, %L, %L, %L::public.papel, %L, %L, NULL)', pg_temp.sid(p_ator), 'T14 Pessoa Nova',
    p_login, p_papel, pg_temp.id(p_auth), pg_temp.email()))
$$;
CREATE FUNCTION pg_temp.editar(p_ator text, p_alvo text, p_nome text, p_papel text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.usuario_editar(%L, %L, %L, NULL, %L::public.papel, NULL)', pg_temp.sid(p_ator), pg_temp.id(p_alvo), p_nome, p_papel))
$$;
CREATE FUNCTION pg_temp.alvo(p_ator text, p_fn text, p_alvo text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.%s(%L, %L, NULL)', p_fn, pg_temp.sid(p_ator), pg_temp.id(p_alvo)))
$$;
CREATE FUNCTION pg_temp.erro(r jsonb) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(r ->> 'erro', 'ok') $$;

-- Chamada mínima de cada RPC de api.* (como no 07: a primeira linha é app.exigir/app.ator, os argumentos não importam).
-- Fora do laço: a própria sessão, o catálogo (conferido abaixo) e a listagem de usuários (usuario.ver).
CREATE TEMP VIEW rpcs AS
SELECT f.oid::regprocedure AS fn, format('%s(%s)', f.oid::regproc,
         (SELECT string_agg(CASE t WHEN 'jsonb'::regtype THEN '''{}''::jsonb' WHEN 'uuid'::regtype THEN 'gen_random_uuid()'
                                    WHEN 'text'::regtype THEN '''x''' WHEN 'integer'::regtype THEN '1' WHEN 'boolean'::regtype THEN 'false' END, ', ')
            FROM unnest(f.proargtypes::regtype[]) t)) AS chamada
  FROM pg_proc f WHERE f.pronamespace = 'api'::regnamespace
   AND f.proname NOT IN ('sessao_atual', 'sessao_encerrar', 'catalogo', 'usuarios_listar', 'usuarios_resumo');

-- ===== Matriz =======================================================================================================
SELECT set_eq($$SELECT acao FROM public.rbac_matriz WHERE papel = 'admin_sistema'$$, ARRAY['usuario.ver', 'usuario.gerenciar'],
  'admin_sistema: só usuario.ver e usuario.gerenciar');
SELECT set_eq($$SELECT papel::text FROM public.rbac_matriz WHERE acao = 'usuario.gerenciar'$$, ARRAY['sindico', 'admin_sistema'],
  'usuario.gerenciar: síndico e admin_sistema');
SELECT set_eq($$SELECT papel::text FROM public.rbac_matriz WHERE acao = 'usuario.gerenciar_sindico'$$, ARRAY['sindico'],
  'usuario.gerenciar_sindico continua só do síndico');
SELECT set_eq($$SELECT papel::text FROM public.rbac_matriz WHERE acao = 'usuario.ver'$$, ARRAY['sindico', 'administracao', 'admin_sistema'],
  'usuario.ver: síndico, administração e admin_sistema');
SELECT is(app.rotulo_papel('admin_sistema'), 'Administrador do sistema', 'rótulo do papel (trilha, relatório)');
SELECT ok(pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'evento_operador_papel_ck')) LIKE '%admin_sistema%',
  'evento_acesso: admin_sistema nunca é operador (como o auditor)');

-- ===== Lista e totais ===============================================================================================
SELECT ok(NOT (pg_temp.val('as', 'api.usuarios_listar(''{}''::jsonb)') ? 'erro'), 'admin_sistema lista usuários');
SELECT is((SELECT array_agg(x ->> 'login' ORDER BY x ->> 'login')
             FROM jsonb_array_elements(pg_temp.val('as', 'api.usuarios_listar(''{"q": "t14", "papel": "admin_sistema"}''::jsonb)') -> 'itens') x),
  ARRAY['t14.tecnica2', 't14.tecnico'], 'filtro por papel admin_sistema');
SELECT is((pg_temp.val('as', 'api.usuarios_resumo()') -> 'porPapel' ->> 'admin_sistema')::bigint,
  (pg_temp.val('as', 'api.usuarios_listar(''{"situacao": "ativos", "papel": "admin_sistema"}''::jsonb)') ->> 'total')::bigint,
  'resumo.porPapel.admin_sistema = admin_sistema ativos');

-- ===== Gestão de porteiro: permitida =================================================================================
SELECT is(pg_temp.erro(pg_temp.preparar('as', 't14.novo', 'porteiro')), 'ok', 'admin_sistema prepara criar porteiro');
SELECT is(pg_temp.criar('as', 't14.novo', 'porteiro', 'a_novo') -> 'usuario' ->> 'papel', 'porteiro', 'admin_sistema cria porteiro');
SELECT is((SELECT usuario_id FROM public.audit_log WHERE acao = 'usuario.criar' ORDER BY seq DESC LIMIT 1), pg_temp.id('u_as'),
  'trilha usuario.criar com o ator admin_sistema');
SELECT is(pg_temp.editar('as', 'u_po', 'T14 Pedro Renomeado', NULL) -> 'usuario' ->> 'nome', 'T14 Pedro Renomeado', 'admin_sistema edita porteiro');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_desativar', 'u_po')), 'ok', 'admin_sistema desativa porteiro');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_reativar', 'u_po')), 'ok', 'admin_sistema reativa porteiro');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_redefinir_senha', 'u_po')), 'ok', 'admin_sistema redefine a senha de porteiro');
-- Permitido pelo spec (usuario.gerenciar sobre papéis não protegidos); ver o risco de personificação no relatório.
SELECT is(pg_temp.editar('as', 'u_po', NULL, 'administracao') -> 'usuario' ->> 'papel', 'administracao',
  'admin_sistema muda porteiro para administração (papel não protegido)');

-- ===== Contas protegidas: negadas ======================================================================================
SELECT is(pg_temp.erro(pg_temp.preparar('as', 't14.novo2', 'sindico')), 'SEM_PERMISSAO', 'admin_sistema não cria síndico');
SELECT is(pg_temp.erro(pg_temp.preparar('as', 't14.novo2', 'admin_sistema')), 'SEM_PERMISSAO', 'admin_sistema não prepara outro admin_sistema');
SELECT is(pg_temp.erro(pg_temp.criar('as', 't14.novo2', 'admin_sistema', 'a_novo2')), 'SEM_PERMISSAO', 'admin_sistema não cria outro admin_sistema');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_po2', NULL, 'sindico')), 'SEM_PERMISSAO', 'admin_sistema não promove a síndico');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_po2', NULL, 'admin_sistema')), 'SEM_PERMISSAO', 'admin_sistema não promove a admin_sistema');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_si', 'T14 Outro Nome', NULL)), 'SEM_PERMISSAO', 'admin_sistema não edita síndico');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_desativar', 'u_si')), 'SEM_PERMISSAO', 'admin_sistema não desativa síndico');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_redefinir_senha', 'u_si')), 'SEM_PERMISSAO', 'admin_sistema não redefine senha de síndico');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_as2', 'T14 Outro Nome', NULL)), 'SEM_PERMISSAO', 'admin_sistema não edita outro admin_sistema');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_desativar', 'u_as2')), 'SEM_PERMISSAO', 'admin_sistema não desativa outro admin_sistema');
SELECT is(pg_temp.erro(pg_temp.alvo('as', 'usuario_redefinir_senha', 'u_as2')), 'SEM_PERMISSAO', 'admin_sistema não redefine senha de outro admin_sistema');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_as', 'T14 Tito Renomeado', NULL)), 'SEM_PERMISSAO', 'admin_sistema não edita o próprio cadastro (conta protegida)');
SELECT is(pg_temp.erro(pg_temp.editar('as', 'u_as', NULL, 'sindico')), 'SEM_PERMISSAO', 'admin_sistema não se promove a síndico');
SELECT is((SELECT papel::text || '|' || nome FROM public.usuario_sistema WHERE id = pg_temp.id('u_as')), 'admin_sistema|T14 Tito Técnico',
  'nada mudou no próprio cadastro');
SELECT is((SELECT count(*) FROM public.usuario_sistema WHERE login IN ('t14.novo2')), 0::bigint, 'nenhuma conta protegida criada');

-- ===== Dado pessoal: negado ============================================================================================
SELECT is_empty($$ SELECT fn, r FROM (SELECT fn, pg_temp.como('as', chamada) r FROM rpcs) x WHERE r <> 'SEM_PERMISSAO' $$,
  'admin_sistema: toda RPC de api.* fora da sessão, do catálogo e de usuários -> SEM_PERMISSAO');
SELECT ok((SELECT count(*) FROM rpcs) >= 60, 'o laço acima cobriu as RPCs de api.*');
SELECT is(pg_temp.como('as', 'api.pessoas_listar(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não lista pessoas');
SELECT is(pg_temp.como('as', 'api.pessoa_ficha(gen_random_uuid())'), 'SEM_PERMISSAO', 'admin_sistema não abre ficha de pessoa');
SELECT is(pg_temp.como('as', 'api.busca_global(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não usa a busca global');
SELECT is(pg_temp.como('as', 'api.eventos_listar(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não lista eventos');
SELECT is(pg_temp.como('as', 'api.vinculos_listar(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não lista vínculos');
SELECT is(pg_temp.como('as', 'api.relatorio_resumo(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não vê relatório');
SELECT is(pg_temp.como('as', 'api.auditoria_alteracoes(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não vê a trilha de alterações');
SELECT is(pg_temp.como('as', 'api.auditoria_exportar(''{}''::jsonb)'), 'SEM_PERMISSAO', 'admin_sistema não exporta a auditoria');
SELECT is(pg_temp.erro(pg_temp.srv(format('srv.anexo_para_leitura(%L, gen_random_uuid(), gen_random_uuid(), NULL)', pg_temp.sid('as')))),
  'SEM_PERMISSAO', 'admin_sistema não abre anexo (documento.ver)');
SELECT is(pg_temp.erro(pg_temp.srv(format('srv.anexo_preparar(%L, gen_random_uuid())', pg_temp.sid('as')))),
  'SEM_PERMISSAO', 'admin_sistema não anexa (ocorrencia.operar)');
SELECT ok(NOT app.pode('admin_sistema', 'lgpd.exportar') AND NOT app.pode('admin_sistema', 'lgpd.anonimizar')
  AND NOT app.pode('admin_sistema', 'lgpd.retencao'), 'admin_sistema sem lgpd.* (sem RPC exposta hoje; a matriz já nega)');
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.val('as', 'api.catalogo()')) k),
  ARRAY['agrupamento', 'areasComuns', 'unidades'], 'catálogo (aberto a qualquer autenticado): só estrutura do condomínio');
SELECT is_empty($$ SELECT k FROM jsonb_array_elements(pg_temp.val('as', 'api.catalogo()') -> 'unidades') u, jsonb_object_keys(u) k
                    WHERE k NOT IN ('id', 'bloco', 'numero', 'ativo') $$, 'unidades do catálogo sem dado de morador');

-- ===== Administração continua só vendo ==================================================================================
SELECT is(pg_temp.erro(pg_temp.preparar('ad', 't14.novo3', 'porteiro')), 'SEM_PERMISSAO', 'administração não cria usuário');
SELECT is(pg_temp.erro(pg_temp.editar('ad', 'u_po2', 'T14 Outro Nome', NULL)), 'SEM_PERMISSAO', 'administração não edita usuário');

-- ===== Síndico atribui o papel ===========================================================================================
SELECT is(pg_temp.editar('si', 'u_po2', NULL, 'admin_sistema') -> 'usuario' ->> 'papel', 'admin_sistema',
  'síndico atribui admin_sistema via usuario_editar');
SELECT is(pg_temp.como('po2', 'api.sessao_atual()'), 'SESSAO_INVALIDA', 'mudar o papel revoga as sessões do alvo');
SELECT is(pg_temp.editar('si', 'u_as2', NULL, 'porteiro') -> 'usuario' ->> 'papel', 'porteiro', 'síndico retira o papel admin_sistema');
SELECT is(pg_temp.erro(pg_temp.preparar('si', 't14.novo4', 'admin_sistema')), 'ok', 'síndico prepara criar admin_sistema');

SELECT * FROM finish();
ROLLBACK;
