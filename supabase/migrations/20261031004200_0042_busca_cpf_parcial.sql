-- 0042 — Busca por CPF parcial sem falso positivo (F5).
-- Defeito da 0022: na máscara 'inicio' ("123.45*.***-**", 5 dígitos visíveis) a consulta de 6 a 10 dígitos era cortada
-- nos 5 primeiros (left(digitos, 5)), e "86837345" achava todo CPF começado por 86837, ignorando os dígitos 6 a 8.
-- Regra nova do ramo de CPF (os demais ramos, a ordenação, o p_limite + 1 e o temMais não mudam):
--   * 11 dígitos: igualdade pelo HMAC, como antes.
--   * máscara 'inicio': prefixo só com 3 a 5 dígitos; com 6 a 10 não casa por CPF (os dígitos 6+ não são verificáveis).
--   * máscara 'meio' ("***.456.789-**", dígitos 4 a 9): "contém" com 3 a 6 dígitos; acima de 6 não casa por CPF.
-- A tela avisa para digitar os 11 dígitos (dicaBuscaCpf, src/domain/cpf.ts). Chamadores (api.pessoas_buscar,
-- api.busca_global) e o contrato JSON não mudam.
-- CREATE OR REPLACE mantém dono (app_rw) e ACL (sem EXECUTE para PUBLIC/anon/authenticated/service_role); mesma
-- assinatura e retorno, nenhuma função nova.

/*
 * nome: sem acento e sem caixa, por substring. CPF: 11 dígitos -> igualdade pelo HMAC (Vault); parcial -> só os dígitos
 * VISÍVEIS da máscara: formato novo pelo começo (3 a 5 dígitos), antigo em qualquer ponto dos 6 do meio (3 a 6). Consulta
 * parcial maior que a parte visível não casa por CPF. Unidade: "A-32" -> vínculo pendente, aprovado ou legado. Placa (4+):
 * vínculo válido na unidade do veículo ativo, ou dentro agora tendo entrado com ela. Anonimizada nunca; desativada só com
 * p_incluir_desativadas. O termo não é gravado em lugar nenhum.
 */
CREATE OR REPLACE FUNCTION app.buscar_pessoas(p_q text, p_limite integer, p_sem_moradores boolean, p_incluir_desativadas boolean,
                                   p_restricao boolean, p_agora timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  consulta text := app.aparar(coalesce(p_q, ''));
  nq text := app.sem_acento(app.aparar(coalesce(p_q, '')));
  digitos text := app.so_digitos(p_q);
  placa text := regexp_replace(upper(coalesce(p_q, '')), '[^A-Z0-9]', '', 'g');
  hmac text;
  hoje date := app.dia_brt(p_agora);
  padrao text;
  itens jsonb;
  n integer;
BEGIN
  IF nq = '' THEN RETURN jsonb_build_object('pessoas', '[]'::jsonb, 'temMais', false); END IF;
  padrao := '%' || app.escapar_like(nq) || '%';
  IF length(digitos) = 11 THEN hmac := public.cpf_hmac(digitos); END IF;
  WITH cods AS (SELECT * FROM app.leituras_do_codigo(consulta)),
  achadas AS (
    SELECT p.id, CASE WHEN app.sem_acento(p.nome) = nq THEN 0 WHEN app.sem_acento(p.nome) LIKE app.escapar_like(nq) || '%' THEN 1
                     WHEN app.sem_acento(p.nome) LIKE padrao THEN 2 ELSE 3 END AS rank, app.sem_acento(p.nome) AS chave, p.nome
      FROM public.pessoa p
     WHERE p.anonimizada_em IS NULL
       AND (p_incluir_desativadas OR p.desativada_em IS NULL)
       AND (NOT p_sem_moradores OR NOT EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.pessoa_id = p.id
              AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje)))
       AND (app.sem_acento(p.nome) LIKE padrao
         OR (hmac IS NOT NULL AND p.documento_busca = hmac)
         OR CASE WHEN p.documento_mascarado LIKE '***.%'
              THEN length(digitos) BETWEEN 3 AND 6 AND app.so_digitos(p.documento_mascarado) LIKE '%' || digitos || '%'
              ELSE length(digitos) BETWEEN 3 AND 5 AND app.so_digitos(p.documento_mascarado) LIKE digitos || '%' END
         OR p.id IN (SELECT v.pessoa_id FROM public.vinculo_unidade v JOIN public.unidade u ON u.id = v.unidade_id JOIN cods ON cods.bloco = u.bloco AND cods.numero = u.numero
                      WHERE v.status IN ('pendente', 'aprovado', 'legado'))
         OR (length(placa) >= 4 AND p.id IN (SELECT v.pessoa_id FROM public.vinculo_unidade v JOIN public.veiculo ve ON ve.unidade_id = v.unidade_id
                      WHERE ve.ativo AND ve.placa LIKE '%' || placa || '%'
                        AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje)))
         OR (length(placa) >= 4 AND p.id IN (SELECT app.pessoa_efetiva(e) FROM public.evento_acesso e
                      WHERE e.tipo = 'entrada' AND e.veiculo_placa LIKE '%' || placa || '%'
                        AND NOT EXISTS (SELECT 1 FROM public.evento_acesso s WHERE s.tipo = 'saida' AND s.refere_evento_id = e.id))))
     ORDER BY rank, app.sem_acento(p.nome), p.nome, p.id
     LIMIT p_limite + 1
  ), numerada AS (SELECT x.id, row_number() OVER (ORDER BY x.rank, x.chave, x.nome, x.id) AS i FROM achadas x)
  SELECT coalesce(jsonb_agg(app.pessoa_busca_json(p, p_agora, p_restricao) ORDER BY nu.i) FILTER (WHERE nu.i <= p_limite), '[]'), count(*)
    INTO itens, n FROM numerada nu JOIN public.pessoa p ON p.id = nu.id;
  RETURN jsonb_build_object('pessoas', itens, 'temMais', n > p_limite);
END $$;
