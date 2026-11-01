-- Anexos de ocorrência (F4, migração 0033): as RPCs srv.* que a Edge `anexos` chama (como service_role, com o id da sessão
-- do usuário), o append-only de documento/ocorrencia_anexo e a contenção do Storage. A cifra, o tipo pelos primeiros bytes
-- e o tamanho real do arquivo são da Edge (supabase/tests/functions/anexos.test.ts); aqui, o que o banco decide.
-- Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(55);

-- ===== Fixtures ===================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_ad', 'u_po', 'u_po2', 'u_au', 'a_si', 'a_ad', 'a_po', 'a_po2', 'a_au']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'Sônia Síndica', 't9.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'Ari Admin', 't9.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Paulo Porteiro', 't9.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_po2'), 'Pietra Porteira', 't9.porteira', 'porteiro', false, pg_temp.id('a_po2'), pg_temp.email()),
  (pg_temp.id('u_au'), 'Abel Auditor', 't9.auditor', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('ad', pg_temp.id('a_ad')), ('po', pg_temp.id('a_po')), ('po2', pg_temp.id('a_po2')), ('au', pg_temp.id('a_au'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;

-- ===== Harness ====================================================================================================
-- Front (authenticated + JWT), só para abrir e andar as ocorrências.
CREATE FUNCTION pg_temp.val(p_k text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; c text;
BEGIN
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text INTO c FROM sess WHERE k = p_k;
  PERFORM set_config('request.jwt.claims', c, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO r;
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := jsonb_build_object('erro', (SQLERRM::jsonb) ->> 'code');
    WHEN OTHERS THEN r := jsonb_build_object('erro', SQLSTATE);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
-- Edge: service_role chamando srv.* com o id da sessão. Devolve o jsonb ou {"erro": código}.
CREATE FUNCTION pg_temp.srv(p_sql text, p_papel text DEFAULT 'service_role') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO r;
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := jsonb_build_object('erro', (SQLERRM::jsonb) ->> 'code');
    WHEN OTHERS THEN r := jsonb_build_object('erro', SQLSTATE);
  END;
  RESET ROLE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.s(p_k text) RETURNS text LANGUAGE sql AS $$ SELECT quote_literal(sid) || '::uuid' FROM sess WHERE k = p_k $$;
CREATE FUNCTION pg_temp.e(j jsonb) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(j ->> 'erro', 'ok') $$;
-- srv.anexo_registrar com metadados válidos por padrão (nonce 12 bytes, DEK cifrada 60, sha de 64 hex).
CREATE FUNCTION pg_temp.reg(p_k text, p_oc uuid, p_doc uuid, p_mime text DEFAULT 'application/pdf', p_tam bigint DEFAULT 1000,
                            p_nonce integer DEFAULT 12, p_dek integer DEFAULT 60, p_papel text DEFAULT 'service_role') RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.anexo_registrar(%s, %L::uuid, %L::uuid, %L, %L, 1, %L, %L, %s, ''203.0.113.9'')',
    pg_temp.s(p_k), p_oc, p_doc, encode(extensions.gen_random_bytes(p_dek), 'base64'), encode(extensions.gen_random_bytes(p_nonce), 'base64'),
    encode(extensions.digest(p_doc::text, 'sha256'), 'hex'), p_mime, p_tam), p_papel)
$$;
CREATE FUNCTION pg_temp.ler(p_k text, p_oc uuid, p_doc uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.srv(format('srv.anexo_para_leitura(%s, %L::uuid, %L::uuid, ''203.0.113.9'')', pg_temp.s(p_k), p_oc, p_doc))
$$;
CREATE FUNCTION pg_temp.como_app_rw(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SET LOCAL ROLE app_rw;
  BEGIN EXECUTE p_sql; r := 'ok'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  RESET ROLE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.como_dono(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END;
END $$;
CREATE TEMP TABLE oc (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE FUNCTION pg_temp.o(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM oc WHERE k = p $$;
CREATE TEMP TABLE docs (k text PRIMARY KEY, id uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO docs (k) SELECT 'd' || g FROM generate_series(1, 9) g;
CREATE FUNCTION pg_temp.d(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM docs WHERE k = p $$;

INSERT INTO oc SELECT 'po', (pg_temp.val('po', 'api.ocorrencia_criar(''{"tipo":"dano","descricao":"Portão riscado"}'')') ->> 'id')::uuid;
INSERT INTO oc SELECT 'po2', (pg_temp.val('po2', 'api.ocorrencia_criar(''{"tipo":"outro","descricao":"Lâmpada queimada"}'')') ->> 'id')::uuid;
INSERT INTO oc SELECT 'enc', (pg_temp.val('ad', 'api.ocorrencia_criar(''{"tipo":"conflito","descricao":"Discussão"}'')') ->> 'id')::uuid;
SELECT pg_temp.val('ad', format('api.ocorrencia_alterar_status(%L::uuid, ''em_andamento'')', pg_temp.o('enc')));
SELECT pg_temp.val('ad', format('api.ocorrencia_alterar_status(%L::uuid, ''encerrada'')', pg_temp.o('enc')));

-- ===== Superfície =================================================================================================
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('po'), pg_temp.o('po')), 'authenticated')), '42501',
  'authenticated não chama srv.anexo_preparar (só a Edge, com service_role)');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_para_leitura(%s, %L::uuid, gen_random_uuid(), NULL)', pg_temp.s('ad'), pg_temp.o('po')), 'anon')), '42501',
  'anon não chama srv.anexo_para_leitura');
SELECT is(pg_temp.e(pg_temp.reg('po', pg_temp.o('po'), pg_temp.d('d9'), p_papel => 'authenticated')), '42501', 'authenticated não registra anexo direto');

-- ===== Preparar (checagem sem trava) ==============================================================================
SELECT ok(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('po'), pg_temp.o('po'))) = app.anexo_regras(),
  'porteiro na ocorrência que abriu: ok, devolve os limites');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('po'), pg_temp.o('po2')))), 'SO_PROPRIA_OCORRENCIA',
  'porteiro não anexa na ocorrência de outro porteiro');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('ad'), pg_temp.o('po2')))), 'ok', 'administração anexa em qualquer ocorrência aberta');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('au'), pg_temp.o('po')))), 'SEM_PERMISSAO', 'auditor não anexa');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, gen_random_uuid())', pg_temp.s('ad')))), 'OCORRENCIA_NAO_ENCONTRADA', 'ocorrência inexistente');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('ad'), pg_temp.o('enc')))), 'OCORRENCIA_ENCERRADA', 'encerrada não recebe anexo');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(gen_random_uuid(), %L::uuid)', pg_temp.o('po')))), 'SESSAO_INVALIDA', 'sessão inexistente é recusada');
UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'logout' WHERE id = (SELECT sid FROM sess WHERE k = 'po2');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('po2'), pg_temp.o('po2')))), 'SESSAO_INVALIDA', 'sessão revogada é recusada');
UPDATE public.sessao SET revogada_em = NULL, motivo_revogacao = NULL WHERE id = (SELECT sid FROM sess WHERE k = 'po2');

-- ===== Registrar ==================================================================================================
SELECT is(pg_temp.e(pg_temp.reg('po', pg_temp.o('po2'), pg_temp.d('d9'))), 'SO_PROPRIA_OCORRENCIA', 'registrar repete a regra do porteiro (com trava)');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('enc'), pg_temp.d('d9'))), 'OCORRENCIA_ENCERRADA', 'registrar repete a regra da encerrada');
SELECT is(pg_temp.e(pg_temp.reg('au', pg_temp.o('po'), pg_temp.d('d9'))), 'SEM_PERMISSAO', 'registrar repete o RBAC');
CREATE TEMP TABLE r1 ON COMMIT DROP AS SELECT pg_temp.reg('po', pg_temp.o('po'), pg_temp.d('d1')) AS v;
SELECT ok((SELECT jsonb_array_length(v -> 'documentos') = 1 AND v #>> '{documentos,0,id}' = pg_temp.d('d1')::text
             AND v #>> '{documentos,0,nome}' = 'anexo-' || left(pg_temp.d('d1')::text, 8) || '.pdf' AND v #>> '{documentos,0,enviadoPorNome}' = 'Paulo Porteiro'
             AND v -> 'anexos' = jsonb_build_array('anexo-' || left(pg_temp.d('d1')::text, 8) || '.pdf') FROM r1),
  'porteiro registra: a visão devolve o anexo com nome gerado (nada do nome original)');
SELECT ok((SELECT caminho_storage = id::text || '.bin' AND tipo = 'anexo_ocorrencia' AND enviado_por_id = pg_temp.id('u_po') FROM public.documento WHERE id = pg_temp.d('d1')),
  'caminho no Storage derivado do id (<id>.bin), não recebido');
SELECT ok((SELECT depois ?& ARRAY['documentoId', 'mime', 'tamanhoBytes', 'sha256Conteudo'] AND NOT depois ?| ARRAY['dekCifrada', 'dek_cifrada', 'nonce', 'nome']
             AND ip = '203.0.113.9'::inet FROM public.audit_log WHERE acao = 'ocorrencia.anexar' AND registro_id = pg_temp.o('po')),
  'trilha ocorrencia.anexar: só metadados (sem DEK, nonce nem nome), com o IP');
