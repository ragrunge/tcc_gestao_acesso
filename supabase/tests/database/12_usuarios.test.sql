-- Tela de Usuários (0038) e as regras da gestão que ela espelha (0018). Mesmo harness do 11.
-- O que se prova: RBAC (usuario.gerenciar) antes da validação, validação dos parâmetros, item sem auth_user_id nem
-- e-mail sintético, filtros (papel, situação, busca sem acento e com curinga escapado), `total` igual ao percurso das
-- páginas (deslocamento e cursor na mesma ordem), resumo batendo com o `total`, anonimizado fora da lista, e a
-- invariante "o sistema nunca fica sem síndico ativo" pelas srv.usuario_desativar: ninguém desativa a si mesmo, só o
-- síndico desativa síndico e o desativado perde a sessão na hora (não desativa o outro de volta).
-- Fixtures próprias (logins t12.*). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(35);

-- ===== Fixtures ====================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_si2', 'u_ad', 'u_po', 'u_au', 'u_des', 'u_anon',
  'a_si', 'a_si2', 'a_ad', 'a_po', 'a_au', 'a_des']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'T12 Sara Síndica', 't12.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_si2'), 'T12 Sílvio Síndico', 't12.sindico2', 'sindico', false, pg_temp.id('a_si2'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'T12 Ada Admin', 't12.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'T12 Pedro Porteiro', 't12.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_au'), 'T12 Alice Auditora', 't12.auditora', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());
INSERT INTO public.usuario_sistema (id, nome, login, papel, ativo, desativado_em, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_des'), 'T12 Davi Desligado', 't12.desligado', 'porteiro', false, now(), false, pg_temp.id('a_des'), pg_temp.email());
INSERT INTO public.usuario_sistema (id, nome, login, papel, ativo, desativado_em, anonimizado_em, deve_trocar_senha) VALUES
  (pg_temp.id('u_anon'), 'Operador anonimizado', 'anonimizado-' || pg_temp.id('u_anon'), 'porteiro', false,
   now() - interval '4 years', now(), false);

CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('si2', pg_temp.id('a_si2')), ('ad', pg_temp.id('a_ad')),
  ('po', pg_temp.id('a_po')), ('au', pg_temp.id('a_au'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;
CREATE FUNCTION pg_temp.sid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT sid FROM sess WHERE k = p $$;

-- ===== Harness (o do 11) ===========================================================================================
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
CREATE FUNCTION pg_temp.listar(p_k text, p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.val(p_k, format('api.usuarios_listar(%L::jsonb)', p::text)) $$;
CREATE FUNCTION pg_temp.resumo(p_k text) RETURNS jsonb LANGUAGE sql AS $$ SELECT pg_temp.val(p_k, 'api.usuarios_resumo()') $$;
CREATE FUNCTION pg_temp.logins(r jsonb) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(x ->> 'login' ORDER BY x ->> 'login'), '{}') FROM jsonb_array_elements(r -> 'itens') x $$;

-- srv.usuario_desativar como a Edge chama (service_role): 'ok' ou o código do erro.
CREATE FUNCTION pg_temp.desativar(p_ator text, p_alvo text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s uuid := pg_temp.sid(p_ator); alvo uuid := pg_temp.id(p_alvo);
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM srv.usuario_desativar(s, alvo, NULL);
    RESET ROLE;
    RETURN 'ok';
  EXCEPTION WHEN SQLSTATE 'PGRST' THEN
    RESET ROLE;
    RETURN (SQLERRM::jsonb) ->> 'code';
  END;
END $$;

-- Percursos completos (filtro t12) por deslocamento e por cursor, em ids.
CREATE FUNCTION pg_temp.por_deslocamento(p_lim integer) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE r jsonb; d integer := 0; acc uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR volta IN 1..100 LOOP
    r := pg_temp.listar('si', jsonb_build_object('q', 't12', 'limite', p_lim, 'deslocamento', d));
    IF r ? 'erro' THEN RAISE EXCEPTION 'erro na página: %', r; END IF;
    acc := acc || ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(r -> 'itens') x);
    EXIT WHEN NOT (r ->> 'temMais')::boolean;
    d := d + p_lim;
  END LOOP;
  RETURN acc;
END $$;
CREATE FUNCTION pg_temp.por_cursor(p_lim integer) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE r jsonb; cur text; acc uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR volta IN 1..100 LOOP
    r := pg_temp.listar('si', jsonb_build_object('q', 't12', 'limite', p_lim) || CASE WHEN cur IS NOT NULL THEN jsonb_build_object('cursor', cur) ELSE '{}' END);
    IF r ? 'erro' THEN RAISE EXCEPTION 'erro na página: %', r; END IF;
    acc := acc || ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(r -> 'itens') x);
    EXIT WHEN NOT (r ->> 'temMais')::boolean;
    cur := r ->> 'cursor';
  END LOOP;
  RETURN acc;
END $$;

-- ===== RBAC (antes de qualquer validação) ==========================================================================
SELECT ok(NOT (pg_temp.listar('si') ? 'erro'), 'síndico lista usuários');
SELECT ok(NOT (pg_temp.listar('ad') ? 'erro'), 'administração lista usuários');
SELECT is(pg_temp.listar('po') ->> 'erro', 'SEM_PERMISSAO', 'porteiro não lista usuários');
SELECT is(pg_temp.listar('au') ->> 'erro', 'SEM_PERMISSAO', 'auditor não lista usuários');
SELECT is(pg_temp.resumo('po') ->> 'erro', 'SEM_PERMISSAO', 'porteiro não vê o resumo');
SELECT is(pg_temp.resumo('au') ->> 'erro', 'SEM_PERMISSAO', 'auditor não vê o resumo');
SELECT is(pg_temp.listar('ninguem') ->> 'erro', 'NAO_AUTENTICADO', 'sem JWT: 401 antes de tudo');
SELECT is(pg_temp.listar('po', '{"limite": 999, "papel": "x"}') ->> 'erro', 'SEM_PERMISSAO',
  'RBAC vem antes da validação (sem permissão, nem o erro de parâmetro aparece)');

-- ===== Validação ===================================================================================================
SELECT is(pg_temp.listar('si', '{"limite": 101}') ->> 'erro', 'VALIDACAO', 'limite acima de 100: 400');
SELECT is(pg_temp.listar('si', jsonb_build_object('cursor', pg_temp.id('u_si'), 'deslocamento', 0)) ->> 'erro', 'VALIDACAO',
  'cursor e deslocamento juntos: 400');
SELECT is(pg_temp.listar('si', '{"papel": "zelador"}') ->> 'erro', 'VALIDACAO', 'papel fora da lista: 400');
SELECT is(pg_temp.listar('si', '{"situacao": "todos"}') ->> 'erro', 'VALIDACAO', 'situação fora da lista: 400');
SELECT is(pg_temp.listar('si', jsonb_build_object('q', repeat('a', 101))) ->> 'erro', 'VALIDACAO', 'busca com mais de 100 caracteres: 400');
SELECT is(pg_temp.listar('si', jsonb_build_object('cursor', pg_temp.id('u_anon'))) ->> 'erro', 'CURSOR_INVALIDO',
  'cursor de usuário anonimizado (fora da lista) é inválido');

-- ===== Formato do item =============================================================================================
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pg_temp.listar('si', '{"q": "t12.admin"}') -> 'itens' -> 0) k),
  ARRAY['ativo', 'deveTrocarSenha', 'id', 'login', 'nome', 'papel', 'senhaTemporariaExpiraEm', 'ultimoAcesso'],
  'item = app.usuario_gestao: sem auth_user_id, sem e-mail sintético');
