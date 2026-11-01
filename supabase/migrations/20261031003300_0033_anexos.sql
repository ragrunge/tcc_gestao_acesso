-- 0033 — Anexos de ocorrência (F4; RF-27, RNF-03, RN-10). Porte de ocorrencias.module.ts (anexar, lerAnexo, conteudo) e
-- documentos/cofre.ts do legado (6a45b50^). A cifra fica na Edge Function `anexos` (WebCrypto); aqui ficam a decisão
-- (RBAC, regra do porteiro, encerrada, limite de 5), os metadados e a trilha, na mesma transação.
--
-- Fluxo do envio (a ordem do legado, cofre.ts e anexar()):
--   1. srv.anexo_preparar     checagem prévia SEM trava: não sobe arquivo para quem não pode anexar;
--   2. a Edge confere tamanho (1 byte a 4 MiB) e tipo pelos primeiros bytes, cifra (DEK própria, AES-256-GCM, AAD com
--      o id) e sobe `<id>.bin` no bucket privado `anexos` (id gerado na Edge: nada do nome do usuário vira caminho);
--   3. srv.anexo_registrar    as mesmas regras com a ocorrência TRAVADA (FOR UPDATE), grava documento + vínculo +
--      trilha (`ocorrencia.anexar`, só metadados). Se falhar, a Edge apaga o objeto.
-- Leitura: srv.anexo_para_leitura exige `documento.ver` (síndico e administração; o porteiro anexa mas não abre, e o
-- auditor vê só os metadados, que já saem em api.ocorrencia_obter), confere que o documento é DESTA ocorrência, grava
-- `documento.ler` e devolve à Edge a DEK cifrada (nunca a KEK, que não está no banco).
--
-- Append-only em duas camadas: o app_rw perde UPDATE em documento (só INSERT, como já era em ocorrencia_anexo), e
-- triggers recusam UPDATE/DELETE/TRUNCATE. Única exceção: marcar `eliminado_em` uma vez (NULL -> instante), sem tocar
-- outra coluna, por quem é dono da tabela (as funções controladas lgpd_anonimizar_* e retencao_eliminar_documentos da
-- 0004/0007, SECURITY DEFINER com dono postgres). Elas não ligam o GUC portaria.operacao, e 0000–0032 não são editadas:
-- por isso a exceção é por dono + coluna, não por GUC.
--
-- Storage: bucket `anexos` privado, limite do OBJETO = 4 MiB + 16 bytes (a tag do GCM; o nonce fica no banco), só
-- application/octet-stream (o conteúdo é sempre cifrado). Nenhuma política permissiva em storage.objects; uma política
-- RESTRITIVA para anon/authenticated exclui o bucket mesmo que alguém crie depois uma política ampla (os GRANTs de
-- storage.objects são do Supabase e não são nossos de revogar: a RLS é a única camada ali). Só o service_role (Edge)
-- alcança, por BYPASSRLS.

-- ===== Regras (paridade com @portaria/domain/rules: ANEXO_MAX_BYTES, ANEXO_MAX_POR_OCORRENCIA, ANEXO_TIPOS) ===========
CREATE FUNCTION app.anexo_regras() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('maxBytes', 4194304, 'maxPorOcorrencia', 5,
    'tipos', jsonb_build_object('image/jpeg', 'jpg', 'image/png', 'png', 'application/pdf', 'pdf'))
$$;

-- ===== Contenção no próprio registro ==================================================================================
-- O caminho no Storage é sempre `<id>.bin` (cofre.ts: NOME_ARQUIVO); a DEK cifrada é nonce(12) + DEK(32) + tag(16); o
-- nonce do conteúdo tem 12 bytes. Anexo de ocorrência: tipo e tamanho como na tela e na Edge.
ALTER TABLE public.documento
  ADD CONSTRAINT documento_caminho_ck CHECK (caminho_storage = id::text || '.bin'),
  ADD CONSTRAINT documento_cifra_ck CHECK (octet_length(nonce) = 12 AND octet_length(dek_cifrada) = 60 AND chave_versao >= 1),
  ADD CONSTRAINT documento_anexo_ck CHECK (tipo <> 'anexo_ocorrencia'
    OR (mime IN ('image/jpeg', 'image/png', 'application/pdf') AND tamanho_bytes BETWEEN 1 AND 4194304));

-- Um documento pertence a uma ocorrência só (o id de outra não abre o anexo: lerAnexo confere o par).
ALTER TABLE public.ocorrencia_anexo ADD CONSTRAINT ocorrencia_anexo_documento_uq UNIQUE (documento_id);

