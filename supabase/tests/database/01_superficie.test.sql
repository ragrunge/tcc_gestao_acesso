-- Superfície exposta (desenho §3.4, item 1): o que anon/authenticated/service_role alcançam nos schemas do sistema.
-- Fail-closed: cada função que anon/authenticated/service_role podem executar entra na allowlist DE PROPÓSITO.
-- F0: vazia. F1: as duas RPCs de sessão do front (authenticated) e as srv.* das Edge Functions (service_role).
-- F2: as RPCs da portaria (authenticated). F3: as de operação (vínculos, encomendas, ocorrências, funcionários, cadastros,
-- auditoria, relatórios e importação), mesmo critério. Justificativa de cada uma: é o contrato do front (src/api/types.ts) e começa
-- por app.exigir(ação) (ou app.ator(), no catálogo), conferido abaixo; nenhuma devolve documento_busca nem telefone completo.
-- Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(31);

-- Allowlist explícita: (papel, função) que PODE ter EXECUTE. anon: nenhuma ainda (api.selos_publicos é da F5).
CREATE TEMP TABLE allowlist_execute (papel name, funcao regprocedure) ON COMMIT DROP;
INSERT INTO allowlist_execute VALUES
  ('authenticated', 'api.sessao_atual()'),
  ('authenticated', 'api.sessao_encerrar()'),
  -- F2, catálogo e unidades (unidade.ver; catálogo: só sessão)
  ('authenticated', 'api.catalogo()'), ('authenticated', 'api.unidades_listar(jsonb)'), ('authenticated', 'api.unidade_detalhe(text)'),
  -- F2, vínculos só leitura (unidade.ver / vinculo.ver)
  ('authenticated', 'api.vinculos_autorizadores(uuid)'), ('authenticated', 'api.vinculos_contar(text)'), ('authenticated', 'api.vinculos_listar(jsonb)'),
  -- F2, busca e pessoas (pessoa.ver, pessoa.cadastrar_*, pessoa.desativar, evento.registrar para a escala)
  ('authenticated', 'api.pessoas_buscar(jsonb)'), ('authenticated', 'api.busca_global(jsonb)'), ('authenticated', 'api.pessoas_listar(jsonb)'),
  ('authenticated', 'api.pessoa_ficha(uuid)'), ('authenticated', 'api.pessoa_funcionario(uuid)'), ('authenticated', 'api.pessoa_criar(jsonb)'),
  ('authenticated', 'api.pessoa_desativar(uuid, text)'), ('authenticated', 'api.pessoa_reativar(uuid)'),
  -- F2, registro de acesso (evento.registrar / evento.retroativo / evento.corrigir / evento.ver / turno.ver)
  ('authenticated', 'api.evento_entrada(jsonb)'), ('authenticated', 'api.evento_recusa(jsonb)'), ('authenticated', 'api.evento_saida(uuid, jsonb)'),
  ('authenticated', 'api.evento_corrigir(uuid, jsonb)'), ('authenticated', 'api.evento_prorrogar(uuid)'), ('authenticated', 'api.eventos_listar(jsonb)'),
  ('authenticated', 'api.evento_obter(uuid)'), ('authenticated', 'api.evento_correcoes(uuid)'), ('authenticated', 'api.eventos_presentes()'),
  ('authenticated', 'api.evento_ultimo_veiculo(uuid)'), ('authenticated', 'api.turno_resumo()'),
  -- F2, autorizações prévias e restrições (autorizacao.criar / autorizacao.area_comum / restricao.* / unidade.ver / unidade.editar)
  ('authenticated', 'api.autorizacao_criar(jsonb)'), ('authenticated', 'api.autorizacao_revogar(uuid)'),
  ('authenticated', 'api.autorizacoes_vigentes(uuid, uuid, boolean)'), ('authenticated', 'api.autorizacoes_hoje()'),
  ('authenticated', 'api.autorizacoes_previstas(integer)'), ('authenticated', 'api.restricao_verificar(uuid, uuid)'),
  ('authenticated', 'api.restricao_criar(jsonb)'), ('authenticated', 'api.restricao_aprovar(uuid)'), ('authenticated', 'api.restricao_revogar(uuid)'),
  ('authenticated', 'api.restricoes_pendentes()'),
  -- F3, vínculos: escrita (vinculo.criar / vinculo.decidir)
  ('authenticated', 'api.vinculo_criar(jsonb)'), ('authenticated', 'api.vinculo_conferir(uuid, jsonb)'), ('authenticated', 'api.vinculo_aprovar(uuid)'),
  ('authenticated', 'api.vinculo_rejeitar(uuid, jsonb)'), ('authenticated', 'api.vinculo_regularizar(uuid, jsonb)'), ('authenticated', 'api.vinculo_encerrar(uuid, jsonb)'),
  -- F3, encomendas (encomenda.ver / encomenda.operar / encomenda.autorizar_retirada)
  ('authenticated', 'api.encomendas_listar(jsonb)'), ('authenticated', 'api.encomendas_resumo(integer)'), ('authenticated', 'api.encomenda_obter(uuid)'),
  ('authenticated', 'api.encomenda_receber(jsonb)'), ('authenticated', 'api.encomenda_entregar(uuid, uuid)'), ('authenticated', 'api.encomenda_autorizar_retirada(uuid, jsonb)'),
  -- F3, ocorrências sem anexo (ocorrencia.ver / ocorrencia.operar)
  ('authenticated', 'api.ocorrencias_listar(jsonb)'), ('authenticated', 'api.ocorrencia_obter(uuid)'), ('authenticated', 'api.ocorrencia_criar(jsonb)'),
  ('authenticated', 'api.ocorrencia_alterar_status(uuid, text)'), ('authenticated', 'api.ocorrencia_vincular_eventos(uuid, jsonb)'),
  -- F3, funcionários (funcionario.ver / funcionario.gerenciar)
  ('authenticated', 'api.funcionarios_listar(jsonb)'), ('authenticated', 'api.funcionario_criar(jsonb)'), ('authenticated', 'api.funcionario_editar(uuid, jsonb)'),
  -- F3, cadastros (veiculo.cadastrar / pessoa.editar / unidade.editar)
  ('authenticated', 'api.veiculo_criar(jsonb)'), ('authenticated', 'api.veiculo_editar(uuid, jsonb)'), ('authenticated', 'api.pessoa_editar(uuid, jsonb)'),
  ('authenticated', 'api.unidade_criar(jsonb)'), ('authenticated', 'api.unidade_editar(uuid, jsonb)'), ('authenticated', 'api.unidade_desativar(uuid)'),
  ('authenticated', 'api.unidade_reativar(uuid)'),
  -- F3, auditoria (auditoria.verificar / auditoria.exportar) e relatórios (relatorio.ver)
  ('authenticated', 'api.auditoria_alteracoes(jsonb)'), ('authenticated', 'api.auditoria_cadeia(jsonb)'), ('authenticated', 'api.auditoria_exportar(jsonb)'),
  ('authenticated', 'api.relatorio_resumo(jsonb)'),
  -- F3, importação (importacao.executar)
  ('authenticated', 'api.importacao_analisar(jsonb)'), ('authenticated', 'api.importacao_confirmar(uuid, jsonb)');
