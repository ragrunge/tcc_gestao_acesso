-- Edição de usuário e gestão só do síndico (0039). Mesmo harness do 12 (api.* como authenticated, srv.* como service_role).
-- O que se prova: só o síndico gerencia (administração vê a lista e os totais, mas não cria, edita, desativa, reativa
-- nem redefine); srv.usuario_editar muda só os campos informados, normaliza o login e o confere contra os OUTROS
-- usuários; alvo inexistente e anonimizado recusados; ninguém muda o próprio papel; sem alteração real não há trilha;
-- com alteração, trilha 'usuario.editar' com antes e depois; mudar o papel revoga as sessões do alvo na hora; e a guarda
-- do último síndico ativo (só alcançável se a matriz der a gestão a outro papel: simulado aqui, com ROLLBACK no fim).
-- Fixtures próprias (logins t13.*). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(43);

-- ===== Fixtures ====================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_si2', 'u_ad', 'u_po', 'u_au', 'u_des', 'u_anon',
  'a_si', 'a_si2', 'a_ad', 'a_po', 'a_au', 'a_des']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'T13 Sara Síndica', 't13.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_si2'), 'T13 Sílvio Síndico', 't13.sindico2', 'sindico', false, pg_temp.id('a_si2'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'T13 Ada Admin', 't13.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'T13 Pedro Porteiro', 't13.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_au'), 'T13 Alice Auditora', 't13.auditora', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());
INSERT INTO public.usuario_sistema (id, nome, login, papel, ativo, desativado_em, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_des'), 'T13 Davi Desligado', 't13.desligado', 'porteiro', false, now(), false, pg_temp.id('a_des'), pg_temp.email());
INSERT INTO public.usuario_sistema (id, nome, login, papel, ativo, desativado_em, anonimizado_em, deve_trocar_senha) VALUES
  (pg_temp.id('u_anon'), 'Operador anonimizado', 'anonimizado-' || pg_temp.id('u_anon'), 'porteiro', false,
   now() - interval '4 years', now(), false);

-- Duas sessões do porteiro (po e po_b): mudar o papel derruba todas.
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('si2', pg_temp.id('a_si2')), ('ad', pg_temp.id('a_ad')),
  ('po', pg_temp.id('a_po')), ('po_b', pg_temp.id('a_po')), ('au', pg_temp.id('a_au'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;
CREATE FUNCTION pg_temp.sid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT sid FROM sess WHERE k = p $$;

-- ===== Harness =====================================================================================================
-- api.* como o PostgREST: authenticated + claims da sessão p_k. Resultado em jsonb ou {erro: código}.
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

-- srv.* como a Edge: service_role, com o sessao_id do ator. Resultado em jsonb ou {erro: código}.
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
CREATE FUNCTION pg_temp.editar(p_ator text, p_alvo uuid, p_nome text, p_login text, p_papel text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.usuario_editar(%L, %L, %L, %L, %L::public.papel, NULL)', pg_temp.sid(p_ator), p_alvo, p_nome, p_login, p_papel))
$$;
CREATE FUNCTION pg_temp.alvo(p_ator text, p_fn text, p_alvo text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.%s(%L, %L, NULL)', p_fn, pg_temp.sid(p_ator), pg_temp.id(p_alvo)))
$$;
CREATE FUNCTION pg_temp.trilhas(p_alvo text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.audit_log WHERE acao = 'usuario.editar' AND registro_id = pg_temp.id(p_alvo)
$$;
CREATE FUNCTION pg_temp.ultima_trilha(p_alvo text) RETURNS public.audit_log LANGUAGE sql AS $$
  SELECT * FROM public.audit_log WHERE acao = 'usuario.editar' AND registro_id = pg_temp.id(p_alvo) ORDER BY seq DESC LIMIT 1
$$;

-- ===== Só o síndico gerencia; administração só vê ====================================================================
SELECT ok(NOT (pg_temp.val('ad', 'api.usuarios_listar(''{}''::jsonb)') ? 'erro'), 'administração lista usuários (usuario.ver)');
SELECT ok(NOT (pg_temp.val('ad', 'api.usuarios_resumo()') ? 'erro'), 'administração vê os totais (usuario.ver)');
SELECT is(pg_temp.val('po', 'api.usuarios_listar(''{}''::jsonb)') ->> 'erro', 'SEM_PERMISSAO', 'porteiro não lista');
SELECT is(pg_temp.srv(format($q$srv.usuario_criar_preparar(%L, 'T13 Nova Pessoa', 't13.nova', 'porteiro')$q$, pg_temp.sid('ad'))) ->> 'erro',
  'SEM_PERMISSAO', 'administração não cria usuário');
SELECT is(pg_temp.editar('ad', pg_temp.id('u_po'), 'T13 Outro Nome', NULL, NULL) ->> 'erro', 'SEM_PERMISSAO', 'administração não edita');
SELECT is(pg_temp.alvo('ad', 'usuario_desativar', 'u_po') ->> 'erro', 'SEM_PERMISSAO', 'administração não desativa');
SELECT is(pg_temp.alvo('ad', 'usuario_reativar', 'u_des') ->> 'erro', 'SEM_PERMISSAO', 'administração não reativa');
SELECT is(pg_temp.alvo('ad', 'usuario_redefinir_senha', 'u_po') ->> 'erro', 'SEM_PERMISSAO', 'administração não redefine senha (0019 também)');
SELECT is(pg_temp.editar('po', pg_temp.id('u_au'), 'T13 Outro Nome', NULL, NULL) ->> 'erro', 'SEM_PERMISSAO', 'porteiro não edita');
SELECT is(pg_temp.editar('au', pg_temp.id('u_po'), 'T13 Outro Nome', NULL, NULL) ->> 'erro', 'SEM_PERMISSAO', 'auditor não edita');
SELECT is((SELECT nome FROM public.usuario_sistema WHERE id = pg_temp.id('u_po')), 'T13 Pedro Porteiro', 'nada mudou com as recusas');
SELECT is(pg_temp.trilhas('u_po'), 0::bigint, 'recusa não deixa trilha de edição');

-- ===== Edição feliz: nome e login ======================================================================================
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), '  T13 Pedro Novo ', ' T13.Pedro.Novo ', NULL) -> 'usuario' ->> 'login',
  't13.pedro.novo', 'síndico edita nome e login; login normalizado (aparado, minúsculo)');
SELECT is((SELECT nome || '|' || login || '|' || papel FROM public.usuario_sistema WHERE id = pg_temp.id('u_po')),
  'T13 Pedro Novo|t13.pedro.novo|porteiro', 'gravado: nome aparado, login novo, papel intacto (nulo = não muda)');
SELECT is((SELECT count(*) FROM public.sessao WHERE usuario_id = pg_temp.id('u_po') AND revogada_em IS NULL), 2::bigint,
  'mudar só nome e login não derruba as sessões do alvo');
SELECT is(pg_temp.trilhas('u_po'), 1::bigint, 'uma trilha usuario.editar');
SELECT is((SELECT usuario_id FROM pg_temp.ultima_trilha('u_po')), pg_temp.id('u_si'), 'trilha com o ator (síndico)');
SELECT is((SELECT (antes ->> 'login') || '>' || (depois ->> 'login') FROM pg_temp.ultima_trilha('u_po')), 't13.porteiro>t13.pedro.novo',
  'trilha com antes e depois (app.usuario_gestao)');
SELECT ok((SELECT position('usuarios.portaria.invalid' IN antes::text || depois::text) = 0 FROM pg_temp.ultima_trilha('u_po')),
  'trilha sem o e-mail sintético');
SELECT ok(NOT (pg_temp.editar('si', pg_temp.id('u_po'), NULL, NULL, NULL) ? 'erro'), 'tudo nulo: responde o estado atual');
SELECT ok(NOT (pg_temp.editar('si', pg_temp.id('u_po'), 'T13 Pedro Novo', 'T13.PEDRO.NOVO', 'porteiro') ? 'erro'),
  'mesmos valores (o próprio login em outra caixa não é conflito): responde sem erro');
SELECT is(pg_temp.trilhas('u_po'), 1::bigint, 'sem alteração real não há trilha nova');

-- ===== Validação e alvo ===============================================================================================
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), NULL, 'T13.AUDITORA', NULL) ->> 'erro', 'LOGIN_EXISTENTE',
  'login de outro usuário (sem caixa): 409');
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), '  ab ', NULL, NULL) ->> 'erro', 'VALIDACAO', 'nome curto: 422');
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), '', NULL, NULL) ->> 'erro', 'VALIDACAO', 'nome vazio é valor, não "não muda": 422');
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), NULL, '1pedro', NULL) ->> 'erro', 'VALIDACAO', 'login fora do formato: 422');
SELECT is(pg_temp.editar('si', gen_random_uuid(), 'T13 Ninguém', NULL, NULL) ->> 'erro', 'USUARIO_NAO_ENCONTRADO', 'alvo inexistente: 404');
SELECT is(pg_temp.editar('si', pg_temp.id('u_anon'), 'T13 Volta', NULL, NULL) ->> 'erro', 'USUARIO_ANONIMIZADO',
  'anonimizado pela retenção não é editado: 409');