SELECT is((SELECT v ->> 'erro' FROM r1), NULL, 'sanidade: o registro não devolveu erro');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d1'))), 'DOCUMENTO_DUPLICADO', 'mesmo id duas vezes: 409 (o objeto no Storage também não é sobrescrito)');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d9'), 'image/gif')), 'DOCUMENTO_INVALIDO', 'tipo fora de JPEG/PNG/PDF');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d9'), p_tam => 0)), 'DOCUMENTO_INVALIDO', 'tamanho 0 (vazio)');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d9'), p_tam => 4194305)), 'DOCUMENTO_INVALIDO', 'tamanho acima de 4 MiB');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d9'), p_nonce => 16)), 'DOCUMENTO_INVALIDO', 'nonce fora de 12 bytes');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d9'), p_dek => 48)), 'DOCUMENTO_INVALIDO', 'DEK cifrada sem o nonce próprio (60 bytes)');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_registrar(%s, %L::uuid, gen_random_uuid(), ''%%%%'', ''AAAAAAAAAAAAAAAA'', 1, %L, ''image/png'', 10, NULL)',
  pg_temp.s('ad'), pg_temp.o('po'), repeat('a', 64)))), 'DOCUMENTO_INVALIDO', 'base64 inválido');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d2'), 'image/jpeg', 4194304)), 'ok', 'exatamente 4 MiB: aceito');
SELECT is(pg_temp.e(pg_temp.reg('ad', pg_temp.o('po'), pg_temp.d('d3'), 'image/png')), 'ok', 'terceiro');
SELECT is(pg_temp.e(pg_temp.reg('po', pg_temp.o('po'), pg_temp.d('d4'))), 'ok', 'quarto');
SELECT is(pg_temp.e(pg_temp.reg('po', pg_temp.o('po'), pg_temp.d('d5'))), 'ok', 'quinto');
SELECT is(pg_temp.e(pg_temp.reg('po', pg_temp.o('po'), pg_temp.d('d6'))), 'LIMITE_ANEXOS', 'sexto: no máximo 5 por ocorrência');
SELECT is(pg_temp.e(pg_temp.srv(format('srv.anexo_preparar(%s, %L::uuid)', pg_temp.s('po'), pg_temp.o('po')))), 'LIMITE_ANEXOS', 'preparar também recusa a sexta');
SELECT is((SELECT count(*)::int FROM public.documento WHERE id = ANY (ARRAY[pg_temp.d('d6'), pg_temp.d('d9')])), 0, 'recusas não deixam documento gravado');

-- ===== Leitura ====================================================================================================
SELECT is(pg_temp.e(pg_temp.ler('po', pg_temp.o('po'), pg_temp.d('d1'))), 'SEM_PERMISSAO', 'porteiro anexa mas não abre o conteúdo, nem o que ele enviou (RN-10)');
SELECT is(pg_temp.e(pg_temp.ler('au', pg_temp.o('po'), pg_temp.d('d1'))), 'SEM_PERMISSAO', 'auditor vê só os metadados');
CREATE TEMP TABLE l1 ON COMMIT DROP AS SELECT pg_temp.ler('ad', pg_temp.o('po'), pg_temp.d('d1')) AS v;
SELECT ok((SELECT v ->> 'caminho' = pg_temp.d('d1')::text || '.bin' AND length(decode(v ->> 'dekCifrada', 'base64')) = 60
             AND length(decode(v ->> 'nonce', 'base64')) = 12 AND v ->> 'mime' = 'application/pdf' AND (v ->> 'chaveVersao')::int = 1 FROM l1),
  'administração lê: caminho, DEK cifrada, nonce, versão da chave e tipo para a Edge');
SELECT ok((SELECT count(*) = 1 FROM public.audit_log WHERE acao = 'documento.ler' AND entidade = 'documento' AND registro_id = pg_temp.d('d1')
             AND usuario_id = pg_temp.id('u_ad') AND depois ->> 'ocorrenciaId' = pg_temp.o('po')::text),
  'cada leitura grava documento.ler na trilha (legado: conteudo())');
SELECT is(pg_temp.e(pg_temp.ler('si', pg_temp.o('po2'), pg_temp.d('d1'))), 'ANEXO_NAO_ENCONTRADO', 'documento de outra ocorrência não abre por esta');
SELECT is(pg_temp.e(pg_temp.ler('si', pg_temp.o('po'), gen_random_uuid())), 'ANEXO_NAO_ENCONTRADO', 'documento inexistente');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE acao = 'documento.ler' AND registro_id = pg_temp.d('d1')), 1, 'recusa não grava leitura');

