-- 0027 — Ocorrências (F3, item 3; RF-27, RF-28), sem anexos (F4). Nova: não existe no legado Drizzle. Porte de
-- ocorrencias.module.ts (eae0555): criar, alterar status (aberta -> em andamento -> encerrada; "atualizar" e "fechar"),
-- vincular eventos (ocorrencia.operar), listar e obter (ocorrencia.ver).
--
-- Regras: nasce aberta; o status só anda para a frente e encerrada é final (o trigger ocorrencia_transicao da 0001 repete
-- a máquina no banco); o porteiro só altera o status da ocorrência que ele mesmo abriu (403 SO_PROPRIA_OCORRENCIA).
-- Vincular eventos é ADITIVO: app_rw só tem INSERT em ocorrencia_evento (sem DELETE), repetido é ignorado, teto de 100.
-- O histórico de status (ocorrencia_status_historico) é append-only em duas camadas (GRANT só INSERT + trigger da 0001).
--
-- Anexos: a visão já devolve `documentos`/`anexos` (metadados de ocorrencia_anexo + documento: nome gerado, mime,
-- tamanho), para a F4 só acrescentar o envio e a leitura pela Edge. Nada de conteúdo, chave ou nome original aqui.

-- ===== Visão (OcorrenciaView) ==========================================================================================
-- "OC-2026-047": ano (BRT) da abertura + número (identity), 3 casas no mínimo (padStart não corta).
CREATE FUNCTION app.codigo_ocorrencia(p_numero integer, p_aberta timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'OC-' || extract(year FROM app.local_brt(p_aberta))::integer || '-' || lpad(p_numero::text, greatest(3, length(p_numero::text)), '0')
$$;

-- "anexo-1a2b3c4d.pdf": prefixo do id do documento e a extensão do tipo detectado (ANEXO_TIPOS). Nada do nome original.
CREATE FUNCTION app.nome_anexo(p_id uuid, p_mime text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'anexo-' || left(p_id::text, 8) || '.' || CASE p_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'application/pdf' THEN 'pdf' ELSE 'bin' END
$$;

CREATE FUNCTION app.ocorrencia_view(o public.ocorrencia) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH docs AS (
    SELECT d.id, d.mime, d.tamanho_bytes, d.enviado_em, d.enviado_por_id FROM public.ocorrencia_anexo x
      JOIN public.documento d ON d.id = x.documento_id WHERE x.ocorrencia_id = o.id
  )
  SELECT jsonb_build_object('id', o.id, 'codigo', app.codigo_ocorrencia(o.numero, o.aberta_em), 'tipo', o.tipo, 'descricao', o.descricao,
    'unidadeId', o.unidade_id, 'envolvidos', coalesce(o.envolvidos, ''), 'abertaPorId', o.aberta_por_id, 'abertaEm', app.ms(o.aberta_em),
    'status', o.status, 'abertaPorNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = o.aberta_por_id), '?'),
    'unidadeCodigo', CASE WHEN o.unidade_id IS NOT NULL THEN coalesce(app.codigo_da_unidade(o.unidade_id), '?') END,
    'historicoStatus', coalesce((SELECT jsonb_agg(jsonb_build_object('de', h.de, 'para', h.para, 'porId', h.por_id, 'em', app.ms(h.em),
        'porNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = h.por_id), '?'))
        ORDER BY h.em, array_position(ARRAY['aberta', 'em_andamento', 'encerrada'], h.de::text), h.id)
      FROM public.ocorrencia_status_historico h WHERE h.ocorrencia_id = o.id), '[]'),
    'eventoIds', coalesce((SELECT jsonb_agg(oe.evento_id ORDER BY oe.vinculado_em, oe.evento_id) FROM public.ocorrencia_evento oe
      WHERE oe.ocorrencia_id = o.id), '[]'),
    'anexos', coalesce((SELECT jsonb_agg(app.nome_anexo(d.id, d.mime) ORDER BY d.enviado_em, d.id) FROM docs d), '[]'),
    'documentos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', app.nome_anexo(d.id, d.mime), 'mime', d.mime,
        'tamanhoBytes', d.tamanho_bytes, 'enviadoEm', app.ms(d.enviado_em),
        'enviadoPorNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = d.enviado_por_id), '?')) ORDER BY d.enviado_em, d.id)
      FROM docs d), '[]'))
$$;

-- Corrida com outra mudança de status (trigger) ou referência inexistente -> resposta legível.
CREATE FUNCTION app.erro_ocorrencia(p_estado text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_estado = '23514' THEN PERFORM app.erro(409, 'OCORRENCIA_ALTERADA', 'A ocorrência mudou ao mesmo tempo. Atualize a tela.'); END IF;
  IF p_estado = '23503' THEN PERFORM app.erro(422, 'REFERENCIA_INVALIDA', 'Unidade ou evento informado não existe.'); END IF;
  PERFORM app.erro(500, 'ERRO_INTERNO', 'O registro não foi aceito. Tente novamente.');
END $$;

-- Lista de ids de evento do corpo (até 20, sem repetição, na ordem em que vieram). Todos precisam existir (404).
CREATE FUNCTION app.j_eventos(p jsonb, p_min integer) RETURNS uuid[]
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  v jsonb := p -> 'eventoIds';
  ids uuid[];
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN v := '[]'; END IF;
  IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 20 OR jsonb_array_length(v) < p_min
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x) <> 'string'
                  OR (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    PERFORM app.invalido('eventoIds', 'evento inválido');
  END IF;
  SELECT coalesce(array_agg(id ORDER BY i), ARRAY[]::uuid[]) INTO ids
    FROM (SELECT (x #>> '{}')::uuid AS id, min(n) AS i FROM jsonb_array_elements(v) WITH ORDINALITY AS t(x, n) GROUP BY 1) y;
  IF (SELECT count(*) FROM public.evento_acesso e WHERE e.id = ANY (ids)) <> cardinality(ids) THEN
    PERFORM app.erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento vinculado não encontrado.');
  END IF;
  RETURN ids;
END $$;

-- ===== Leitura ======================================================================================================
-- Mais recentes primeiro (aberta_em, id). Cursor = id da última ocorrência da página.
CREATE FUNCTION api.ocorrencias_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_tipo text := app.j_enum(q, 'tipo', ARRAY['conflito', 'tentativa_acesso_indevido', 'dano', 'encomenda', 'outro']);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  cur uuid := app.j_uuid(q, 'cursor');
  st public.status_ocorrencia[];
  c public.ocorrencia;
  itens jsonb;
  n integer;
BEGIN
  IF q ? 'status' AND jsonb_typeof(q -> 'status') <> 'null' THEN
    IF jsonb_typeof(q -> 'status') <> 'array' OR jsonb_array_length(q -> 'status') > 3
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'status') s WHERE jsonb_typeof(s) <> 'string'
                    OR (s #>> '{}') NOT IN ('aberta', 'em_andamento', 'encerrada')) THEN
      PERFORM app.invalido('status', 'Status de ocorrência inválido.');
    END IF;
    st := ARRAY(SELECT s::public.status_ocorrencia FROM jsonb_array_elements_text(q -> 'status') s);
    IF cardinality(st) = 0 THEN st := NULL; END IF;
  END IF;
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.ocorrencia WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH pagina AS (
    SELECT o.id, row_number() OVER (ORDER BY o.aberta_em DESC, o.id DESC) AS i FROM public.ocorrencia o
     WHERE (st IS NULL OR o.status = ANY (st)) AND (v_tipo IS NULL OR o.tipo = v_tipo::public.tipo_ocorrencia)
       AND (v_unidade IS NULL OR o.unidade_id = v_unidade)
       AND (cur IS NULL OR (o.aberta_em, o.id) < (c.aberta_em, c.id))
     ORDER BY o.aberta_em DESC, o.id DESC LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.ocorrencia_view(o) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.ocorrencia o ON o.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END);
END $$;

CREATE FUNCTION api.ocorrencia_obter(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.ver');
  o public.ocorrencia;
BEGIN
  SELECT * INTO o FROM public.ocorrencia WHERE id = p_id;
  IF NOT FOUND THEN PERFORM app.erro(404, 'OCORRENCIA_NAO_ENCONTRADA', 'Ocorrência não encontrada.'); END IF;
  RETURN app.ocorrencia_view(o);
END $$;

-- ===== Escrita ======================================================================================================
-- RF-27 (abrir) e RF-28 (eventos na abertura, como o link do negado na entrada). Unidade desativada vale (registra fato).
CREATE FUNCTION api.ocorrencia_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.operar');
  q jsonb := app.j_objeto(p);
  v_tipo text := app.j_enum(q, 'tipo', ARRAY['conflito', 'tentativa_acesso_indevido', 'dano', 'encomenda', 'outro']);
  v_desc text := app.aparar(coalesce(app.j_texto(q, 'descricao', 4000), ''));
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_envolvidos text := app.vazio_para_nulo(app.j_texto(q, 'envolvidos', 500));
  ids uuid[];
  o public.ocorrencia;
  est text;
BEGIN
  IF v_tipo IS NULL THEN PERFORM app.invalido('tipo', 'Campo tipo: valor inválido.'); END IF;
  IF v_desc = '' THEN PERFORM app.erro(422, 'DESCRICAO_OBRIGATORIA', 'Descreva a ocorrência.'); END IF;
  ids := app.j_eventos(q, 0);
  IF v_unidade IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.unidade WHERE id = v_unidade) THEN
    PERFORM app.erro(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.');
  END IF;
  BEGIN
    INSERT INTO public.ocorrencia (tipo, descricao, unidade_id, envolvidos, aberta_por_id, aberta_em, atualizado_em)
    VALUES (v_tipo::public.tipo_ocorrencia, v_desc, v_unidade, v_envolvidos, a.usuario_id, now(), now()) RETURNING * INTO o;
    INSERT INTO public.ocorrencia_evento (ocorrencia_id, evento_id, vinculado_por_id, vinculado_em)
    SELECT o.id, x, a.usuario_id, now() FROM unnest(ids) x;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_ocorrencia(est);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'ocorrencia.criar', 'ocorrencia', o.id, NULL, NULL,
    app.snapshot(to_jsonb(o) || jsonb_build_object('evento_ids', to_jsonb(ids))));
  RETURN app.ocorrencia_view(o);
END $$;

-- Transição de status: aberta -> em_andamento -> encerrada, nessa ordem; o porteiro só na que ele mesmo abriu.
CREATE FUNCTION api.ocorrencia_alterar_status(p_id uuid, p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.operar');
  antes public.ocorrencia;
  depois public.ocorrencia;
  proximo text;
  est text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('em_andamento', 'encerrada') THEN PERFORM app.invalido('status', 'Campo status: valor inválido.'); END IF;
  SELECT * INTO antes FROM public.ocorrencia WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'OCORRENCIA_NAO_ENCONTRADA', 'Ocorrência não encontrada.'); END IF;
  IF a.papel = 'porteiro' AND antes.aberta_por_id <> a.usuario_id THEN
    PERFORM app.erro(403, 'SO_PROPRIA_OCORRENCIA', 'O porteiro só altera ocorrências que ele mesmo abriu.', jsonb_build_object('acao', 'ocorrencia.operar'));
  END IF;
  IF antes.status = 'encerrada' THEN PERFORM app.erro(409, 'OCORRENCIA_ENCERRADA', 'Ocorrência encerrada não pode ser alterada.'); END IF;
  proximo := CASE antes.status WHEN 'aberta' THEN 'em_andamento' WHEN 'em_andamento' THEN 'encerrada' END;
  IF proximo IS DISTINCT FROM p_status THEN
    PERFORM app.erro(422, 'TRANSICAO_INVALIDA', 'Transição de status inválida: o fluxo é aberta, em andamento e encerrada, nessa ordem.');
  END IF;
  BEGIN
    INSERT INTO public.ocorrencia_status_historico (ocorrencia_id, de, para, por_id, em) VALUES (p_id, antes.status, p_status::public.status_ocorrencia, a.usuario_id, now());
    UPDATE public.ocorrencia SET status = p_status::public.status_ocorrencia, atualizado_em = now() WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_ocorrencia(est);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'ocorrencia.alterarStatus', 'ocorrencia', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.ocorrencia_view(depois);
END $$;

-- RF-28: acrescenta eventos (os já vinculados são ignorados). Qualquer operador (spec §5.2), menos em encerrada.
CREATE FUNCTION api.ocorrencia_vincular_eventos(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.operar');
  q jsonb := app.j_objeto(p);
  o public.ocorrencia;
  ids uuid[];
  ja integer;
  novos uuid[];
  est text;
BEGIN
  SELECT * INTO o FROM public.ocorrencia WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'OCORRENCIA_NAO_ENCONTRADA', 'Ocorrência não encontrada.'); END IF;
  IF o.status = 'encerrada' THEN PERFORM app.erro(409, 'OCORRENCIA_ENCERRADA', 'Ocorrência encerrada não pode ser alterada.'); END IF;
  ids := app.j_eventos(q, 1);
  SELECT count(*) INTO ja FROM public.ocorrencia_evento WHERE ocorrencia_id = p_id;
  BEGIN
    WITH ins AS (
      INSERT INTO public.ocorrencia_evento (ocorrencia_id, evento_id, vinculado_por_id, vinculado_em)
      SELECT p_id, x, a.usuario_id, now() FROM unnest(ids) x ON CONFLICT DO NOTHING RETURNING evento_id
    ) SELECT coalesce(array_agg(evento_id), ARRAY[]::uuid[]) INTO novos FROM ins;
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_ocorrencia(est);
  END;
  IF ja + cardinality(novos) > 100 THEN PERFORM app.erro(422, 'LIMITE_EVENTOS', 'Uma ocorrência tem no máximo 100 eventos vinculados.'); END IF;
  IF cardinality(novos) > 0 THEN
    PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'ocorrencia.vincularEventos', 'ocorrencia', p_id, NULL, NULL,
      jsonb_build_object('evento_ids', to_jsonb(novos)));
  END IF;
  RETURN app.ocorrencia_view(o);
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
  api.ocorrencias_listar(jsonb), api.ocorrencia_obter(uuid), api.ocorrencia_criar(jsonb), api.ocorrencia_alterar_status(uuid, text),
  api.ocorrencia_vincular_eventos(uuid, jsonb)
TO authenticated;