SELECT ok(position('usuarios.portaria.invalid' IN pg_temp.listar('si', '{"q": "t12", "limite": 100}')::text) = 0,
  'nenhum e-mail sintético na resposta');

-- ===== Filtros =====================================================================================================
SELECT is(pg_temp.logins(pg_temp.listar('si', '{"q": "t12"}')),
  ARRAY['t12.admin', 't12.auditora', 't12.desligado', 't12.porteiro', 't12.sindica', 't12.sindico2'],
  'sem filtro de situação: ativos e desativados; anonimizado fora');
SELECT is(pg_temp.logins(pg_temp.listar('si', '{"q": "t12", "papel": "porteiro"}')), ARRAY['t12.desligado', 't12.porteiro'],
  'filtro por papel');
SELECT is(pg_temp.logins(pg_temp.listar('si', '{"q": "t12", "situacao": "desativados"}')), ARRAY['t12.desligado'],
  'filtro por situação: desativados');
SELECT is(pg_temp.logins(pg_temp.listar('si', '{"q": "  T12 SARA SÍNDICA "}')), ARRAY['t12.sindica'],
  'busca pelo nome sem acento, sem caixa e aparada');
SELECT is(pg_temp.listar('si', '{"q": "t12%"}') -> 'itens', '[]'::jsonb, 'curinga do LIKE na busca é literal');
SELECT is((pg_temp.listar('si', '{"q": "t12", "limite": 2}') ->> 'total')::int, 6, 'total conta o conjunto filtrado, não a página');