-- ===== Append-only e eliminação (camadas 1 e 2) ===================================================================
SELECT is(pg_temp.como_app_rw(format('UPDATE public.documento SET mime = ''image/png'' WHERE id = %L', pg_temp.d('d1'))), '42501', 'documento: app_rw sem UPDATE (camada 1)');
SELECT is(pg_temp.como_app_rw(format('DELETE FROM public.ocorrencia_anexo WHERE documento_id = %L', pg_temp.d('d1'))), '42501', 'ocorrencia_anexo: app_rw sem DELETE (camada 1)');
GRANT UPDATE, DELETE ON public.documento, public.ocorrencia_anexo TO app_rw;
SELECT is(pg_temp.como_app_rw(format('UPDATE public.documento SET eliminado_em = now() WHERE id = %L', pg_temp.d('d1'))), '23000',
  'documento: trigger barra o app_rw mesmo com GRANT, até para marcar eliminação (camada 2)');
SELECT is(pg_temp.como_app_rw(format('DELETE FROM public.ocorrencia_anexo WHERE documento_id = %L', pg_temp.d('d1'))), '23000', 'ocorrencia_anexo: trigger barra DELETE com GRANT');
REVOKE UPDATE, DELETE ON public.documento, public.ocorrencia_anexo FROM app_rw;
SELECT is(pg_temp.como_dono(format('UPDATE public.documento SET sha256_conteudo = %L WHERE id = %L', repeat('0', 64), pg_temp.d('d1'))), '23000',
  'nem o dono troca o hash gravado');
SELECT is(pg_temp.como_dono(format('UPDATE public.documento SET eliminado_em = now(), mime = ''image/png'' WHERE id = %L', pg_temp.d('d1'))), '23000',
  'eliminação não leva outra coluna junto');
SELECT is(pg_temp.como_dono('TRUNCATE public.ocorrencia_anexo'), '23000', 'TRUNCATE de ocorrencia_anexo bloqueado');
-- documento é referenciado por outras tabelas (TRUNCATE sem CASCADE já falha antes): confere que o gatilho de statement existe.
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.documento'::regclass AND tgname = 'documento_sem_truncate' AND tgenabled = 'O'),
  'documento tem o gatilho que barra TRUNCATE');
SELECT is(public.retencao_eliminar_documentos(ARRAY[pg_temp.d('d1')], 'anexo_ocorrencia'), 1, 'eliminação controlada (retenção, dono): marca uma vez');
SELECT is(pg_temp.como_dono(format('UPDATE public.documento SET eliminado_em = now() WHERE id = %L', pg_temp.d('d1'))), '23000', 'eliminado_em não muda depois de marcado');
SELECT is(pg_temp.e(pg_temp.ler('ad', pg_temp.o('po'), pg_temp.d('d1'))), 'DOCUMENTO_ELIMINADO', 'anexo eliminado: 410 (legado: cofre.ler)');

-- ===== Storage: anon e authenticated não alcançam o bucket (nem com uma política ampla criada por engano) ===========
INSERT INTO storage.objects (bucket_id, name) VALUES ('anexos', pg_temp.d('d2')::text || '.bin');
CREATE FUNCTION pg_temp.storage_como(p_papel text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_papel);
  BEGIN EXECUTE p_sql INTO r; r := coalesce(r, 'ok'); EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  RESET ROLE;
  RETURN r;
END $$;
SELECT is(pg_temp.storage_como('authenticated', 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''anexos'''), '0', 'authenticated não vê objeto do bucket');
SELECT is(pg_temp.storage_como('anon', 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''anexos'''), '0', 'anon não vê objeto do bucket');
CREATE POLICY pgtap_ampla ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
SELECT is(pg_temp.storage_como('authenticated', 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''anexos'''), '0',
  'com uma política ampla por engano, a restritiva ainda esconde o bucket');
SELECT is(pg_temp.storage_como('authenticated', 'INSERT INTO storage.objects (bucket_id, name) VALUES (''anexos'', ''intruso.bin'')'), '42501',
  'com uma política ampla por engano, authenticated ainda não grava no bucket');
SELECT is(pg_temp.storage_como('anon', 'UPDATE storage.objects SET name = ''x.bin'' WHERE bucket_id = ''anexos'' RETURNING ''alterou'''), 'ok',
  'anon não altera objeto do bucket (nenhuma linha visível)');

SELECT * FROM finish();
ROLLBACK;
