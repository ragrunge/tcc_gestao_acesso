-- 0022 — RPCs de catálogo, unidades, vínculos (leitura), busca e pessoas (F2). Nova: não existe no legado Drizzle.
-- Porte de unidades.service.ts, busca.service.ts, pessoas.service.ts, vinculos (leitura) e formato-cpf.ts (eae0555).
--
-- Contrato (desenho §1 e §6): toda RPC é api.* com dono app_rw e SECURITY DEFINER (roda com os GRANTs mínimos da 0001),
-- search_path vazio, e a PRIMEIRA linha é app.exigir(ação) (ou app.ator() no catálogo, que só exige sessão). Termo de
-- busca (pode ser CPF) só no corpo do POST (supabase.rpc), nunca em GET. Erros: app.erro (status + código + mensagem),
-- que não citam o valor recebido nem confirmam existência para quem não tem a permissão (o RBAC vem antes do 404).
-- Leituras não gravam trilha (como o legado); escritas gravam audit_log na mesma transação (app.auditar + app.snapshot).

-- ===== Entrada (validação do corpo JSON) ===============================================================================
-- 400 VALIDACAO com o campo; a mensagem nunca repete o valor recebido.
CREATE FUNCTION app.invalido(p_campo text, p_mensagem text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  SELECT app.erro(400, 'VALIDACAO', p_mensagem, jsonb_build_array(jsonb_build_object('field', p_campo, 'message', p_mensagem)))
$$;

CREATE FUNCTION app.j_objeto(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(p) <> 'object' THEN PERFORM app.invalido('corpo', 'Corpo da requisição inválido.'); END IF;
  RETURN p;
END $$;

-- Texto opcional (ausente ou null -> NULL), com teto de tamanho.
CREATE FUNCTION app.j_texto(p jsonb, k text, p_max integer) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE v jsonb := p -> k;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) <> 'string' THEN PERFORM app.invalido(k, 'Campo ' || k || ': esperado texto.'); END IF;
  IF length(v #>> '{}') > p_max THEN PERFORM app.invalido(k, 'Campo ' || k || ': no máximo ' || p_max || ' caracteres.'); END IF;
  RETURN v #>> '{}';
END $$;

CREATE FUNCTION app.j_uuid(p jsonb, k text) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE v jsonb := p -> k;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM app.invalido(k, 'Campo ' || k || ': identificador inválido.');
  END IF;
  RETURN (v #>> '{}')::uuid;
END $$;

CREATE FUNCTION app.j_bool(p jsonb, k text) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE v jsonb := p -> k;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) <> 'boolean' THEN PERFORM app.invalido(k, 'Campo ' || k || ': esperado verdadeiro ou falso.'); END IF;
  RETURN v::boolean;
END $$;

-- Inteiro numa faixa (limite, horas, epoch ms).
CREATE FUNCTION app.j_inteiro(p jsonb, k text, p_min bigint, p_max bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE v jsonb := p -> k;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^-?[0-9]+$' OR (v #>> '{}')::numeric NOT BETWEEN p_min AND p_max THEN
    PERFORM app.invalido(k, 'Campo ' || k || ': número fora do intervalo.');
  END IF;
  RETURN (v #>> '{}')::bigint;
END $$;

-- Instante em epoch ms (0 a 8.64e15, como o zod do legado).
CREATE FUNCTION app.j_instante(p jsonb, k text) RETURNS timestamptz
LANGUAGE sql SET search_path = '' AS $$ SELECT app.de_ms(app.j_inteiro(p, k, 0, 8640000000000000)) $$;

-- Data de calendário 'AAAA-MM-DD' que existe (rejeita 2026-02-30).
CREATE FUNCTION app.j_dia(p jsonb, k text) RETURNS date
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  t text := app.j_texto(p, k, 10);
  d date;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  IF t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN PERFORM app.invalido(k, 'Campo ' || k || ': data inválida (AAAA-MM-DD).'); END IF;
  BEGIN
    d := t::date;
  EXCEPTION WHEN others THEN
    PERFORM app.invalido(k, 'Campo ' || k || ': data inválida (AAAA-MM-DD).');
  END;
  IF to_char(d, 'YYYY-MM-DD') <> t THEN PERFORM app.invalido(k, 'Campo ' || k || ': data inválida (AAAA-MM-DD).'); END IF;
  RETURN d;
END $$;

-- Enum por texto (lista fechada).
CREATE FUNCTION app.j_enum(p jsonb, k text, p_valores text[]) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE t text := app.j_texto(p, k, 40);
BEGIN
  IF t IS NOT NULL AND NOT (t = ANY (p_valores)) THEN PERFORM app.invalido(k, 'Campo ' || k || ': valor inválido.'); END IF;
  RETURN t;
END $$;

-- Limite de página (padrão e teto).
CREATE FUNCTION app.j_limite(p jsonb, p_padrao integer, p_max integer) RETURNS integer
LANGUAGE sql SET search_path = '' AS $$ SELECT coalesce(app.j_inteiro(p, 'limite', 1, p_max), p_padrao)::integer $$;

-- ===== Catálogo e unidades ===========================================================================================
-- Catálogo leve: todas as unidades (inclusive inativas, para o histórico), áreas comuns e o agrupamento. Só sessão.
CREATE FUNCTION api.catalogo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.ator(false, true);
BEGIN
  RETURN jsonb_build_object('agrupamento', app.agrupamento(),
    'unidades', coalesce((SELECT jsonb_agg(app.unidade_json(u) ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero) FROM public.unidade u), '[]'),
    'areasComuns', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'ativo', x.ativo) ORDER BY x.nome, x.id)
                               FROM public.area_comum x), '[]'));