-- ===== Páginas =====================================================================================================
SELECT is(cardinality(pg_temp.por_deslocamento(2)), 6, 'percurso por deslocamento: todas as linhas');
SELECT is(pg_temp.por_deslocamento(2), pg_temp.por_cursor(2), 'deslocamento e cursor devolvem a mesma sequência');
SELECT is((SELECT count(DISTINCT x) FROM unnest(pg_temp.por_deslocamento(4)) x)::int, 6, 'sem linha repetida entre páginas');

-- ===== Resumo = total da listagem ==================================================================================
SELECT is((pg_temp.resumo('ad') ->> 'ativos')::bigint, (pg_temp.listar('ad', '{"situacao": "ativos"}') ->> 'total')::bigint,
  'resumo.ativos = total dos ativos');
SELECT is((pg_temp.resumo('ad') ->> 'desativados')::bigint, (pg_temp.listar('ad', '{"situacao": "desativados"}') ->> 'total')::bigint,
  'resumo.desativados = total dos desativados (anonimizado não conta)');
SELECT is((pg_temp.resumo('ad') -> 'porPapel' ->> 'sindico')::bigint,
  (pg_temp.listar('ad', '{"situacao": "ativos", "papel": "sindico"}') ->> 'total')::bigint, 'resumo.porPapel.sindico = síndicos ativos');
SELECT is((pg_temp.resumo('ad') -> 'porPapel' ->> 'porteiro')::bigint,
  (pg_temp.listar('ad', '{"situacao": "ativos", "papel": "porteiro"}') ->> 'total')::bigint, 'resumo.porPapel.porteiro = porteiros ativos');

-- ===== Nunca sem síndico ativo (srv.usuario_desativar, 0018) =======================================================
SELECT is(pg_temp.desativar('si', 'u_si'), 'AUTO_DESATIVACAO', 'síndico não desativa a si mesmo');
SELECT is(pg_temp.desativar('ad', 'u_si'), 'SEM_PERMISSAO', 'administração não desativa síndico');
SELECT is(pg_temp.desativar('ad', 'u_ad'), 'AUTO_DESATIVACAO', 'administração não desativa a si mesma');
SELECT is(pg_temp.desativar('si', 'u_si2'), 'ok', 'síndico desativa outro síndico');
SELECT is(pg_temp.desativar('si2', 'u_si'), 'SESSAO_INVALIDA', 'o síndico desativado perdeu a sessão: não desativa o outro de volta');
SELECT ok((SELECT ativo FROM public.usuario_sistema WHERE id = pg_temp.id('u_si')), 'quem desativou continua ativo (síndico ativo garantido)');

SELECT * FROM finish();
ROLLBACK;
