-- 0031 — Relatórios (F3, item 6; RF-30, RF-31). Nova: não existe no legado Drizzle. Porte de relatorios.module.ts
-- (eae0555): o resumo do período, pelos VALORES EFETIVOS (com correção), agregado no banco. O CSV é montado no front com
-- csvRelatorio de @portaria/domain/relatorio (fonte única do formato, desenho §1). Permissão: relatorio.ver (SI, AD, AU).
-- Período em dias de calendário BRT ('AAAA-MM-DD'); sem período, os últimos 30 dias até hoje; no máximo 366 dias
-- (PERIODO_MAX_RELATORIO_DIAS). Faixas das encomendas pendentes: FAIXAS_ENCOMENDA do domain.

-- Responsável pela exceção (RF-31): liberação do porteiro -> o operador; autorização prévia de unidade sem solicitante ->
-- quem a cadastrou. Área comum (RF-36) é da administração e não conta (responsavelExcecaoSql do legado).
CREATE FUNCTION app.responsavel_excecao(e public.evento_acesso) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN e.tipo <> 'entrada' THEN NULL
    WHEN e.autorizado_por_tipo = 'excecao_porteiro' THEN e.operador_id
    WHEN e.autorizado_por_tipo = 'autorizacao_previa' THEN
      (SELECT a.cadastrada_por_id FROM public.autorizacao_previa a WHERE a.id = e.autorizacao_previa_id AND a.sem_solicitante)
  END
$$;

CREATE FUNCTION api.relatorio_resumo(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('relatorio.ver');
  q jsonb := app.j_objeto(p);
  hoje date := app.dia_brt(now());
  v_ate_dia date := coalesce(app.j_dia(q, 'ate'), app.dia_brt(now()));
  v_de_dia date := coalesce(app.j_dia(q, 'de'), app.dia_brt(now()) - 29);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_cat text := app.j_enum(q, 'categoria', ARRAY['visitante', 'prestador', 'morador', 'funcionario']);
  v_meio text := app.j_enum(q, 'meio', ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala']);
  de timestamptz;
  ate timestamptz;
BEGIN
  IF v_de_dia > v_ate_dia THEN PERFORM app.erro(422, 'PERIODO_INVALIDO', 'A data inicial não pode ser posterior à final.'); END IF;
  de := app.inicio_da_data(v_de_dia);
  ate := app.fim_da_data(v_ate_dia);
  IF (app.ms(ate) - app.ms(de)) / 86400000.0 > 366 THEN PERFORM app.erro(422, 'PERIODO_LONGO', 'O período máximo do relatório é de 366 dias.'); END IF;
  RETURN (
    WITH ef AS (
      SELECT e.seq, e.tipo::text AS tipo, e.autorizado_por_tipo::text AS meio, e.retroativo, x.ocorrido_em AS quando,
             app.responsavel_excecao(e) AS resp
        FROM public.evento_acesso e CROSS JOIN LATERAL (SELECT (app.efetivo(e)).*) x
       WHERE e.tipo IN ('entrada', 'negado', 'recusado')
         AND (e.ocorrido_em BETWEEN de AND ate OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c
                WHERE c.corrige_evento_id IS NOT NULL AND c.correcao_valores ? 'ocorrido_em'))
         AND x.ocorrido_em BETWEEN de AND ate
         AND (v_unidade IS NULL OR x.unidade_destino_id = v_unidade)
         AND (v_cat IS NULL OR e.categoria_pessoa::text = v_cat)
         AND (v_meio IS NULL OR e.autorizado_por_tipo::text = v_meio)
    ), entradas AS (SELECT * FROM ef WHERE tipo = 'entrada')
    SELECT jsonb_build_object(
      'periodo', jsonb_build_object('de', app.ms(de), 'ate', app.ms(ate)),
      'acessosPorDia', (SELECT jsonb_agg(jsonb_build_object('dia', app.ms(app.inicio_da_data(d::date)),
          'entradas', (SELECT count(*) FROM entradas WHERE app.dia_brt(quando) = d::date)) ORDER BY d)
        FROM generate_series(v_de_dia, v_ate_dia, interval '1 day') d),
      -- Empate no total: a ordem de primeira aparição na cadeia (menor seq).
      'acessosPorMeio', coalesce((SELECT jsonb_agg(jsonb_build_object('meio', meio, 'total', n) ORDER BY n DESC, s)
        FROM (SELECT meio, count(*) AS n, min(seq) AS s FROM entradas WHERE meio IS NOT NULL GROUP BY meio) g), '[]'),
      'excecoesPorPorteiro', coalesce((SELECT jsonb_agg(jsonb_build_object('operadorId', resp, 'operador',
          coalesce((SELECT nome FROM public.usuario_sistema WHERE id = resp), '?'), 'total', n) ORDER BY n DESC, s)
        FROM (SELECT resp, count(*) AS n, min(seq) AS s FROM entradas WHERE resp IS NOT NULL GROUP BY resp) g), '[]'),
      'encomendasPorIdade', (SELECT jsonb_agg(jsonb_build_object('faixa', f.faixa, 'total', (SELECT count(*) FROM public.encomenda en
          WHERE en.retirada_em IS NULL AND (v_unidade IS NULL OR en.unidade_id = v_unidade)
            AND floor((app.ms(now()) - app.ms(en.recebida_em)) / 86400000.0) BETWEEN f.min AND f.max)) ORDER BY f.ordem)
        FROM (VALUES (1, '0 a 2 dias', 0, 2), (2, '3 a 7 dias', 3, 7), (3, '8 a 14 dias', 8, 14), (4, '15 dias ou mais', 15, 9999))
             AS f(ordem, faixa, min, max)),
      'cadastroCompleto', jsonb_build_object(
        'unidadesCompletas', (SELECT count(DISTINCT v.unidade_id) FROM public.vinculo_unidade v JOIN public.unidade u ON u.id = v.unidade_id
          WHERE u.ativo AND v.status = 'aprovado' AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje)),
        'total', (SELECT count(*) FROM public.unidade WHERE ativo)),
      'totais', jsonb_build_object(
        'entradas', (SELECT count(*) FROM entradas), 'negados', (SELECT count(*) FROM ef WHERE tipo = 'negado'),
        'recusados', (SELECT count(*) FROM ef WHERE tipo = 'recusado'), 'retroativos', (SELECT count(*) FROM entradas WHERE retroativo),
        'excecoes', (SELECT count(*) FROM entradas WHERE resp IS NOT NULL)),
      -- Só para o CSV (o filtro "Unidade" sai com o código); o adaptador tira do resumo.
      'filtroUnidadeCodigo', CASE WHEN v_unidade IS NOT NULL THEN coalesce(app.codigo_da_unidade(v_unidade), v_unidade::text) END));
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

GRANT EXECUTE ON FUNCTION api.relatorio_resumo(jsonb) TO authenticated;