END $$;

CREATE FUNCTION app.unidade_resumo(u public.unidade, p_agora timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('unidade', app.unidade_json(u),
    'moradoresValidos', (SELECT count(*) FROM public.vinculo_unidade v WHERE v.unidade_id = u.id
                           AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, app.dia_brt(p_agora))),
    'pendentes', (SELECT count(*) FROM public.vinculo_unidade v WHERE v.unidade_id = u.id AND v.status = 'pendente'),
    'restricoes', (SELECT count(*) FROM public.restricao r WHERE r.unidade_id = u.id AND r.revogada_em IS NULL AND r.valida_ate >= p_agora),
    'cadastroCompleto', EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.unidade_id = u.id AND v.status = 'aprovado'
                           AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, app.dia_brt(p_agora))))
$$;

-- Página de unidades na ordem bloco/número. Cursor = id da última unidade da página (a chave de ordem sai dela).
CREATE FUNCTION api.unidades_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  bloco text := upper(btrim(app.j_texto(q, 'bloco', 10)));
  cur uuid := app.j_uuid(q, 'cursor');
  c public.unidade;
  itens jsonb;
  n integer;
BEGIN
  IF bloco IS NOT NULL AND bloco !~ '^[A-Z0-9]{1,3}$' THEN PERFORM app.invalido('bloco', 'Bloco inválido.'); END IF;
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.unidade WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH pagina AS (
    SELECT u.id, row_number() OVER (ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero) AS i FROM public.unidade u
     WHERE (bloco IS NULL OR u.bloco = bloco)
       AND (cur IS NULL OR (app.chave_bloco(u.bloco), u.numero::numeric, u.numero) > (app.chave_bloco(c.bloco), c.numero::numeric, c.numero))
     ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero
     LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.unidade_resumo(u, now()) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.unidade u ON u.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim,
    'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) -> 'unidade' ->> 'id' END);
END $$;

-- Vínculos de uma unidade ou pessoa, na ordem de exibição (unidade, pessoa).
CREATE FUNCTION app.vinculos_de(p_unidade uuid, p_pessoa uuid, p_hoje date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(app.vinculo_json(v, p_hoje) ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero, p.nome, v.id), '[]')
    FROM public.vinculo_unidade v JOIN public.unidade u ON u.id = v.unidade_id JOIN public.pessoa p ON p.id = v.pessoa_id
   WHERE (p_unidade IS NULL OR v.unidade_id = p_unidade) AND (p_pessoa IS NULL OR v.pessoa_id = p_pessoa)
$$;

-- Eventos de uma unidade ou pessoa (valor EFETIVO), sem correções, mais recentes primeiro.
CREATE FUNCTION app.eventos_recentes(p_unidade uuid, p_pessoa uuid, p_limite integer) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(app.evento_view(x) ORDER BY x.seq DESC), '[]') FROM (
    SELECT e.* FROM public.evento_acesso e
     WHERE e.tipo <> 'correcao'
       AND (p_unidade IS NULL OR ((e.unidade_destino_id = p_unidade OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c
              WHERE c.corrige_evento_id IS NOT NULL AND c.correcao_valores ? 'unidade_destino_id'))
            AND (app.efetivo(e)).unidade_destino_id IS NOT DISTINCT FROM p_unidade))
       AND (p_pessoa IS NULL OR ((e.pessoa_id = p_pessoa OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c
              WHERE c.corrige_evento_id IS NOT NULL AND c.correcao_valores ? 'pessoa_id'))
            AND app.pessoa_efetiva(e) = p_pessoa))
     ORDER BY e.seq DESC LIMIT p_limite) x
