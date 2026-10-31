-- Superfície exposta (desenho §3.4, item 1): o que anon/authenticated/service_role alcançam nos schemas do sistema.
-- Fail-closed: a allowlist de funções começa VAZIA na F0. Quando a F1 criar RPCs em `api`, cada uma entra aqui de
-- propósito (por exemplo, `api.selos_publicos()` para anon). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

-- Allowlist explícita: (papel, função) que PODE ter EXECUTE. Vazia na F0.
CREATE TEMP TABLE allowlist_execute (papel name, funcao regprocedure) ON COMMIT DROP;

CREATE TEMP VIEW papeis_api AS SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']::name[]) AS papel;
CREATE TEMP VIEW schemas_sistema AS SELECT unnest(ARRAY['public', 'api', 'srv']::name[]) AS nsp;

-- ===== Tabelas, colunas e sequências ==============================================================================
SELECT is_empty($$
  SELECT p.papel, c.oid::regclass FROM pg_class c CROSS JOIN papeis_api p
   WHERE c.relnamespace::regnamespace::name IN (SELECT nsp FROM schemas_sistema) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND (has_table_privilege(p.papel, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(p.papel, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
$$, 'nenhuma tabela/view dos schemas do sistema tem privilégio (nem de coluna) para anon/authenticated/service_role');

SELECT is_empty($$
  SELECT p.papel, c.oid::regclass FROM pg_class c CROSS JOIN papeis_api p
   WHERE c.relnamespace::regnamespace::name IN (SELECT nsp FROM schemas_sistema) AND c.relkind = 'S'
     AND has_sequence_privilege(p.papel, c.oid, 'USAGE,SELECT,UPDATE')
$$, 'nenhuma sequência dos schemas do sistema é acessível para anon/authenticated/service_role');

-- ===== Funções ====================================================================================================
SELECT is_empty($$
  SELECT p.papel, f.oid::regprocedure FROM pg_proc f CROSS JOIN papeis_api p
   WHERE f.pronamespace::regnamespace::name IN (SELECT nsp FROM schemas_sistema)
     AND p.papel IN ('anon', 'authenticated')
     AND has_function_privilege(p.papel, f.oid, 'EXECUTE')
  EXCEPT SELECT papel, funcao FROM allowlist_execute
$$, 'toda função executável por anon/authenticated está na allowlist (vazia na F0)');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'public'::regnamespace AND has_function_privilege('service_role', f.oid, 'EXECUTE')
$$, 'service_role não executa nenhuma função do public (só alcançará srv.*)');

-- ===== RLS como contenção =========================================================================================
SELECT is_empty($$
  SELECT c.oid::regclass FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
$$, 'RLS habilitada em todas as tabelas do public');

SELECT is_empty($$
  SELECT pol.polrelid::regclass, pol.polname FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
   WHERE c.relnamespace::regnamespace::name IN (SELECT nsp FROM schemas_sistema)
     AND (0::oid = ANY (pol.polroles) OR 'anon'::regrole = ANY (pol.polroles) OR 'authenticated'::regrole = ANY (pol.polroles))
$$, 'nenhuma política de RLS para PUBLIC/anon/authenticated (deny-all)');

-- ===== Schemas ====================================================================================================
SELECT is_empty($$
  SELECT p.papel FROM (SELECT papel FROM papeis_api UNION ALL SELECT 'app_rw') p
   WHERE has_schema_privilege(p.papel, 'public', 'CREATE')
$$, 'ninguém além do dono tem CREATE no public');

SELECT ok(NOT has_schema_privilege('anon', 'srv', 'USAGE') AND NOT has_schema_privilege('authenticated', 'srv', 'USAGE'),
  'srv sem USAGE para anon/authenticated');

-- ===== Papéis e posse ============================================================================================
SELECT ok((SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole FROM pg_roles WHERE rolname = 'app_rw'),
  'app_rw é NOLOGIN, sem superusuário, BYPASSRLS ou CREATEROLE');
SELECT ok(pg_has_role('postgres', 'app_rw', 'MEMBER'), 'postgres é membro de app_rw (para passar a posse das funções de api/srv)');
SELECT ok(NOT pg_has_role('authenticated', 'app_rw', 'MEMBER') AND NOT pg_has_role('anon', 'app_rw', 'MEMBER')
  AND NOT pg_has_role('service_role', 'app_rw', 'MEMBER'), 'nenhum papel do PostgREST herda app_rw');

SELECT is_empty($$
  SELECT c.oid::regclass FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'S') AND c.relowner <> 'postgres'::regrole
$$, 'tabelas e sequências do public têm dono postgres (é o que o trigger append-only confere)');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'public'::regnamespace
     AND (f.proname LIKE 'lgpd\_%' OR f.proname LIKE 'retencao\_%' OR f.proname = 'evento_acesso_antes_inserir')
     AND f.prosecdef AND f.proowner <> 'postgres'::regrole
$$, 'funções controladas SECURITY DEFINER (lgpd_*, retencao_*, evento_acesso_antes_inserir) têm dono postgres');

