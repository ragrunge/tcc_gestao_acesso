-- Primeiro síndico (0034): só com usuario_sistema vazia, uma vez, só service_role, sem estado parcial e sob trava.
-- O banco local tem o seed: para o caso "vazio", os usuários são apagados DENTRO desta transação com
-- session_replication_role = replica (as FKs da trilha não disparam) e tudo volta no ROLLBACK.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

CREATE FUNCTION pg_temp.como(p_papel text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
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
CREATE FUNCTION pg_temp.srv(p_sql text) RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.como('service_role', p_sql) $$;
CREATE FUNCTION pg_temp.criar(p_login text, p_email text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.srv(format($q$SELECT srv.bootstrap_sindico_criar('Sônia Síndica', %L, %L, %L)$q$, p_login,
    gen_random_uuid(), coalesce(p_email, 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid')))
$$;
CREATE FUNCTION pg_temp.trilha() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.audit_log WHERE acao = 'usuario.criar' AND depois ->> 'origem' = 'bootstrap'
$$;

-- ===== Superfície ======================================================================================================
SELECT ok(p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] AND pg_get_userbyid(p.proowner) = 'app_rw',
  format('%s: SECURITY DEFINER, search_path vazio, dono app_rw', p.oid::regprocedure))
  FROM pg_proc p WHERE p.oid IN ('srv.bootstrap_sindico_preparar(text, text)'::regprocedure,
                                 'srv.bootstrap_sindico_criar(text, text, uuid, text)'::regprocedure) ORDER BY p.proname;
SELECT ok(NOT has_function_privilege(r, f, 'EXECUTE'), format('%s não executa %s', r, f))
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['srv.bootstrap_sindico_preparar(text, text)', 'srv.bootstrap_sindico_criar(text, text, uuid, text)',
                    'app.bootstrap_exigir_vazio()']) f ORDER BY r, f;
SELECT ok(has_function_privilege('service_role', f, 'EXECUTE'), format('service_role executa %s', f))
  FROM unnest(ARRAY['srv.bootstrap_sindico_preparar(text, text)', 'srv.bootstrap_sindico_criar(text, text, uuid, text)']) f ORDER BY f;
SELECT ok(NOT has_function_privilege('service_role', 'app.bootstrap_exigir_vazio()', 'EXECUTE'), 'service_role não alcança o helper app.*');
SELECT is(pg_temp.como('anon', $$SELECT srv.bootstrap_sindico_criar('Ana Anon', 'ana.anon', gen_random_uuid(), 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid')$$),
  '42501', 'anon chamando a criar: permissão negada');
SELECT is(pg_temp.como('authenticated', $$SELECT srv.bootstrap_sindico_preparar('Ana Auth', 'ana.auth')$$),
  '42501', 'authenticated chamando a preparar: permissão negada');

-- ===== Com usuários (o seed): recusa nas duas, sem gravar ==================================================================
SELECT ok(EXISTS (SELECT 1 FROM public.usuario_sistema), 'pré-condição: há usuários do seed');
SELECT is(pg_temp.srv($$SELECT srv.bootstrap_sindico_preparar('Sônia Síndica', 'sonia.sindica')$$), 'SISTEMA_JA_INICIADO',
  'preparar com usuário existente: recusa');
SELECT is(pg_temp.criar('sonia.sindica'), 'SISTEMA_JA_INICIADO', 'criar com usuário existente: recusa');
SELECT is(pg_temp.trilha(), 0::bigint, 'recusa não grava trilha');

-- ===== Sistema vazio ======================================================================================================
SET LOCAL session_replication_role = replica;
DELETE FROM public.usuario_sistema;
SET LOCAL session_replication_role = origin;

SELECT ok(pg_temp.srv($$SELECT srv.bootstrap_sindico_preparar('Sônia Síndica', 'sonia.sindica')$$) = 'ok', 'preparar com o sistema vazio: aceita');
SET LOCAL ROLE service_role;
SELECT ok(srv.bootstrap_sindico_preparar('Sônia Síndica', 'sonia.sindica') ->> 'auth_email' ~
  '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@usuarios\.portaria\.invalid$', 'preparar sorteia o e-mail sintético');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.usuario_sistema), 0::bigint, 'preparar não grava nada');

-- Falhas na criar: nada fica gravado (nem usuário nem trilha).
SELECT is(pg_temp.criar('Sô'), 'VALIDACAO', 'login inválido: recusa');
SELECT is(pg_temp.criar('sonia.sindica', 'sonia@exemplo.com'), '23514', 'e-mail fora do formato sintético: recusa pelo CHECK');
SELECT is(pg_temp.srv($$SELECT srv.bootstrap_sindico_criar('Sônia Síndica', 'sonia.sindica', NULL, NULL)$$), 'VALIDACAO',
  'sem conta do Auth: recusa');
SELECT is((SELECT count(*) FROM public.usuario_sistema), 0::bigint, 'nenhuma falha deixou usuário');
SELECT is(pg_temp.trilha(), 0::bigint, 'nenhuma falha deixou trilha');

-- Sucesso.
SELECT is(pg_temp.criar('  Sonia.Sindica '), 'ok', 'criar com o sistema vazio: aceita');
SELECT results_eq($$SELECT nome, login, papel::text, ativo, deve_trocar_senha, senha_temporaria_expira_em IS NULL FROM public.usuario_sistema$$,
  $$VALUES ('Sônia Síndica', 'sonia.sindica', 'sindico', true, false, true)$$,
  'um usuário só: síndico ativo, login normalizado, sem troca obrigatória');
SELECT ok(EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = pg_backend_pid() AND l.relation = 'public.usuario_sistema'::regclass
  AND l.mode = 'ShareRowExclusiveLock' AND l.granted), 'a criar trava a tabela (SHARE ROW EXCLUSIVE) até o fim da transação');
SELECT results_eq($$SELECT usuario_id, usuario_nome, usuario_papel::text, entidade, registro_id = (SELECT id FROM public.usuario_sistema),
    depois ->> 'papel', depois ->> 'login' FROM public.audit_log WHERE acao = 'usuario.criar' AND depois ->> 'origem' = 'bootstrap'$$,
  $$VALUES (NULL::uuid, '(instalação)', NULL::text, 'usuario_sistema', true, 'sindico', 'sonia.sindica')$$,
  'trilha usuario.criar sem ator, com o usuário criado (mesmo formato da usuarios-admin)');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.audit_log WHERE (coalesce(antes::text, '') || coalesce(depois::text, '')) ~ 'auth_email|@usuarios\.portaria'),
  'trilha sem o e-mail sintético (a senha nunca chega ao banco)');

-- Segunda execução.
SELECT is(pg_temp.srv($$SELECT srv.bootstrap_sindico_preparar('Outro Síndico', 'outro.sindico')$$), 'SISTEMA_JA_INICIADO', 'segunda preparar: recusa');
SELECT is(pg_temp.criar('outro.sindico'), 'SISTEMA_JA_INICIADO', 'segunda criar: recusa');
SELECT is((SELECT count(*) FROM public.usuario_sistema), 1::bigint, 'continua um usuário só');

SELECT * FROM finish();
ROLLBACK;