$$;

-- Detalhe: `p_ref` aceita o uuid ou o código ("A-32", "a 32", o antigo "T4-32"). Compõe as seções que no legado o
-- adaptador buscava em paralelo (autorizações e restrições vigentes, últimos 12 acessos sem correções).
CREATE FUNCTION api.unidade_detalhe(p_ref text) RETURNS jsonb
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
    'eventos', app.eventos_recentes(u.id, NULL, 12));
END $$;

-- ===== Vínculos (leitura; a escrita é da F3) ===========================================================================
-- Quem pode autorizar entrada pela unidade: vínculo válido hoje, pessoa ativa e não anonimizada.
CREATE FUNCTION api.vinculos_autorizadores(p_unidade uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver');
  hoje date := app.dia_brt(now());
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('pessoa', app.pessoa_json(p), 'vinculo', app.vinculo_json(v, hoje)) ORDER BY p.nome, v.id)
    FROM public.vinculo_unidade v JOIN public.pessoa p ON p.id = v.pessoa_id
   WHERE v.unidade_id = p_unidade AND p.anonimizada_em IS NULL AND p.desativada_em IS NULL
     AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje)), '[]');
END $$;

CREATE FUNCTION api.vinculos_contar(p_status text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('vinculo.ver', false);
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pendente', 'aprovado', 'rejeitado', 'legado', 'encerrado') THEN
    PERFORM app.invalido('status', 'Status de vínculo inválido.');
  END IF;
  RETURN (SELECT count(*) FROM public.vinculo_unidade WHERE status = p_status::public.status_vinculo);
END $$;

-- Página de vínculos. Ordens do legado: recentes (registro), decisao (decisão/encerramento), prazo (regularização).
-- Cursor = id do último vínculo da página.
CREATE FUNCTION api.vinculos_listar(p jsonb DEFAULT '{}') RETURNS jsonb
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
  c public.vinculo_unidade;
  itens jsonb;
  n integer;
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
    SELECT b.id, row_number() OVER (ORDER BY CASE WHEN ordem = 'prazo' THEN b.chave_d END ASC, CASE WHEN ordem = 'prazo' THEN b.id END ASC,
                                             b.chave_t DESC, b.id DESC) AS i
      FROM base b, chave k
     WHERE cur IS NULL OR (ordem = 'prazo' AND (b.chave_d, b.id) > (k.d, cur)) OR (ordem <> 'prazo' AND (b.chave_t, b.id) < (k.t, cur))
     ORDER BY 2 LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.vinculo_json(v, app.dia_brt(now())) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.vinculo_unidade v ON v.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END);