-- app_rw 1:1 com a 0015: mantém o EXECUTE herdado nos helpers e continua sem o das funções internas.
SELECT ok(has_function_privilege('app_rw', 'canon_texto(text)', 'EXECUTE')
      AND has_function_privilege('app_rw', 'retencao_descartar_eventos(bigint)', 'EXECUTE')
      AND NOT has_function_privilege('app_rw', 'retencao_descartar_prefixo(bigint)', 'EXECUTE')
      AND NOT has_function_privilege('app_rw', 'evento_acesso_antes_inserir()', 'EXECUTE'),
  'app_rw: helpers e procedimentos com prazo sim; descarte interno e trigger da cadeia não');

-- ===== Objeto futuro falha fechado (default privileges) ===========================================================
CREATE TABLE public.f0_tabela_nova (id serial PRIMARY KEY);
CREATE FUNCTION public.f0_fn_nova() RETURNS int LANGUAGE sql AS 'SELECT 1';
CREATE FUNCTION api.f0_rpc_nova() RETURNS int LANGUAGE sql AS 'SELECT 1';
CREATE FUNCTION srv.f0_rpc_nova() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT is_empty($$
  SELECT p.papel FROM papeis_api p
   WHERE has_table_privilege(p.papel, 'public.f0_tabela_nova', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_sequence_privilege(p.papel, 'public.f0_tabela_nova_id_seq', 'USAGE,SELECT,UPDATE')
$$, 'tabela e sequência novas no public nascem sem GRANT para anon/authenticated/service_role');

SELECT is_empty($$
  SELECT p.papel, f FROM papeis_api p
   CROSS JOIN unnest(ARRAY['public.f0_fn_nova()', 'api.f0_rpc_nova()', 'srv.f0_rpc_nova()']::regprocedure[]) f
   WHERE has_function_privilege(p.papel, f, 'EXECUTE')
$$, 'função nova (public, api, srv) criada por postgres nasce sem EXECUTE para PUBLIC/anon/authenticated/service_role');

-- Modelo da F1: a migração cria a RPC e passa a posse ao app_rw (SECURITY DEFINER roda como app_rw, com os GRANTs da 0001).
SELECT lives_ok('ALTER FUNCTION api.f0_rpc_nova() OWNER TO app_rw', 'postgres consegue passar a posse de função de api ao app_rw');
SELECT ok(NOT has_function_privilege('authenticated', 'api.f0_rpc_nova()', 'EXECUTE'),
  'depois de mudar de dono, a RPC continua sem EXECUTE até o GRANT explícito');

SET LOCAL ROLE app_rw;
CREATE FUNCTION api.f0_rpc_do_app_rw() RETURNS int LANGUAGE sql AS 'SELECT 1';
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'api.f0_rpc_do_app_rw()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'api.f0_rpc_do_app_rw()', 'EXECUTE'),
  'função criada pelo próprio app_rw também nasce sem EXECUTE para PUBLIC');

SELECT * FROM finish();
ROLLBACK;
