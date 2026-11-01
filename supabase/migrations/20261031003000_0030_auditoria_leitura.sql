-- 0030 — Auditoria do histórico que a F2 deixou como NAO_MIGRADO (F3, item 5): trilha de alterações (audit_log),
-- verificação de integridade da cadeia e exportação verificável (RF-32, RF-37). Nova: não existe no legado Drizzle.
-- Porte de auditoria.controller.ts (eae0555), com a divisão do desenho (§1, linha "auditoria"):
--   * a VERIFICAÇÃO roda no navegador, com verificarCadeia de @portaria/domain (verificador TS independente do gerador
--     SQL, que é a afirmação forte). O banco só entrega os eventos em lotes, no formato canônico de exportação, a cabeça
--     da cadeia e os selos do trecho;
--   * a EXPORTAÇÃO devolve os eventos filtrados no formato canônico e os nomes de exibição; o JSONL (manifesto v3) é
--     montado no front com montarExportacaoJsonl (fonte única do formato). A exportação grava auditoria.exportar no
--     audit_log, sem o texto dos filtros de nome e placa (podem identificar alguém).
-- Selo (manual, público, conferir âncora) continua fora: é da F5.

-- ===== Trilha de alterações (auditoria.verificar: SI, AD, AU) ===========================================================
CREATE FUNCTION app.registro_alteracao_json(r public.audit_log) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', r.id, 'seq', r.seq, 'em', app.ms(r.em), 'usuarioId', r.usuario_id, 'usuarioNome', r.usuario_nome,
    'usuarioPapel', r.usuario_papel, 'acao', r.acao, 'entidade', r.entidade, 'registroId', r.registro_id, 'antes', r.antes,
    'depois', r.depois, 'redigidoEm', app.ms(r.redigido_em))
$$;