END $$;

-- ===== Busca de pessoas (busca.service.ts) =============================================================================
/*
 * nome: sem acento e sem caixa, por substring. CPF: 11 dígitos -> igualdade pelo HMAC (Vault); 3 a 10 -> só os dígitos
 * VISÍVEIS da máscara (formato novo pelo começo, antigo em qualquer ponto dos 6 do meio). Unidade: "A-32" -> vínculo
 * pendente, aprovado ou legado. Placa (4+): vínculo válido na unidade do veículo ativo, ou dentro agora tendo entrado
 * com ela. Anonimizada nunca; desativada só com p_incluir_desativadas. O termo não é gravado em lugar nenhum.
 */
CREATE FUNCTION app.buscar_pessoas(p_q text, p_limite integer, p_sem_moradores boolean, p_incluir_desativadas boolean,
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
         OR (length(digitos) BETWEEN 3 AND 10 AND CASE WHEN p.documento_mascarado LIKE '***.%'
               THEN app.so_digitos(p.documento_mascarado) LIKE '%' || digitos || '%'
               ELSE app.so_digitos(p.documento_mascarado) LIKE left(digitos, 5) || '%' END)
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

CREATE FUNCTION api.pessoas_buscar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.ver');
  q jsonb := app.j_objeto(p);
  termo text := app.j_texto(q, 'q', 100);
BEGIN
  RETURN app.buscar_pessoas(termo, app.j_limite(q, 8, 50), coalesce(app.j_bool(q, 'semMoradores'), false),
    coalesce(app.j_bool(q, 'incluirDesativadas'), false), app.pode(a.papel, 'unidade.ver'), now());
END $$;

-- Busca do topo: até 6 pessoas (2+ caracteres), a unidade pelo código e unidades pela placa (3+). Sem selo de restrição.
CREATE FUNCTION api.busca_global(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.ver');
  q jsonb := app.j_objeto(p);
  consulta text := app.aparar(coalesce(app.j_texto(q, 'q', 100), ''));
  placa text := regexp_replace(upper(consulta), '[^A-Z0-9]', '', 'g');
  r jsonb := jsonb_build_object('pessoas', '[]'::jsonb, 'temMais', false);
  unidades jsonb := '[]';
  cod record;
  u public.unidade;
BEGIN
  IF length(consulta) >= 2 THEN r := app.buscar_pessoas(consulta, 6, false, false, false, now()); END IF;
  FOR cod IN SELECT * FROM app.leituras_do_codigo(consulta) ORDER BY ordem LOOP
    SELECT * INTO u FROM public.unidade x WHERE x.bloco = cod.bloco AND x.numero = cod.numero;
    IF u.id IS NOT NULL THEN
      unidades := unidades || jsonb_build_array(jsonb_build_object('id', u.id, 'motivo', CASE WHEN u.ativo THEN 'Unidade' ELSE 'Unidade (desativada)' END));
      EXIT;
    END IF;
  END LOOP;
  IF length(placa) >= 3 THEN
    unidades := unidades || coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.unidade_id, 'motivo', 'Placa ' || app.formatar_placa(v.placa) || ' · ' || v.modelo)
                                        ORDER BY v.placa)
      FROM (SELECT * FROM public.veiculo v WHERE v.ativo AND v.placa LIKE '%' || placa || '%' ORDER BY v.placa LIMIT 6) v), '[]');
  END IF;
  RETURN jsonb_build_object('pessoas', r -> 'pessoas', 'unidades', unidades, 'temMaisPessoas', r -> 'temMais');
END $$;

