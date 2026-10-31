-- 0016 — Endurecimento para o Supabase (desenho §3.2, F0). Nova: não existe no legado Drizzle.
-- Problema: o Supabase concede, por default privileges de `postgres` no schema public, ALL em tabelas,
-- sequências e funções a anon/authenticated/service_role, e o Postgres dá EXECUTE a PUBLIC em toda função nova.
-- Com isso, os GRANTs mínimos da 0001 (camada 1) deixam de ser fail-closed para os papéis do PostgREST.
-- O que esta migração faz, nesta ordem:
--   1. schemas `api` (RPCs do front) e `srv` (RPCs das Edge Functions), vazios na F0;
--   2. `GRANT app_rw TO postgres`, para que as migrações futuras criem funções e passem a posse ao app_rw;
--   3. tira de anon/authenticated/service_role todo privilégio em tabela, sequência e função do public,
--      preservando 1:1 o que o app_rw podia executar antes (explícito em vez de herdado de PUBLIC);
--   4. default privileges: objeto futuro não herda GRANT para anon/authenticated/service_role nem EXECUTE para PUBLIC;
--   5. RLS em todas as tabelas do public, com política só para app_rw (deny-all para os demais);
--   6. `CREATE` no public só para o dono.
-- A posse das tabelas e das funções controladas (lgpd_*, retencao_*, evento_acesso_antes_inserir) continua com
-- `postgres`: é o que faz o trigger append-only abrir a exceção só dentro delas (current_user = dono + GUC).
-- O teste supabase/tests/database/01_superficie.test.sql prova o resultado.

-- ===== 1. Schemas api e srv ===================================================================================
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS srv;
REVOKE ALL ON SCHEMA api, srv FROM PUBLIC;
-- USAGE sozinho não expõe nada: sem função com EXECUTE explícito, não há RPC chamável.
GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA srv TO service_role;
-- app_rw será o dono das funções de api/srv (F1+): ALTER FUNCTION ... OWNER TO app_rw exige CREATE no schema.
GRANT USAGE, CREATE ON SCHEMA api, srv TO app_rw;

-- ===== 2. postgres membro de app_rw ===========================================================================
-- Necessário para ALTER ... OWNER TO app_rw e para ALTER DEFAULT PRIVILEGES FOR ROLE app_rw (abaixo).
-- O postgres do Supabase não é superusuário, mas tem CREATEROLE; no PG16+ quem cria o papel recebe ADMIN sobre ele.
-- Não dá nada a mais ao postgres: ele já é dono de todas as tabelas.
GRANT app_rw TO postgres;

-- ===== 3. public fora da superfície ===========================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

-- Funções: revogar só de anon/authenticated não basta, porque eles herdam o EXECUTE de PUBLIC.
-- Antes de revogar de PUBLIC, concede ao app_rw o EXECUTE que ele tinha por herança (helpers como canon_* e
-- lgpd_limpeza_controlada, chamados por triggers que rodam como o invocador). Assim o app_rw fica 1:1 com a 0015,
-- e as funções revogadas de PUBLIC na 0001/0004/0005/0007 continuam sem EXECUTE para ele.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') -- fora de extensão
       AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_rw', f);
  END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

-- ===== 4. Default privileges: objeto futuro falha fechado ======================================================
-- Os defaults do Supabase são POR SCHEMA (FOR ROLE postgres IN SCHEMA public); REVOKE por schema remove essas
-- entradas. O EXECUTE de PUBLIC em função é default GLOBAL do Postgres e só sai com ALTER DEFAULT PRIVILEGES
-- sem IN SCHEMA (um REVOKE por schema não remove default global).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_rw   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ===== 5. RLS como contenção (desenho §3.1) ====================================================================
-- Habilitada em todas as tabelas do public. Política só para app_rw, que não é dono e não tem BYPASSRLS: sem ela, o
-- app_rw perderia todo acesso. A política é USING (true): quem limita o app_rw continua sendo o GRANT (camada 1).
-- Sem política para anon/authenticated: um GRANT esquecido não devolve linha. O dono (postgres) não é afetado
-- (sem FORCE), então as funções SECURITY DEFINER e os triggers de cadeia seguem iguais.
DO $$
DECLARE t regclass;
BEGIN
  FOR t IN SELECT c.oid::regclass FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY app_rw_acesso ON %s TO app_rw USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ===== 6. CREATE no public =====================================================================================
-- 0001 já revogou de PUBLIC; aqui explícito para os papéis do Supabase (com search_path pg_catalog, public, pg_temp
-- nas funções SECURITY DEFINER, CREATE no public seria sequestro de nome).
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