-- ===== Próprio usuário =================================================================================================
SELECT is(pg_temp.editar('si', pg_temp.id('u_si'), NULL, NULL, 'administracao') ->> 'erro', 'AUTO_PAPEL', 'ninguém muda o próprio papel: 422');
SELECT is(pg_temp.editar('si', pg_temp.id('u_si'), 'T13 Sara Renomeada', 't13.sara', 'sindico') -> 'usuario' ->> 'nome', 'T13 Sara Renomeada',
  'o próprio nome e login mudam (papel igual ao atual não é mudança)');
SELECT is(pg_temp.val('si', 'api.sessao_atual()') -> 'usuario' ->> 'login', 't13.sara', 'a própria sessão continua válida com o login novo');

-- ===== Mudar o papel ===================================================================================================
SELECT is(pg_temp.editar('si', pg_temp.id('u_po'), NULL, NULL, 'auditor') -> 'usuario' ->> 'papel', 'auditor', 'síndico muda o papel de outro');
SELECT is((SELECT count(*) FROM public.sessao WHERE usuario_id = pg_temp.id('u_po') AND revogada_em IS NULL), 0::bigint,
  'mudar o papel revoga TODAS as sessões do alvo');
SELECT is((SELECT array_agg(DISTINCT motivo_revogacao) FROM public.sessao WHERE usuario_id = pg_temp.id('u_po')), ARRAY['mudanca_papel'],
  'motivo da revogação: mudanca_papel');