-- ===== Append-only (camada 1: GRANT) ===================================================================================
REVOKE UPDATE, DELETE, TRUNCATE ON public.documento, public.ocorrencia_anexo FROM app_rw;

-- ===== Append-only (camada 2: trigger) =================================================================================
CREATE FUNCTION public.documento_bloqueia_alteracao() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_dono boolean := current_user = (SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = TG_RELID);
BEGIN
  IF TG_LEVEL = 'ROW' AND TG_OP = 'UPDATE' AND v_dono AND OLD.eliminado_em IS NULL AND NEW.eliminado_em IS NOT NULL
     AND (to_jsonb(NEW) - 'eliminado_em') = (to_jsonb(OLD) - 'eliminado_em') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only (RNF-03): % bloqueado', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;
REVOKE ALL ON FUNCTION public.documento_bloqueia_alteracao() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER documento_imutavel BEFORE UPDATE OR DELETE ON public.documento
FOR EACH ROW EXECUTE FUNCTION public.documento_bloqueia_alteracao();
CREATE TRIGGER documento_sem_truncate BEFORE TRUNCATE ON public.documento
FOR EACH STATEMENT EXECUTE FUNCTION public.documento_bloqueia_alteracao();
-- ocorrencia_anexo: sem exceção nenhuma (trilha_bloqueia_alteracao da 0001/0004 recusa qualquer tabela fora da lista).
CREATE TRIGGER ocorrencia_anexo_imutavel BEFORE UPDATE OR DELETE ON public.ocorrencia_anexo
FOR EACH ROW EXECUTE FUNCTION public.trilha_bloqueia_alteracao();
CREATE TRIGGER ocorrencia_anexo_sem_truncate BEFORE TRUNCATE ON public.ocorrencia_anexo
FOR EACH STATEMENT EXECUTE FUNCTION public.trilha_bloqueia_alteracao();

-- ===== Storage ==========================================================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('anexos', 'anexos', false, 4194304 + 16, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY portaria_anexos_so_pela_edge ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id IS DISTINCT FROM 'anexos') WITH CHECK (bucket_id IS DISTINCT FROM 'anexos');

-- ===== Regras do envio ==================================================================================================
-- Ocorrência + regra do porteiro + encerrada + limite (paraAlterar + regras() do legado). p_travar: a segunda checagem,
-- dentro da transação que grava, com a ocorrência travada (dois envios ao mesmo tempo não passam de 5).
CREATE FUNCTION app.anexo_conferir(a app.ator_t, p_ocorrencia uuid, p_travar boolean) RETURNS public.ocorrencia
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  o public.ocorrencia;
  n integer;
  lim integer := (app.anexo_regras() ->> 'maxPorOcorrencia')::integer;
BEGIN
  IF p_travar THEN
    SELECT * INTO o FROM public.ocorrencia WHERE id = p_ocorrencia FOR UPDATE;
  ELSE
    SELECT * INTO o FROM public.ocorrencia WHERE id = p_ocorrencia;
  END IF;
  IF NOT FOUND THEN PERFORM app.erro(404, 'OCORRENCIA_NAO_ENCONTRADA', 'Ocorrência não encontrada.'); END IF;
  IF a.papel = 'porteiro' AND o.aberta_por_id <> a.usuario_id THEN
    PERFORM app.erro(403, 'SO_PROPRIA_OCORRENCIA', 'O porteiro só altera ocorrências que ele mesmo abriu.', jsonb_build_object('acao', 'ocorrencia.operar'));
  END IF;
  IF o.status = 'encerrada' THEN PERFORM app.erro(409, 'OCORRENCIA_ENCERRADA', 'Ocorrência encerrada não pode ser alterada.'); END IF;
  SELECT count(*) INTO n FROM public.ocorrencia_anexo WHERE ocorrencia_id = p_ocorrencia;
  IF n >= lim THEN PERFORM app.erro(422, 'LIMITE_ANEXOS', format('Uma ocorrência tem no máximo %s anexos.', lim)); END IF;
  RETURN o;
END $$;

CREATE FUNCTION srv.anexo_preparar(p_sessao_id uuid, p_ocorrencia uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'ocorrencia.operar');
BEGIN
  PERFORM app.anexo_conferir(a, p_ocorrencia, false);
  RETURN app.anexo_regras();
END $$;