-- ===== Pessoas: lista, ficha, escala ==================================================================================
-- Lista do Cadastro: ordem nome + id (keyset; cursor = id da última pessoa). Sem filtro de texto (é a busca, por POST).
CREATE FUNCTION api.pessoas_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  cat text := app.j_enum(q, 'categoria', ARRAY['visitante', 'prestador', 'morador', 'funcionario']);
  incl boolean := coalesce(app.j_bool(q, 'incluirDesativadas'), false);
  cur uuid := app.j_uuid(q, 'cursor');
  c public.pessoa;
  com_restricao boolean := app.pode(a.papel, 'unidade.ver');
  itens jsonb;
  n integer;
BEGIN
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.pessoa WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH pagina AS (
    SELECT x.* FROM public.pessoa x
     WHERE (cat IS NULL OR x.categoria = cat::public.categoria_pessoa) AND (incl OR x.desativada_em IS NULL)
       AND (cur IS NULL OR (x.nome, x.id) > (c.nome, c.id))
     ORDER BY x.nome, x.id LIMIT lim + 1
  ), numerada AS (SELECT x, row_number() OVER (ORDER BY x.nome, x.id) AS i FROM pagina x)
  SELECT coalesce(jsonb_agg(app.pessoa_lista_json((x).id, now(), com_restricao) ORDER BY i) FILTER (WHERE i <= lim), '[]'), count(*)
    INTO itens, n FROM numerada;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END);
END $$;

-- PessoaLista: PessoaApi + último acesso + unidades válidas + vínculo principal + selo de restrição.
CREATE FUNCTION app.pessoa_lista_json(p_id uuid, p_agora timestamptz, p_restricao boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT app.pessoa_json(p) || jsonb_build_object('ultimoAcesso', app.ultimo_acesso_texto(p.id, p_agora),
      'unidadesVinculadas', uv -> 'ids', 'unidadesVinculadasCodigos', uv -> 'codigos',
      'vinculoPrincipal', (SELECT jsonb_build_object('id', v.id, 'unidadeId', v.unidade_id, 'unidadeCodigo', app.codigo_unidade(u.bloco, u.numero),
                                    'tipo', v.tipo, 'status', v.status)
                            FROM public.vinculo_unidade v JOIN public.unidade u ON u.id = v.unidade_id WHERE v.pessoa_id = p.id
                           ORDER BY array_position(ARRAY['aprovado', 'legado', 'pendente', 'rejeitado', 'encerrado'], v.status::text), v.registrado_em, v.id
                           LIMIT 1))
    || CASE WHEN p_restricao THEN jsonb_build_object('restricao', app.resumo_restricao(p.id, p_agora)) ELSE '{}' END
    FROM public.pessoa p, LATERAL (SELECT app.unidades_validas(p.id, app.dia_brt(p_agora)) AS uv) x
   WHERE p.id = p_id
$$;

CREATE FUNCTION app.funcionario_json(f public.funcionario) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN f.pessoa_id IS NULL THEN NULL ELSE jsonb_build_object('pessoaId', f.pessoa_id, 'funcao', f.funcao, 'ativo', f.ativo,
    'escala', jsonb_build_object('diasSemana', to_jsonb(f.dias_semana), 'horaInicio', app.hhmm(f.hora_inicio), 'horaFim', app.hhmm(f.hora_fim))) END
$$;

-- Ficha: pessoa (motivo da desativação só para quem pode desativar), funcionário, vínculos e os últimos 10 acessos.
CREATE FUNCTION api.pessoa_ficha(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.ver');
  x public.pessoa;
  f public.funcionario;
BEGIN
  SELECT * INTO x FROM public.pessoa WHERE id = p_id;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  SELECT * INTO f FROM public.funcionario WHERE pessoa_id = p_id;
  RETURN jsonb_build_object('pessoa', app.pessoa_json(x, app.pode(a.papel, 'pessoa.desativar')),
    'funcionario', app.funcionario_json(f), 'vinculos', app.vinculos_de(NULL, p_id, app.dia_brt(now())),
    'eventos', CASE WHEN app.pode(a.papel, 'evento.ver') THEN app.eventos_recentes(NULL, p_id, 10) ELSE '[]'::jsonb END);
END $$;

-- Escala para a tela de entrada (meio "Escala"): só a da pessoa sendo registrada. NULL: não é funcionário.
CREATE FUNCTION api.pessoa_funcionario(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  f public.funcionario;
BEGIN
  SELECT * INTO f FROM public.funcionario WHERE pessoa_id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN app.funcionario_json(f) || jsonb_build_object('emEscalaAgora', app.escala_vigente(f, now()));
END $$;

-- ===== Pessoas: cadastro e desativação (pessoas.service.ts) =============================================================
-- Formato da máscara de um CPF NOVO (formato-cpf.ts, regra anti-reconstrução): 'inicio', salvo se a máscara antiga
-- deste CPF já existe em alguma pessoa ou em algum snapshot do audit_log; aí 'meio'.
CREATE FUNCTION app.formato_cpf_novo(p_cpf text) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.pessoa WHERE documento_mascarado = app.mascarar_cpf(p_cpf, 'meio'))
                OR EXISTS (SELECT 1 FROM public.audit_log WHERE strpos(coalesce(antes::text, '') || ' ' || coalesce(depois::text, ''),
                                                                       app.mascarar_cpf(p_cpf, 'meio')) > 0)
              THEN 'meio' ELSE 'inicio' END
$$;

-- 409 PESSOA_DUPLICADA com detalhes (o id só a quem já acharia a pessoa: ativa -> pessoa.ver; desativada -> pessoa.desativar).
CREATE FUNCTION app.erro_duplicada(a app.ator_t, p_mensagem text, p_id uuid, p_desativada boolean) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
BEGIN
  IF NOT p_desativada THEN
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', p_mensagem, jsonb_build_object('desativada', false)
      || CASE WHEN app.pode(a.papel, 'pessoa.ver') THEN jsonb_build_object('pessoaId', p_id) ELSE '{}' END);
  ELSIF app.pode(a.papel, 'pessoa.desativar') THEN
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', p_mensagem || ' O cadastro está desativado: reative-o em vez de cadastrar de novo.',
      jsonb_build_object('desativada', true, 'pessoaId', p_id));
  ELSE
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', p_mensagem || ' O cadastro está desativado: peça à administração ou ao síndico para reativá-lo.',
      jsonb_build_object('desativada', true));
  END IF;