CREATE TEMP TABLE allowlist_service_role (funcao regprocedure) ON COMMIT DROP;
INSERT INTO allowlist_service_role VALUES
  ('srv.login_preparar(text, text)'), ('srv.login_falhou(text, text)'),
  ('srv.login_registrar(text, text, text, uuid, uuid, boolean)'),
  ('srv.troca_preparar(uuid, text)'), ('srv.troca_autorizar(uuid)'), ('srv.troca_falhou(uuid, text)'), ('srv.troca_concluir(uuid, text, uuid, uuid)'),
  ('srv.usuario_criar_preparar(uuid, text, text, papel)'), ('srv.usuario_criar(uuid, text, text, papel, uuid, text, text)'),
  ('srv.usuario_desativar(uuid, uuid, text)'), ('srv.usuario_reativar(uuid, uuid, text)'),
  ('srv.usuario_redefinir_senha(uuid, uuid, text)');

CREATE TEMP VIEW papeis_api AS SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']::name[]) AS papel;
CREATE TEMP VIEW schemas_sistema AS SELECT unnest(ARRAY['public', 'api', 'srv', 'app']::name[]) AS nsp;

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
$$, 'toda função executável por anon/authenticated está na allowlist');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace::regnamespace::name IN (SELECT nsp FROM schemas_sistema)
     AND has_function_privilege('service_role', f.oid, 'EXECUTE')
  EXCEPT SELECT funcao FROM allowlist_service_role
