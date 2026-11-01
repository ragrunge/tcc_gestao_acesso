-- 0037 — Paginação numerada e totalizadores. Mesmo contrato das RPCs (api.*, dono app_rw, SECURITY DEFINER,
-- search_path vazio, app.exigir na primeira linha), mesmas assinaturas: nada de superfície nova além dos resumos.
--
-- Listagens (pessoas, vínculos, encomendas, ocorrências, trilha de acessos e trilha de alterações): o corpo `p` aceita
-- `deslocamento` (0..100 000) como alternativa ao `cursor` (os dois juntos: 400), e a resposta ganha `total`, contado
-- sobre o MESMO conjunto filtrado da página (um CTE só, sem o cursor). O cursor continua aceito e com o mesmo efeito: o
-- front publicado, o carregador da carga fictícia e a exportação percorrem por ele. Teto de 100 por página, como antes.
--
-- Trilhas (eventos e audit_log, só de inclusão e com seq crescente): a primeira página devolve `ateSeq` (maior seq no
-- momento) e as seguintes o repassam; registros novos ficam fora até a volta à página 1, então o deslocamento não
-- repete nem pula linha. Em eventos_listar o caminho por cursor é o da 0023 sem mudança e não conta o total (null): a
-- exportação o percorre página a página e a contagem a cada página tornaria o custo quadrático.
--
-- Resumos novos: pessoas, vínculos, unidades e ocorrências, com o mesmo app.exigir da listagem correspondente.
-- Índices: nenhum. Os conjuntos paginados (pessoas, vínculos, encomendas, ocorrências) têm centenas de linhas; as trilhas
-- ordenam por seq, que já tem índice único.

