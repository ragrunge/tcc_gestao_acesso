-- 0043 — Encomendas aguardando na ficha da unidade (feedback de 2026-11-06: faltava o número de encomendas por unidade).
-- api.unidade_detalhe ganha a chave `encomendas`: contagem das aguardando, das atrasadas (mais de 7 dias, como o painel) e
-- as 20 mais antigas. Mesma assinatura e retorno; as demais chaves não mudam. Quem tem unidade.ver tem encomenda.ver em
-- todos os papéis da matriz (0041), então a seção não abre dado novo; se a matriz divergir, a chave vem null.
-- CREATE OR REPLACE mantém dono e ACL.
CREATE OR REPLACE FUNCTION api.unidade_detalhe(p_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver');
  u public.unidade;
  r record;
BEGIN
  IF p_ref IS NULL OR length(p_ref) > 40 THEN PERFORM app.invalido('ref', 'Unidade inválida.'); END IF;
  IF btrim(p_ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO u FROM public.unidade WHERE id = btrim(p_ref)::uuid;
  ELSE
    FOR r IN SELECT * FROM app.leituras_do_codigo(p_ref) ORDER BY ordem LOOP
      SELECT * INTO u FROM public.unidade x WHERE x.bloco = r.bloco AND x.numero = r.numero;
      EXIT WHEN u.id IS NOT NULL;
    END LOOP;
  END IF;
  IF u.id IS NULL THEN PERFORM app.erro(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.'); END IF;
  RETURN jsonb_build_object('unidade', app.unidade_json(u),
    'vinculos', app.vinculos_de(u.id, NULL, app.dia_brt(now())),
    'veiculos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'unidadeId', v.unidade_id, 'placa', v.placa, 'modelo', v.modelo,
                  'cor', v.cor, 'ativo', v.ativo) ORDER BY v.placa) FROM public.veiculo v WHERE v.unidade_id = u.id AND v.ativo), '[]'),
    'autorizacoes', coalesce((SELECT jsonb_agg(app.autorizacao_view(x, now()) ORDER BY x.cadastrada_em, x.id) FROM (
                  SELECT * FROM public.autorizacao_previa x WHERE x.unidade_id = u.id AND x.revogada_em IS NULL AND x.valida_ate >= now()
                   ORDER BY x.cadastrada_em, x.id LIMIT 200) x), '[]'),
    'restricoes', coalesce((SELECT jsonb_agg(app.restricao_view(x) ORDER BY x.cadastrada_em, x.id) FROM (
                  SELECT * FROM public.restricao x WHERE x.unidade_id = u.id AND x.revogada_em IS NULL AND x.valida_ate >= now()
                   ORDER BY x.cadastrada_em, x.id LIMIT 200) x), '[]'),
    'eventos', app.eventos_recentes(u.id, NULL, 12),
    'encomendas', CASE WHEN app.pode(a.papel, 'encomenda.ver') THEN jsonb_build_object(
      'aguardando', (SELECT count(*) FROM public.encomenda e WHERE e.unidade_id = u.id AND e.retirada_em IS NULL),
      'atrasadas', (SELECT count(*) FROM public.encomenda e WHERE e.unidade_id = u.id AND e.retirada_em IS NULL
                      AND app.encomenda_atrasada(e.recebida_em, now(), 7)),
      'itens', coalesce((SELECT jsonb_agg(app.encomenda_view(x) ORDER BY x.recebida_em, x.id) FROM (
                  SELECT * FROM public.encomenda e WHERE e.unidade_id = u.id AND e.retirada_em IS NULL
                   ORDER BY e.recebida_em, e.id LIMIT 20) x), '[]')) END);
END $$;