$$, 'toda função executável por service_role está na allowlist (só srv.* das Edge Functions)');

SELECT is_empty($$
  SELECT a.papel, a.funcao FROM allowlist_execute a WHERE NOT has_function_privilege(a.papel, a.funcao, 'EXECUTE')
  UNION ALL
  SELECT 'service_role', s.funcao FROM allowlist_service_role s WHERE NOT has_function_privilege('service_role', s.funcao, 'EXECUTE')
$$, 'a allowlist não tem entrada morta (cada função listada existe e está concedida)');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace IN ('api'::regnamespace, 'srv'::regnamespace)
     AND (f.proowner <> 'app_rw'::regrole OR NOT f.prosecdef
          OR NOT coalesce(f.proconfig @> ARRAY['search_path=""'], false))
$$, 'RPCs de api/srv: dono app_rw, SECURITY DEFINER e search_path vazio (rodam com os GRANTs do app_rw)');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'app'::regnamespace AND (f.proowner <> 'app_rw'::regrole OR f.prosecdef)
$$, 'helpers de app: dono app_rw e SECURITY INVOKER (não elevam privilégio)');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'portaria_guarda_credencial' AND tgenabled = 'O'),
  'trigger que impede trocar senha/e-mail no Auth fora do fluxo do sistema está ativo');

SELECT ok(NOT has_schema_privilege('anon', 'app', 'USAGE') AND NOT has_schema_privilege('authenticated', 'app', 'USAGE')
      AND NOT has_schema_privilege('service_role', 'app', 'USAGE'), 'schema app sem USAGE para os papéis do PostgREST');

SELECT ok(has_function_privilege('app_rw', 'public.login_limite_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.login_limite_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.login_limite_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.login_limite_hmac(text)', 'EXECUTE'),
  'HMAC do limite de login (lê o Vault): só app_rw');

-- service_role lê vault.* por GRANT do próprio Supabase (concedido por supabase_admin; o postgres não revoga). Não
-- alcança pela API porque `vault` não está em [api] schemas (só api e srv); a chave service_role sozinha não abre SQL.
SELECT ok(NOT has_table_privilege('app_rw', 'vault.decrypted_secrets', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT')
      AND NOT has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'),
  'app_rw, authenticated e anon não leem o Vault direto');

SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'public'::regnamespace AND has_function_privilege('service_role', f.oid, 'EXECUTE')
$$, 'service_role não executa nenhuma função do public (só alcança srv.*)');

-- F2: o HMAC do CPF (lê o Vault) não é oráculo: só o app_rw executa, dentro das RPCs, que devolvem pessoa e nunca hash.
SELECT ok(has_function_privilege('app_rw', 'public.cpf_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.cpf_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.cpf_hmac(text)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.cpf_hmac(text)', 'EXECUTE'),
  'HMAC do CPF (lê o Vault): só app_rw');

-- F3: a impressão da importação (HMAC com a mesma chave, domínio importacao:v1) também só para o app_rw.
SELECT ok(has_function_privilege('app_rw', 'public.importacao_impressao(text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.importacao_impressao(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.importacao_impressao(text)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.importacao_impressao(text)', 'EXECUTE')
      AND (SELECT prosecdef AND proowner = 'postgres'::regrole FROM pg_proc WHERE oid = 'public.importacao_impressao(text)'::regprocedure),
  'impressão da importação (lê o Vault): dono postgres, só app_rw executa');

-- F2: nenhuma RPC do front sem a checagem de sessão/RBAC no começo (app.exigir(ação), ou app.ator() no catálogo e na sessão).
SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'api'::regnamespace
     AND substring(f.prosrc FROM '^\s*(?:#variable_conflict use_variable\s*)?DECLARE\s+a app\.ator_t := (app\.exigir|app\.ator)\(') IS NULL
$$, 'toda RPC de api começa por app.exigir(...) ou app.ator(...) na primeira declaração');

-- F2: trigger e helper do public com search_path fixo (sem ele, o trigger herdava o search_path vazio das RPCs).
SELECT is_empty($$
  SELECT f.oid::regprocedure FROM pg_proc f
   WHERE f.pronamespace = 'public'::regnamespace AND f.proconfig IS NULL
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = f.oid AND d.deptype = 'e')
$$, 'funções do public (triggers e helpers) têm search_path fixo');

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