-- Mais recentes primeiro (seq). Cursor = seq do último da página. Os snapshots já estão sem dado pessoal em claro; o IP
-- não sai.
CREATE FUNCTION api.auditoria_alteracoes(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('auditoria.verificar');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  de timestamptz := app.j_instante(q, 'de');
  ate timestamptz := app.j_instante(q, 'ate');
  v_usuario uuid := app.j_uuid(q, 'usuarioId');
  v_acao text := app.j_texto(q, 'acao', 80);
  v_entidade text := app.j_texto(q, 'entidade', 40);
  cur bigint;
  itens jsonb;
  n integer;
BEGIN
  IF v_acao IS NOT NULL AND v_acao !~ '^[a-z][a-zA-Z_]*\.[a-z][a-zA-Z_]*$' THEN PERFORM app.invalido('acao', 'Ação inválida.'); END IF;
  IF v_entidade IS NOT NULL AND v_entidade !~ '^[a-z_]{1,40}$' THEN PERFORM app.invalido('entidade', 'Entidade inválida.'); END IF;
  IF q ? 'cursor' AND jsonb_typeof(q -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(q -> 'cursor') <> 'string' OR (q ->> 'cursor') !~ '^[1-9][0-9]{0,17}$' THEN
      PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.');
    END IF;
    cur := (q ->> 'cursor')::bigint;
  END IF;
  WITH pagina AS (
    SELECT r.id, row_number() OVER (ORDER BY r.seq DESC) AS i FROM public.audit_log r
     WHERE (de IS NULL OR r.em >= de) AND (ate IS NULL OR r.em <= ate) AND (v_usuario IS NULL OR r.usuario_id = v_usuario)
       AND (v_acao IS NULL OR r.acao = v_acao) AND (v_entidade IS NULL OR r.entidade = v_entidade) AND (cur IS NULL OR r.seq < cur)
     ORDER BY r.seq DESC LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.registro_alteracao_json(r) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.audit_log r ON r.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN (itens -> (lim - 1) ->> 'seq') END);
END $$;

-- ===== Evento no formato canônico de exportação (paraExportacao do legado / EventoExportado do domain) ==================
-- Instantes em ISO 8601 UTC com milissegundos (Date.toISOString); correcao_valores como gravado; veículo só na v2 (ou
-- se houver veículo num v1, para o verificador recusar), como camposVeiculo.
CREATE FUNCTION app.iso(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

CREATE FUNCTION app.evento_exportado(e public.evento_acesso) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('v', e.formato_hash, 'seq', e.seq, 'id', e.id, 'tipo', e.tipo, 'categoria_pessoa', e.categoria_pessoa,
    'pessoa_id', e.pessoa_id, 'unidade_destino_id', e.unidade_destino_id, 'area_comum_id', e.area_comum_id, 'ponto_acesso_id', e.ponto_acesso_id,
    'autorizado_por_tipo', e.autorizado_por_tipo, 'autorizado_por_pessoa_id', e.autorizado_por_pessoa_id,
    'autorizacao_previa_id', e.autorizacao_previa_id, 'justificativa', e.justificativa, 'restricao_id', e.restricao_id,
    'operador_id', e.operador_id, 'operador_papel', e.operador_papel, 'ocorrido_em', app.iso(e.ocorrido_em),
    'registrado_em', app.iso(e.registrado_em), 'retroativo', e.retroativo, 'formulario_contingencia', e.formulario_contingencia)
  || jsonb_build_object('refere_evento_id', e.refere_evento_id, 'corrige_evento_id', e.corrige_evento_id, 'correcao_valores', e.correcao_valores,
    'empresa', e.empresa, 'servico', e.servico, 'observacao', e.observacao, 'hash_anterior', e.hash_anterior, 'hash', e.hash)
  || CASE WHEN e.formato_hash <> 1 OR e.veiculo_placa IS NOT NULL OR e.veiculo_modelo IS NOT NULL OR e.veiculo_cor IS NOT NULL
       THEN jsonb_build_object('veiculo_placa', e.veiculo_placa, 'veiculo_modelo', e.veiculo_modelo, 'veiculo_cor', e.veiculo_cor) ELSE '{}' END
$$;

-- ===== Integridade (auditoria.verificar): lotes para o verificador do navegador =======================================
/*
 * { cabeca, ancora, eventos, selos }. Primeira chamada (sem aposSeq): a âncora é a gênese (null) ou, depois de um
 * descarte por retenção, o selo no seq de corte (legado: verificarIntegridade). `ateSeq`: a cabeça lida no início, para
 * eventos gravados durante a verificação ficarem para a próxima (sem falso alarme). Lote de até 2000 (P2).
 */
CREATE FUNCTION api.auditoria_cadeia(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('auditoria.verificar');
  q jsonb := app.j_objeto(p);
  apos bigint := app.j_inteiro(q, 'aposSeq', 0, 9000000000000000000);
  ate bigint := app.j_inteiro(q, 'ateSeq', 0, 9000000000000000000);
  lim integer := app.j_limite(q, 2000, 2000);
  cab public.evento_acesso_cadeia;
  primeiro bigint;
  ancora jsonb;
  s public.selo_cadeia;
  evs jsonb;
BEGIN
  SELECT * INTO cab FROM public.evento_acesso_cadeia WHERE id = 1;
  ate := coalesce(ate, cab.ultimo_seq, 0);
  IF apos IS NULL THEN
    SELECT min(seq) INTO primeiro FROM public.evento_acesso;
    IF primeiro IS NOT NULL AND primeiro > 1 THEN
      SELECT * INTO s FROM public.selo_cadeia WHERE ultimo_seq = primeiro - 1 ORDER BY criado_em LIMIT 1;
    ELSIF primeiro IS NULL AND coalesce(cab.ultimo_seq, 0) > 0 THEN
      SELECT * INTO s FROM public.selo_cadeia WHERE ultimo_seq = cab.ultimo_seq ORDER BY criado_em LIMIT 1;
    END IF;
    IF s.id IS NOT NULL THEN ancora := jsonb_build_object('seq', s.ultimo_seq, 'hash', s.ultimo_hash); END IF;
    apos := coalesce((ancora ->> 'seq')::bigint, 0);
  END IF;
  SELECT coalesce(jsonb_agg(app.evento_exportado(e) ORDER BY e.seq), '[]') INTO evs FROM (
    SELECT * FROM public.evento_acesso e WHERE e.seq > apos AND e.seq <= ate ORDER BY e.seq LIMIT lim) e;
  RETURN jsonb_build_object('cabeca', CASE WHEN cab.id IS NOT NULL THEN jsonb_build_object('ultimoSeq', cab.ultimo_seq, 'ultimoHash', cab.ultimo_hash) END,
    'ancora', ancora, 'ateSeq', ate, 'eventos', evs,
    'selos', coalesce((SELECT jsonb_agg(jsonb_build_object('ultimoSeq', x.ultimo_seq, 'ultimoHash', x.ultimo_hash) ORDER BY x.ultimo_seq)
      FROM public.selo_cadeia x WHERE jsonb_array_length(evs) > 0
        AND x.ultimo_seq BETWEEN (evs -> 0 ->> 'seq')::bigint AND (evs -> -1 ->> 'seq')::bigint), '[]'));
END $$;

-- ===== Exportação verificável (auditoria.exportar: SI, AD, AU) ==========================================================
/*
 * Os eventos dos MESMOS filtros do histórico (api.eventos_listar, valores efetivos), no formato canônico, mais os nomes de
 * exibição (fora do hash). Teto de 20 000 eventos (TETO_EXPORTACAO); evento isolado inexistente: 404. As páginas vêm de
 * api.eventos_listar para os filtros não divergirem do que a tela mostra (custo: P2, volume de um condomínio).
 */
CREATE FUNCTION api.auditoria_exportar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('auditoria.exportar');
  q jsonb := app.j_objeto(p) - 'cursor' - 'limite';
  isolado boolean := app.j_uuid(q, 'eventoId') IS NOT NULL;
  pag jsonb;
  cursor_ text;
  ids uuid[] := ARRAY[]::uuid[];
  evs jsonb;
  exib jsonb;
BEGIN
  LOOP
    pag := api.eventos_listar(q || jsonb_build_object('limite', 100) || CASE WHEN cursor_ IS NOT NULL THEN jsonb_build_object('cursor', cursor_) ELSE '{}' END);
    ids := ids || ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(pag -> 'itens') x);
    IF cardinality(ids) > 20000 THEN
      PERFORM app.erro(422, 'EXPORTACAO_GRANDE', 'A exportação passa de 20.000 eventos. Escolha um período menor.');
    END IF;
    EXIT WHEN NOT (pag ->> 'temMais')::boolean OR pag ->> 'cursor' IS NULL;
    cursor_ := pag ->> 'cursor';
  END LOOP;
  IF isolado AND cardinality(ids) = 0 THEN PERFORM app.erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.'); END IF;
  SELECT coalesce(jsonb_agg(app.evento_exportado(e) ORDER BY e.seq), '[]'),
         coalesce(jsonb_object_agg(e.id, jsonb_build_object('pessoa', (SELECT nome FROM public.pessoa WHERE id = e.pessoa_id),
           'unidade', CASE WHEN e.unidade_destino_id IS NOT NULL THEN (SELECT app.codigo_unidade(u.bloco, u.numero) FROM public.unidade u WHERE u.id = e.unidade_destino_id) END,
           'areaComum', (SELECT nome FROM public.area_comum WHERE id = e.area_comum_id),
           'operador', (SELECT nome FROM public.usuario_sistema WHERE id = e.operador_id))), '{}')
    INTO evs, exib FROM public.evento_acesso e WHERE e.id = ANY (ids);
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'auditoria.exportar', 'evento_acesso', app.j_uuid(q, 'eventoId'), NULL, NULL,
    jsonb_build_object('modo', CASE WHEN isolado THEN 'evento_isolado' ELSE 'trilha' END, 'quantidade', cardinality(ids),
      'filtros', (q - 'pessoa' - 'placa') || CASE WHEN q ? 'pessoa' THEN '{"pessoa": "(nome)"}'::jsonb ELSE '{}' END
                 || CASE WHEN q ? 'placa' THEN '{"placa": "(placa)"}'::jsonb ELSE '{}' END));
  RETURN jsonb_build_object('eventos', evs, 'exibicao', exib, 'geradoPor', a.nome, 'isolado', isolado);
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

GRANT EXECUTE ON FUNCTION api.auditoria_alteracoes(jsonb), api.auditoria_cadeia(jsonb), api.auditoria_exportar(jsonb) TO authenticated;