SELECT is(pg_temp.val('po', 'api.sessao_atual()') ->> 'erro', 'SESSAO_INVALIDA', 'o access token ainda no prazo é recusado na hora');
SELECT is((SELECT (antes ->> 'papel') || '>' || (depois ->> 'papel') FROM pg_temp.ultima_trilha('u_po')), 'porteiro>auditor',
  'trilha da mudança de papel com antes e depois');
SELECT is(pg_temp.editar('si', pg_temp.id('u_au'), NULL, NULL, 'sindico') -> 'usuario' ->> 'papel', 'sindico', 'síndico promove a síndico');
SELECT is(pg_temp.editar('si', pg_temp.id('u_si2'), NULL, NULL, 'porteiro') -> 'usuario' ->> 'papel', 'porteiro',
  'síndico rebaixa outro síndico (continua havendo síndico ativo: o próprio ator)');

-- ===== Último síndico ativo (defesa: simula a gestão dada a outro papel) =================================================
-- Hoje inalcançável pelo caminho normal (quem rebaixa é síndico ativo e não muda o próprio papel). Dentro desta
-- transação: a administração ganha usuario.gerenciar e todos os síndicos ativos, menos u_si, são desativados.
INSERT INTO public.rbac_matriz (acao, papel) VALUES ('usuario.gerenciar', 'administracao');
SELECT is(pg_temp.editar('ad', pg_temp.id('u_po'), NULL, NULL, 'sindico') ->> 'erro', 'SEM_PERMISSAO',
  'com usuario.gerenciar mas sem usuario.gerenciar_sindico: não promove a síndico');
SELECT is(pg_temp.editar('ad', pg_temp.id('u_si'), NULL, NULL, 'porteiro') ->> 'erro', 'SEM_PERMISSAO',
  'com usuario.gerenciar mas sem usuario.gerenciar_sindico: não mexe em síndico');
INSERT INTO public.rbac_matriz (acao, papel) VALUES ('usuario.gerenciar_sindico', 'administracao');
UPDATE public.usuario_sistema SET ativo = false WHERE papel = 'sindico' AND ativo AND id <> pg_temp.id('u_si');
SELECT is(pg_temp.editar('ad', pg_temp.id('u_si'), NULL, NULL, 'porteiro') ->> 'erro', 'ULTIMO_SINDICO',
  'rebaixar o único síndico ativo: 409');
SELECT is((SELECT papel::text FROM public.usuario_sistema WHERE id = pg_temp.id('u_si')), 'sindico', 'o último síndico continua síndico');
SELECT ok(NOT (pg_temp.editar('ad', pg_temp.id('u_si'), 'T13 Sara de Novo', NULL, NULL) ? 'erro'),
  'o último síndico pode ter o nome editado (a guarda é só do papel)');

SELECT * FROM finish();
ROLLBACK;