END $$;

/*
 * Cadastro (RF-02, RN-10, LGPD art. 14 e 18). Ordem das checagens do legado (valoresNovaPessoa). O CPF digitado só
 * existe nesta chamada: vira máscara + HMAC, nunca vai para a trilha nem para a resposta.
 */
CREATE FUNCTION api.pessoa_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.cadastrar_externo');
  q jsonb := app.j_objeto(p);
  nome text := app.aparar(app.j_texto(q, 'nome', 150));
  cat text := app.j_enum(q, 'categoria', ARRAY['visitante', 'prestador', 'morador', 'funcionario']);
  doc text := app.so_digitos(app.j_texto(q, 'documento', 20));
  tel text := app.so_digitos(app.j_texto(q, 'telefone', 20));
  empresa text := app.vazio_para_nulo(app.j_texto(q, 'empresa', 150));
  servico text := app.vazio_para_nulo(app.j_texto(q, 'servico', 150));
  sem_cpf boolean := coalesce(app.j_bool(q, 'semCpf'), false);
  menor boolean := coalesce(app.j_bool(q, 'menorIdade'), false);
  mascarado text;
  busca text;
  igual public.pessoa;
  nova public.pessoa;
BEGIN
  IF cat IS NULL THEN PERFORM app.invalido('categoria', 'Informe a categoria.'); END IF;
  IF cat IN ('morador', 'funcionario') THEN
    PERFORM app.negar_se_nao_pode(a, 'pessoa.cadastrar_morador', 'Seu perfil só cadastra visitante e prestador.');
  END IF;
  IF coalesce(nome, '') = '' THEN PERFORM app.erro(422, 'NOME_OBRIGATORIO', 'Informe o nome.'); END IF;
  IF menor AND cat <> 'morador' THEN PERFORM app.erro(422, 'MENOR_SO_MORADOR', 'Só dependente morador pode ser cadastrado como menor de idade.'); END IF;
  IF menor AND sem_cpf THEN
    PERFORM app.erro(422, 'MENOR_SEM_CPF_EXCECAO', 'Menor de idade não usa a exceção “sem CPF”: deixe o CPF em branco se ele não tiver.');
  END IF;
  IF NOT (menor AND tel = '') AND tel !~ '^[0-9]{10,11}$' THEN
    PERFORM app.erro(422, 'TELEFONE_INVALIDO', 'Informe o telefone com DDD (10 ou 11 dígitos).');
  END IF;
  IF cat = 'prestador' AND empresa IS NULL THEN PERFORM app.erro(422, 'EMPRESA_OBRIGATORIA', 'Prestador exige empresa (RF-36).'); END IF;

  IF menor AND doc = '' THEN
    SELECT * INTO igual FROM public.pessoa x WHERE x.menor_idade AND x.documento_busca IS NULL AND x.anonimizada_em IS NULL
       AND app.sem_acento(x.nome) = app.sem_acento(nome) LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro de menor sem CPF com este nome.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  ELSIF sem_cpf THEN
    SELECT * INTO igual FROM public.pessoa x WHERE x.sem_cpf AND x.telefone = tel AND app.sem_acento(x.nome) = app.sem_acento(nome) LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro sem CPF com este nome e telefone.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  ELSE
    IF doc = '' THEN PERFORM app.erro(422, 'DOCUMENTO_OBRIGATORIO', 'Informe o CPF.'); END IF;
    IF NOT app.cpf_valido(doc) THEN PERFORM app.erro(422, 'CPF_INVALIDO', 'CPF inválido (confira os dígitos).'); END IF;
    mascarado := app.mascarar_cpf(doc, app.formato_cpf_novo(doc));
    busca := public.cpf_hmac(doc);
    SELECT * INTO igual FROM public.pessoa x WHERE x.documento_busca = busca LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro com este CPF.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  END IF;

  BEGIN
    INSERT INTO public.pessoa (nome, categoria, sem_cpf, menor_idade, documento_mascarado, documento_busca, telefone, empresa, servico, criado_em, atualizado_em)
    VALUES (nome, cat::public.categoria_pessoa, sem_cpf, menor, mascarado, busca, nullif(tel, ''), empresa, servico, now(), now())
    RETURNING * INTO nova;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', 'Já existe cadastro com este CPF.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.criar', 'pessoa', nova.id, NULL, NULL, app.snapshot(to_jsonb(nova)));
  RETURN app.pessoa_json(nova);