-- Os bytes (DEK cifrada e nonce) chegam em base64 da Edge; o caminho no Storage é derivado do id, nunca recebido.
CREATE FUNCTION srv.anexo_registrar(p_sessao_id uuid, p_ocorrencia uuid, p_documento uuid, p_dek_cifrada text, p_nonce text,
                                    p_chave_versao integer, p_sha256 text, p_mime text, p_tamanho bigint, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'ocorrencia.operar');
  o public.ocorrencia;
  v_dek bytea;
  v_nonce bytea;
BEGIN
  BEGIN
    v_dek := decode(p_dek_cifrada, 'base64');
    v_nonce := decode(p_nonce, 'base64');
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.erro(500, 'DOCUMENTO_INVALIDO', 'Registro de documento inconsistente.');
  END;
  IF p_documento IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_chave_versao IS NULL OR p_tamanho IS NULL
     OR NOT (app.anexo_regras() -> 'tipos') ? coalesce(p_mime, '') THEN
    PERFORM app.erro(500, 'DOCUMENTO_INVALIDO', 'Registro de documento inconsistente.');
  END IF;
  o := app.anexo_conferir(a, p_ocorrencia, true);
  BEGIN
    INSERT INTO public.documento (id, tipo, caminho_storage, dek_cifrada, nonce, chave_versao, sha256_conteudo, mime, tamanho_bytes,
                                  enviado_por_id, enviado_em)
    VALUES (p_documento, 'anexo_ocorrencia', p_documento::text || '.bin', v_dek, v_nonce, p_chave_versao::smallint, p_sha256, p_mime,
            p_tamanho, a.usuario_id, now());
    INSERT INTO public.ocorrencia_anexo (ocorrencia_id, documento_id) VALUES (p_ocorrencia, p_documento);
  EXCEPTION
    WHEN unique_violation THEN PERFORM app.erro(409, 'DOCUMENTO_DUPLICADO', 'Este anexo já foi registrado.');
    WHEN check_violation OR numeric_value_out_of_range THEN PERFORM app.erro(500, 'DOCUMENTO_INVALIDO', 'Registro de documento inconsistente.');
  END;
  -- Metadados apenas: nem conteúdo, nem chave, nem nome original (legado: ocorrencia.anexar).
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'ocorrencia.anexar', 'ocorrencia', p_ocorrencia, p_ip, NULL,
    jsonb_build_object('documentoId', p_documento, 'mime', p_mime, 'tamanhoBytes', p_tamanho, 'sha256Conteudo', p_sha256));
  RETURN app.ocorrencia_view(o);
END $$;

-- Leitura: o par (ocorrência, documento) precisa existir; eliminado é 410. A leitura vai à trilha ANTES de o conteúdo
-- sair (o legado gravava depois de decifrar): se a Edge falhar ao decifrar, a trilha registra a tentativa, nunca o
-- contrário (conteúdo entregue sem registro).
CREATE FUNCTION srv.anexo_para_leitura(p_sessao_id uuid, p_ocorrencia uuid, p_documento uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'documento.ver');
  d public.documento;
BEGIN
  SELECT doc.* INTO d FROM public.ocorrencia_anexo x JOIN public.documento doc ON doc.id = x.documento_id
   WHERE x.ocorrencia_id = p_ocorrencia AND x.documento_id = p_documento;
  IF NOT FOUND THEN PERFORM app.erro(404, 'ANEXO_NAO_ENCONTRADO', 'Anexo não encontrado nesta ocorrência.'); END IF;
  IF d.eliminado_em IS NOT NULL THEN PERFORM app.erro(410, 'DOCUMENTO_ELIMINADO', 'Este anexo foi eliminado (retenção).'); END IF;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'documento.ler', 'documento', p_documento, p_ip, NULL,
    jsonb_build_object('ocorrenciaId', p_ocorrencia));
  RETURN jsonb_build_object('id', d.id, 'caminho', d.caminho_storage, 'dekCifrada', encode(d.dek_cifrada, 'base64'),
    'nonce', encode(d.nonce, 'base64'), 'chaveVersao', d.chave_versao, 'sha256', d.sha256_conteudo, 'mime', d.mime,
    'tamanhoBytes', d.tamanho_bytes, 'nome', app.nome_anexo(d.id, d.mime));
END $$;

-- ===== Posse e EXECUTE (fail-closed) =====================================================================================
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace IN ('app'::regnamespace, 'api'::regnamespace, 'srv'::regnamespace) AND p.proowner <> 'app_rw'::regrole
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO app_rw', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION
  srv.anexo_preparar(uuid, uuid),
  srv.anexo_registrar(uuid, uuid, uuid, text, text, integer, text, text, bigint, text),
  srv.anexo_para_leitura(uuid, uuid, uuid, text)
TO service_role;