-- ===== Entrada ========================================================================================================
-- Deslocamento da página (0 quando ausente). Com cursor também: 400, para não haver duas posições na mesma chamada.
CREATE FUNCTION app.j_deslocamento(p jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE d bigint := app.j_inteiro(p, 'deslocamento', 0, 100000);
BEGIN
  IF d IS NOT NULL AND p ? 'cursor' AND jsonb_typeof(p -> 'cursor') <> 'null' THEN
    PERFORM app.invalido('deslocamento', 'Use cursor ou deslocamento, não os dois.');
  END IF;
  RETURN coalesce(d, 0)::integer;
END $$;

-- `ateSeq` da página de trilha: só com deslocamento (com cursor a própria chave já limita).
CREATE FUNCTION app.j_ate_seq(p jsonb) RETURNS bigint
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE s bigint := app.j_inteiro(p, 'ateSeq', 0, 9000000000000000);
BEGIN
  IF s IS NOT NULL AND p ? 'cursor' AND jsonb_typeof(p -> 'cursor') <> 'null' THEN
    PERFORM app.invalido('ateSeq', 'Use cursor ou ateSeq, não os dois.');
  END IF;
  RETURN s;
END $$;

-- ===== Pessoas ========================================================================================================
CREATE OR REPLACE FUNCTION api.pessoas_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  cat text := app.j_enum(q, 'categoria', ARRAY['visitante', 'prestador', 'morador', 'funcionario']);
  incl boolean := coalesce(app.j_bool(q, 'incluirDesativadas'), false);
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  c public.pessoa;
  com_restricao boolean := app.pode(a.papel, 'unidade.ver');
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.pessoa WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH base AS (
    SELECT x.id, x.nome FROM public.pessoa x
     WHERE (cat IS NULL OR x.categoria = cat::public.categoria_pessoa) AND (incl OR x.desativada_em IS NULL)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.nome, s.id) AS i FROM (
      SELECT b.id, b.nome FROM base b WHERE cur IS NULL OR (b.nome, b.id) > (c.nome, c.id)
       ORDER BY b.nome, b.id OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.pessoa_lista_json(pg.id, now(), com_restricao) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'),
         count(pg.id), (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

-- Contagens do Cadastro. `ativas` e `porCategoria` são o `total` de pessoas_listar sem desativadas (por categoria).
CREATE FUNCTION api.pessoas_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('pessoa.ver');
BEGIN
  RETURN (SELECT jsonb_build_object(
      'ativas', count(*) FILTER (WHERE x.desativada_em IS NULL),
      'desativadas', count(*) FILTER (WHERE x.desativada_em IS NOT NULL),
      'porCategoria', jsonb_build_object(
        'morador', count(*) FILTER (WHERE x.desativada_em IS NULL AND x.categoria = 'morador'),
        'visitante', count(*) FILTER (WHERE x.desativada_em IS NULL AND x.categoria = 'visitante'),
        'prestador', count(*) FILTER (WHERE x.desativada_em IS NULL AND x.categoria = 'prestador'),
        'funcionario', count(*) FILTER (WHERE x.desativada_em IS NULL AND x.categoria = 'funcionario')))
    FROM public.pessoa x);
END $$;

-- ===== Vínculos =======================================================================================================
CREATE OR REPLACE FUNCTION api.vinculos_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  ordem text := coalesce(app.j_enum(q, 'ordem', ARRAY['recentes', 'decisao', 'prazo']), 'recentes');
  st public.status_vinculo[];
  uni uuid := app.j_uuid(q, 'unidadeId');
  pes uuid := app.j_uuid(q, 'pessoaId');
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  c public.vinculo_unidade;
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF q ? 'status' AND jsonb_typeof(q -> 'status') <> 'null' THEN
    IF jsonb_typeof(q -> 'status') <> 'array' OR jsonb_array_length(q -> 'status') NOT BETWEEN 1 AND 5
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(q -> 'status') s WHERE s NOT IN ('pendente', 'aprovado', 'rejeitado', 'legado', 'encerrado')) THEN
      PERFORM app.invalido('status', 'Status de vínculo inválido.');
    END IF;
    st := ARRAY(SELECT s::public.status_vinculo FROM jsonb_array_elements_text(q -> 'status') s);
  END IF;
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.vinculo_unidade WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH base AS (
    SELECT v.id,
           CASE WHEN ordem = 'decisao' THEN coalesce(v.decidido_em, v.encerrado_em, v.registrado_em) ELSE v.registrado_em END AS chave_t,
           coalesce(v.prazo_regularizacao, '9999-12-31'::date) AS chave_d
      FROM public.vinculo_unidade v
     WHERE (st IS NULL OR v.status = ANY (st)) AND (uni IS NULL OR v.unidade_id = uni) AND (pes IS NULL OR v.pessoa_id = pes)
  ), chave AS (
    SELECT CASE WHEN ordem = 'decisao' THEN coalesce(c.decidido_em, c.encerrado_em, c.registrado_em) ELSE c.registrado_em END AS t,
           coalesce(c.prazo_regularizacao, '9999-12-31'::date) AS d
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY CASE WHEN ordem = 'prazo' THEN s.chave_d END ASC, CASE WHEN ordem = 'prazo' THEN s.id END ASC,
                                             s.chave_t DESC, s.id DESC) AS i
      FROM (SELECT b.* FROM base b, chave k
             WHERE cur IS NULL OR (ordem = 'prazo' AND (b.chave_d, b.id) > (k.d, cur)) OR (ordem <> 'prazo' AND (b.chave_t, b.id) < (k.t, cur))
             ORDER BY CASE WHEN ordem = 'prazo' THEN b.chave_d END ASC, CASE WHEN ordem = 'prazo' THEN b.id END ASC, b.chave_t DESC, b.id DESC
            OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.vinculo_json(v, app.dia_brt(now())) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.vinculo_unidade v ON v.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

/*
 * Contagens da tela de vínculos: por status, legados com prazo vencido (o mesmo critério de legadoVencido) e, entre os
 * vínculos válidos hoje (app.vinculo_valido: aprovado vigente ou legado no prazo), por tipo e por pessoa distinta.
 */
CREATE FUNCTION api.vinculos_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.ver');
  hoje date := app.dia_brt(now());
BEGIN
  RETURN (SELECT jsonb_build_object(
      'porStatus', jsonb_build_object(
        'pendente', count(*) FILTER (WHERE v.status = 'pendente'), 'aprovado', count(*) FILTER (WHERE v.status = 'aprovado'),
        'legado', count(*) FILTER (WHERE v.status = 'legado'), 'rejeitado', count(*) FILTER (WHERE v.status = 'rejeitado'),
        'encerrado', count(*) FILTER (WHERE v.status = 'encerrado')),
      'legadosVencidos', count(*) FILTER (WHERE v.status = 'legado' AND v.prazo_regularizacao IS NOT NULL AND v.prazo_regularizacao < hoje),
      'validosPorTipo', jsonb_build_object(
        'proprietario', count(*) FILTER (WHERE x.valido AND v.tipo = 'proprietario'),
        'inquilino', count(*) FILTER (WHERE x.valido AND v.tipo = 'inquilino'),
        'dependente', count(*) FILTER (WHERE x.valido AND v.tipo = 'dependente')),
      'pessoasComVinculoValido', count(DISTINCT v.pessoa_id) FILTER (WHERE x.valido))
    FROM public.vinculo_unidade v,
         LATERAL (SELECT app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje) AS valido) x);
END $$;

-- ===== Unidades (sem paginação numerada: a tela mostra um bloco por vez, em grade por andar) ===========================
/*
 * Ocupada: ativa com ao menos um vínculo válido hoje. Alugada: ativa com vínculo válido de inquilino. Vazia: ativa sem
 * vínculo válido. Cadastro completo: o critério de unidade_resumo (vínculo aprovado válido). Veículos: só os ativos.
 */
CREATE FUNCTION api.unidades_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver');
  hoje date := app.dia_brt(now());
BEGIN
  RETURN (SELECT jsonb_build_object(
      'total', count(*), 'ativas', count(*) FILTER (WHERE u.ativo), 'inativas', count(*) FILTER (WHERE NOT u.ativo),
      'ocupadas', count(*) FILTER (WHERE u.ativo AND x.validos > 0),
      'alugadas', count(*) FILTER (WHERE u.ativo AND x.inquilinos > 0),
      'vazias', count(*) FILTER (WHERE u.ativo AND x.validos = 0),
      'cadastroCompleto', count(*) FILTER (WHERE u.ativo AND x.aprovados > 0),
      'veiculosAtivos', (SELECT count(*) FROM public.veiculo ve WHERE ve.ativo))
    FROM public.unidade u,
         LATERAL (SELECT count(*) FILTER (WHERE y.valido) AS validos,
                         count(*) FILTER (WHERE y.valido AND v.tipo = 'inquilino') AS inquilinos,
                         count(*) FILTER (WHERE y.valido AND v.status = 'aprovado') AS aprovados
                    FROM public.vinculo_unidade v,
                         LATERAL (SELECT app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje) AS valido) y
                   WHERE v.unidade_id = u.id) x);
END $$;

-- ===== Encomendas =====================================================================================================
CREATE OR REPLACE FUNCTION api.encomendas_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_status text := app.j_enum(q, 'status', ARRAY['aguardando', 'entregue']);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_dias integer := app.j_inteiro(q, 'atrasadasDias', 0, 365);
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  pendentes boolean := v_status IS NOT DISTINCT FROM 'aguardando' OR v_dias IS NOT NULL;
  c public.encomenda;
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.encomenda WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH base AS (
    SELECT e.id, e.recebida_em FROM public.encomenda e
     WHERE (NOT pendentes OR e.retirada_em IS NULL)
       AND (v_status IS DISTINCT FROM 'entregue' OR e.retirada_em IS NOT NULL)
       AND (v_unidade IS NULL OR e.unidade_id = v_unidade)
       AND (v_dias IS NULL OR app.encomenda_atrasada(e.recebida_em, now(), v_dias))
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.recebida_em DESC, s.id DESC) AS i FROM (
      SELECT b.id, b.recebida_em FROM base b WHERE cur IS NULL OR (b.recebida_em, b.id) < (c.recebida_em, c.id)
       ORDER BY b.recebida_em DESC, b.id DESC OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.encomenda_view(e) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.encomenda e ON e.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

-- ===== Ocorrências ====================================================================================================
CREATE OR REPLACE FUNCTION api.ocorrencias_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('ocorrencia.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_tipo text := app.j_enum(q, 'tipo', ARRAY['conflito', 'tentativa_acesso_indevido', 'dano', 'encomenda', 'outro']);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  st public.status_ocorrencia[];
  c public.ocorrencia;
  itens jsonb;
  n integer;
  total bigint;
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
  WITH base AS (
    SELECT o.id, o.aberta_em FROM public.ocorrencia o
     WHERE (st IS NULL OR o.status = ANY (st)) AND (v_tipo IS NULL OR o.tipo = v_tipo::public.tipo_ocorrencia)
       AND (v_unidade IS NULL OR o.unidade_id = v_unidade)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.aberta_em DESC, s.id DESC) AS i FROM (
      SELECT b.id, b.aberta_em FROM base b WHERE cur IS NULL OR (b.aberta_em, b.id) < (c.aberta_em, c.id)
       ORDER BY b.aberta_em DESC, b.id DESC OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.ocorrencia_view(o) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.ocorrencia o ON o.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

CREATE FUNCTION api.ocorrencias_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('ocorrencia.ver');
BEGIN
  RETURN (SELECT jsonb_build_object('total', count(*),
      'aberta', count(*) FILTER (WHERE o.status = 'aberta'), 'emAndamento', count(*) FILTER (WHERE o.status = 'em_andamento'),
      'encerrada', count(*) FILTER (WHERE o.status = 'encerrada'))
    FROM public.ocorrencia o);
END $$;

-- ===== Trilha de acessos ==============================================================================================
/*
 * Sem cursor: página por deslocamento até `ateSeq`, com `total` e `porTipo` (entradas, saídas, negados, recusados e
 * correções) do mesmo conjunto filtrado. Com cursor: a consulta da 0023, sem total. Os filtros são os mesmos nos dois
 * caminhos (o pgTAP 11 confere que o percurso por cursor e o por deslocamento devolvem a mesma sequência).
 */
CREATE OR REPLACE FUNCTION api.eventos_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  desl integer := app.j_deslocamento(q);
  ate_seq bigint := app.j_ate_seq(q);
  cur bigint;
  ev_id uuid := app.j_uuid(q, 'eventoId');
  de timestamptz := app.j_instante(q, 'de');
  ate timestamptz := app.j_instante(q, 'ate');
  uni uuid := app.j_uuid(q, 'unidadeId');
  pes uuid := app.j_uuid(q, 'pessoaId');
  nome text := app.sem_acento(app.aparar(coalesce(app.j_texto(q, 'pessoa', 100), '')));
  placa text := regexp_replace(upper(coalesce(app.j_texto(q, 'placa', 10), '')), '[^A-Z0-9]', '', 'g');
  ope uuid := app.j_uuid(q, 'operadorId');
  tipos text[] := ARRAY['entrada', 'saida', 'negado', 'recusado', 'correcao'];
  tipo text := app.j_enum(q, 'tipo', tipos);
  meio text := app.j_enum(q, 'meio', ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala']);
  excecoes boolean := coalesce(app.j_bool(q, 'somenteExcecoes'), false);
  retros boolean := coalesce(app.j_bool(q, 'somenteRetroativos'), false);
  excluir text[] := ARRAY[]::text[];
  itens jsonb;
  n integer;
  total bigint;
  por_tipo jsonb;
BEGIN
  IF q ? 'cursor' AND jsonb_typeof(q -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(q -> 'cursor') <> 'string' OR (q ->> 'cursor') !~ '^[1-9][0-9]{0,17}$' THEN
      PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.');
    END IF;
    cur := (q ->> 'cursor')::bigint;
  END IF;
  IF q ? 'excluirTipos' AND jsonb_typeof(q -> 'excluirTipos') <> 'null' THEN
    IF jsonb_typeof(q -> 'excluirTipos') <> 'array' OR jsonb_array_length(q -> 'excluirTipos') > 5
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'excluirTipos') t WHERE jsonb_typeof(t) <> 'string' OR NOT ((t #>> '{}') = ANY (tipos))) THEN
      PERFORM app.invalido('excluirTipos', 'Tipos de evento inválidos.');
    END IF;
    excluir := ARRAY(SELECT jsonb_array_elements_text(q -> 'excluirTipos'));
  END IF;

  IF cur IS NOT NULL THEN
    WITH pagina AS (
      SELECT e.id, row_number() OVER (ORDER BY e.seq DESC) AS i FROM public.evento_acesso e
        LEFT JOIN LATERAL (SELECT c.correcao_valores AS v FROM public.evento_acesso c
                            WHERE c.tipo = 'correcao' AND c.corrige_evento_id = e.id ORDER BY c.seq DESC LIMIT 1) lc ON e.tipo <> 'correcao'
       WHERE (cur IS NULL OR e.seq < cur)
         AND (ev_id IS NULL OR e.id = ev_id)
         AND (de IS NULL OR CASE WHEN lc.v ? 'ocorrido_em' THEN (lc.v ->> 'ocorrido_em')::timestamptz ELSE e.ocorrido_em END >= de)
         AND (ate IS NULL OR CASE WHEN lc.v ? 'ocorrido_em' THEN (lc.v ->> 'ocorrido_em')::timestamptz ELSE e.ocorrido_em END <= ate)
         AND (uni IS NULL OR CASE WHEN lc.v ? 'unidade_destino_id' THEN (lc.v ->> 'unidade_destino_id')::uuid ELSE e.unidade_destino_id END = uni)
         AND (pes IS NULL OR CASE WHEN lc.v ? 'pessoa_id' THEN (lc.v ->> 'pessoa_id')::uuid ELSE e.pessoa_id END = pes)
         AND (nome = '' OR EXISTS (SELECT 1 FROM public.pessoa x WHERE x.id = CASE WHEN lc.v ? 'pessoa_id' THEN (lc.v ->> 'pessoa_id')::uuid ELSE e.pessoa_id END
                                      AND app.sem_acento(x.nome) LIKE '%' || app.escapar_like(nome) || '%'))
         AND (length(placa) < 3 OR e.veiculo_placa LIKE '%' || placa || '%'
              OR (e.tipo = 'saida' AND EXISTS (SELECT 1 FROM public.evento_acesso en WHERE en.id = e.refere_evento_id AND en.veiculo_placa LIKE '%' || placa || '%')))
         AND (ope IS NULL OR e.operador_id = ope)
         AND (tipo IS NULL OR e.tipo = tipo::public.tipo_evento)
         AND NOT (e.tipo::text = ANY (excluir))
         AND (meio IS NULL OR e.autorizado_por_tipo = meio::public.meio_autorizacao)
         AND (NOT excecoes OR app.eh_excecao(e))
         AND (NOT retros OR e.retroativo)
       ORDER BY e.seq DESC LIMIT lim + 1
    )
    SELECT coalesce(jsonb_agg(app.evento_view(e) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
      INTO itens, n FROM pagina pg JOIN public.evento_acesso e ON e.id = pg.id;
    RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN (itens -> (lim - 1) ->> 'seq') END,
      'total', NULL);
  END IF;

  ate_seq := coalesce(ate_seq, (SELECT max(x.seq) FROM public.evento_acesso x), 0);
  WITH base AS (
    SELECT e.id, e.seq, e.tipo FROM public.evento_acesso e
      LEFT JOIN LATERAL (SELECT c.correcao_valores AS v FROM public.evento_acesso c
                          WHERE c.tipo = 'correcao' AND c.corrige_evento_id = e.id ORDER BY c.seq DESC LIMIT 1) lc ON e.tipo <> 'correcao'
     WHERE e.seq <= ate_seq
       AND (ev_id IS NULL OR e.id = ev_id)
       AND (de IS NULL OR CASE WHEN lc.v ? 'ocorrido_em' THEN (lc.v ->> 'ocorrido_em')::timestamptz ELSE e.ocorrido_em END >= de)
       AND (ate IS NULL OR CASE WHEN lc.v ? 'ocorrido_em' THEN (lc.v ->> 'ocorrido_em')::timestamptz ELSE e.ocorrido_em END <= ate)
       AND (uni IS NULL OR CASE WHEN lc.v ? 'unidade_destino_id' THEN (lc.v ->> 'unidade_destino_id')::uuid ELSE e.unidade_destino_id END = uni)
       AND (pes IS NULL OR CASE WHEN lc.v ? 'pessoa_id' THEN (lc.v ->> 'pessoa_id')::uuid ELSE e.pessoa_id END = pes)
       AND (nome = '' OR EXISTS (SELECT 1 FROM public.pessoa x WHERE x.id = CASE WHEN lc.v ? 'pessoa_id' THEN (lc.v ->> 'pessoa_id')::uuid ELSE e.pessoa_id END
                                    AND app.sem_acento(x.nome) LIKE '%' || app.escapar_like(nome) || '%'))
       AND (length(placa) < 3 OR e.veiculo_placa LIKE '%' || placa || '%'
            OR (e.tipo = 'saida' AND EXISTS (SELECT 1 FROM public.evento_acesso en WHERE en.id = e.refere_evento_id AND en.veiculo_placa LIKE '%' || placa || '%')))
       AND (ope IS NULL OR e.operador_id = ope)
       AND (tipo IS NULL OR e.tipo = tipo::public.tipo_evento)
       AND NOT (e.tipo::text = ANY (excluir))
       AND (meio IS NULL OR e.autorizado_por_tipo = meio::public.meio_autorizacao)
       AND (NOT excecoes OR app.eh_excecao(e))
       AND (NOT retros OR e.retroativo)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.seq DESC) AS i FROM (
      SELECT b.id, b.seq FROM base b ORDER BY b.seq DESC OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.evento_view(e) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base),
         (SELECT jsonb_build_object('entrada', count(*) FILTER (WHERE b.tipo = 'entrada'), 'saida', count(*) FILTER (WHERE b.tipo = 'saida'),
                   'negado', count(*) FILTER (WHERE b.tipo = 'negado'), 'recusado', count(*) FILTER (WHERE b.tipo = 'recusado'),
                   'correcao', count(*) FILTER (WHERE b.tipo = 'correcao')) FROM base b)
    INTO itens, n, total, por_tipo FROM pagina pg JOIN public.evento_acesso e ON e.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN (itens -> (lim - 1) ->> 'seq') END,
    'total', total, 'porTipo', por_tipo, 'ateSeq', ate_seq);
END $$;

-- ===== Trilha de alterações ===========================================================================================
CREATE OR REPLACE FUNCTION api.auditoria_alteracoes(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('auditoria.verificar');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  desl integer := app.j_deslocamento(q);
  ate_seq bigint := app.j_ate_seq(q);
  de timestamptz := app.j_instante(q, 'de');
  ate timestamptz := app.j_instante(q, 'ate');
  v_usuario uuid := app.j_uuid(q, 'usuarioId');
  v_acao text := app.j_texto(q, 'acao', 80);
  v_entidade text := app.j_texto(q, 'entidade', 40);
  cur bigint;
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF v_acao IS NOT NULL AND v_acao !~ '^[a-z][a-zA-Z_]*\.[a-z][a-zA-Z_]*$' THEN PERFORM app.invalido('acao', 'Ação inválida.'); END IF;
  IF v_entidade IS NOT NULL AND v_entidade !~ '^[a-z_]{1,40}$' THEN PERFORM app.invalido('entidade', 'Entidade inválida.'); END IF;
  IF q ? 'cursor' AND jsonb_typeof(q -> 'cursor') <> 'null' THEN
    IF jsonb_typeof(q -> 'cursor') <> 'string' OR (q ->> 'cursor') !~ '^[1-9][0-9]{0,17}$' THEN
      PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.');
    END IF;
    cur := (q ->> 'cursor')::bigint;
  END IF;
  IF cur IS NULL THEN ate_seq := coalesce(ate_seq, (SELECT max(x.seq) FROM public.audit_log x), 0); END IF;
  WITH base AS (
    SELECT r.id, r.seq FROM public.audit_log r
     WHERE (de IS NULL OR r.em >= de) AND (ate IS NULL OR r.em <= ate) AND (v_usuario IS NULL OR r.usuario_id = v_usuario)
       AND (v_acao IS NULL OR r.acao = v_acao) AND (v_entidade IS NULL OR r.entidade = v_entidade)
       AND (ate_seq IS NULL OR r.seq <= ate_seq)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.seq DESC) AS i FROM (
      SELECT b.id, b.seq FROM base b WHERE cur IS NULL OR b.seq < cur ORDER BY b.seq DESC OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.registro_alteracao_json(r) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.audit_log r ON r.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN (itens -> (lim - 1) ->> 'seq') END,
    'total', total) || CASE WHEN cur IS NULL THEN jsonb_build_object('ateSeq', ate_seq) ELSE '{}' END;
END $$;

-- ===== Exportação verificável =========================================================================================
-- Igual à 0030; só tira também `deslocamento` e `ateSeq` do filtro: a exportação é sempre do conjunto inteiro.
CREATE OR REPLACE FUNCTION api.auditoria_exportar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('auditoria.exportar');
  q jsonb := app.j_objeto(p) - 'cursor' - 'limite' - 'deslocamento' - 'ateSeq';
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

-- ===== Posse e EXECUTE (fail-closed) ==================================================================================
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

GRANT EXECUTE ON FUNCTION api.pessoas_resumo(), api.vinculos_resumo(), api.unidades_resumo(), api.ocorrencias_resumo() TO authenticated;