END $$;

-- Pessoa travada (FOR UPDATE) para desativar/reativar; 404 se não existe.
CREATE FUNCTION app.travar_pessoa(p_id uuid) RETURNS public.pessoa
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE x public.pessoa;
BEGIN
  SELECT * INTO x FROM public.pessoa WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  RETURN x;
END $$;

/*
 * RF-02: desativa (não exclui). FOR UPDATE conflita com o FOR NO KEY UPDATE da entrada e com o FOR SHARE de quem cria
 * autorização para ela: ou a outra escrita termina antes (e é vista aqui), ou espera e vê a pessoa desativada.
 * Autorizações prévias vigentes ou futuras são revogadas na mesma transação, cada uma com a sua linha na trilha.
 */
CREATE FUNCTION api.pessoa_desativar(p_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.desativar');
  antes public.pessoa;
  depois public.pessoa;
  hoje date := app.dia_brt(now());
  erro jsonb;
  revogadas uuid[];
  r public.autorizacao_previa;
BEGIN
  IF length(p_motivo) > 500 THEN PERFORM app.invalido('motivo', 'Campo motivo: no máximo 500 caracteres.'); END IF;
  antes := app.travar_pessoa(p_id);
  erro := app.validar_desativacao_pessoa(antes.anonimizada_em IS NOT NULL, antes.desativada_em IS NOT NULL, p_motivo,
    EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.pessoa_id = p_id
             AND (app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, hoje)
                  OR (v.status = 'aprovado' AND v.vigencia_inicio > hoje))),
    app.esta_dentro(p_id),
    EXISTS (SELECT 1 FROM public.funcionario f WHERE f.pessoa_id = p_id AND f.ativo));
  IF erro IS NOT NULL THEN PERFORM app.erro((erro ->> 'status')::integer, erro ->> 'code', erro ->> 'message'); END IF;
  UPDATE public.pessoa SET desativada_em = now(), desativada_por_id = a.usuario_id, desativacao_motivo = app.aparar(p_motivo), atualizado_em = now()
   WHERE id = p_id RETURNING * INTO depois;
  revogadas := ARRAY[]::uuid[];
  FOR r IN UPDATE public.autorizacao_previa SET revogada_em = now(), revogada_por_id = a.usuario_id
            WHERE pessoa_id = p_id AND revogada_em IS NULL AND valida_ate >= now() RETURNING * LOOP
    revogadas := revogadas || r.id;
    PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'autorizacao.revogar', 'autorizacao_previa', r.id, NULL,
      app.snapshot(to_jsonb(r) || jsonb_build_object('revogada_em', NULL, 'revogada_por_id', NULL)),
      app.snapshot(to_jsonb(r) || jsonb_build_object('motivo', 'desativacao_da_pessoa', 'pessoa_desativada_id', p_id)));
  END LOOP;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.desativar', 'pessoa', p_id, NULL, app.snapshot(to_jsonb(antes)),
    app.snapshot(to_jsonb(depois) || jsonb_build_object('autorizacoes_revogadas', to_jsonb(revogadas))));
  RETURN app.pessoa_json(depois, true) || jsonb_build_object('autorizacoesRevogadas', cardinality(revogadas));
END $$;

-- Reativa: limpa os três campos. As autorizações revogadas na desativação NÃO voltam (revogação é final).
CREATE FUNCTION api.pessoa_reativar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.desativar');
  antes public.pessoa := app.travar_pessoa(p_id);
  depois public.pessoa;
BEGIN
  IF antes.anonimizada_em IS NOT NULL THEN
    PERFORM app.erro(409, 'PESSOA_ANONIMIZADA', 'Cadastro anonimizado não pode ser reativado: faça um novo cadastro.');
  END IF;
  IF antes.desativada_em IS NULL THEN PERFORM app.erro(409, 'PESSOA_JA_ATIVA', 'Este cadastro já está ativo.'); END IF;
  UPDATE public.pessoa SET desativada_em = NULL, desativada_por_id = NULL, desativacao_motivo = NULL, atualizado_em = now()
   WHERE id = p_id RETURNING * INTO depois;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.reativar', 'pessoa', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.pessoa_json(depois, true);
END $$;

-- ===== Posse e EXECUTE (fail-closed: tudo explícito) ======================================================================
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
  api.catalogo(), api.unidades_listar(jsonb), api.unidade_detalhe(text),
  api.vinculos_autorizadores(uuid), api.vinculos_contar(text), api.vinculos_listar(jsonb),
  api.pessoas_buscar(jsonb), api.busca_global(jsonb), api.pessoas_listar(jsonb), api.pessoa_ficha(uuid), api.pessoa_funcionario(uuid),
  api.pessoa_criar(jsonb), api.pessoa_desativar(uuid, text), api.pessoa_reativar(uuid)
TO authenticated;
