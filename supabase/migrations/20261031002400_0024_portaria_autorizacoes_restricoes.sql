-- 0024 — RPCs de autorização prévia (RF-14, RN-07, RF-36) e restrição (RF-15, RF-16, RN-06), F2. Nova: não existe
-- no legado Drizzle. Porte de autorizacoes.service.ts (eae0555). Revogar duas vezes e mudar a aprovação também são
-- barrados no banco (triggers revogacao_congela e restricao_aprovacao_unica da 0001/0007): a RPC confere antes, com a
-- linha travada (FOR UPDATE), para responder 409 legível. Toda criação, revogação e aprovação grava audit_log na mesma
-- transação (RN-11). Datas de calendário chegam como 'AAAA-MM-DD' (dia BRT), como no contrato REST do legado.

-- Erro do banco (corrida com a revogação/aprovação) -> 409 legível, sem a mensagem do driver.
CREATE FUNCTION app.erro_autorizacao(p_estado text, p_entidade text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_estado = '23514' THEN
    IF p_entidade = 'autorizacao' THEN PERFORM app.erro(409, 'AUTORIZACAO_JA_REVOGADA', 'Esta autorização já foi revogada.'); END IF;
    PERFORM app.erro(409, 'RESTRICAO_ALTERADA', 'A restrição mudou ao mesmo tempo (revogada ou aprovada). Atualize a tela.');
  END IF;
  IF p_estado = '23503' THEN PERFORM app.erro(422, 'REFERENCIA_INVALIDA', 'Pessoa, unidade ou área informada não existe.'); END IF;
  PERFORM app.erro(500, 'ERRO_INTERNO', 'O registro não foi aceito. Tente novamente.');
END $$;

CREATE FUNCTION app.tem_vinculo_valido(p_pessoa uuid, p_unidade uuid, p_quando timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.pessoa_id = p_pessoa AND v.unidade_id = p_unidade
                   AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, app.dia_brt(p_quando)))
$$;

-- ===== Autorização prévia ============================================================================================
CREATE FUNCTION api.autorizacao_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('autorizacao.criar');
  q jsonb := app.j_objeto(p);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_area uuid := app.j_uuid(q, 'areaComumId');
  v_pessoa uuid := app.j_uuid(q, 'pessoaId');
  v_de date := app.j_dia(q, 'validaDe');
  v_ate date := app.j_dia(q, 'validaAte');
  v_ini text := app.j_texto(q, 'horaInicio', 5);
  v_fim text := app.j_texto(q, 'horaFim', 5);
  v_solicitante uuid := app.j_uuid(q, 'solicitadaPorPessoaId');
  v_just text := app.j_texto(q, 'justificativa', 500);
  v_dias smallint[];
  hoje date := app.dia_brt(now());
  x public.pessoa;
  sem_solicitante boolean;
  nova public.autorizacao_previa;
  est text;
BEGIN
  IF v_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'Informe a pessoa.'); END IF;
  IF (v_ini IS NOT NULL AND v_ini !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') OR (v_fim IS NOT NULL AND v_fim !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    PERFORM app.invalido('horaInicio', 'Hora inválida (HH:MM).');
  END IF;
  IF q ? 'diasSemana' AND jsonb_typeof(q -> 'diasSemana') <> 'null' THEN
    IF jsonb_typeof(q -> 'diasSemana') <> 'array' OR jsonb_array_length(q -> 'diasSemana') > 7
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(q -> 'diasSemana') d WHERE jsonb_typeof(d) <> 'number' OR (d #>> '{}') !~ '^[0-6]$') THEN
      PERFORM app.invalido('diasSemana', 'Dias da semana inválidos.');
    END IF;
    v_dias := ARRAY(SELECT DISTINCT (d #>> '{}')::smallint FROM jsonb_array_elements(q -> 'diasSemana') d ORDER BY 1);
    IF cardinality(v_dias) NOT BETWEEN 1 AND 6 THEN v_dias := NULL; END IF;
  END IF;
  -- RF-36: área comum é autorizada pela administração.
  IF v_area IS NOT NULL THEN PERFORM app.negar_se_nao_pode(a, 'autorizacao.area_comum'); END IF;
  IF v_ate IS NULL THEN PERFORM app.erro(422, 'VALIDADE_OBRIGATORIA', 'Autorização prévia exige data de validade (RN-07).'); END IF;
  IF v_ate < hoje THEN PERFORM app.erro(422, 'VALIDADE_INVALIDA', 'A validade não pode estar no passado.'); END IF;
  IF v_de IS NOT NULL AND v_de > v_ate THEN PERFORM app.erro(422, 'PERIODO_INVALIDO', 'O início da validade não pode ser posterior ao fim.'); END IF;
  -- FOR SHARE: a desativação concorrente (FOR UPDATE) espera esta autorização nascer, e a revoga junto.
  SELECT * INTO x FROM public.pessoa WHERE id = v_pessoa FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
  END IF;
  IF v_unidade IS NOT NULL AND v_area IS NOT NULL THEN PERFORM app.erro(422, 'DESTINO_DUPLO', 'Informe a unidade OU a área comum, não as duas.'); END IF;
  IF v_unidade IS NULL AND v_area IS NULL THEN PERFORM app.erro(422, 'UNIDADE_OBRIGATORIA', 'Informe a unidade de destino.'); END IF;
  IF (v_ini IS NULL) <> (v_fim IS NULL) THEN PERFORM app.erro(422, 'JANELA_INCOMPLETA', 'Informe hora de início e de fim, ou nenhuma.'); END IF;
  IF v_ini IS NOT NULL AND v_fim <= v_ini THEN PERFORM app.erro(422, 'JANELA_INVALIDA', 'A hora final deve ser posterior à inicial.'); END IF;
  IF v_area IS NOT NULL THEN
    -- Área comum: sem morador solicitante (a administração é a solicitante) e não conta como exceção.
    PERFORM app.area_para_novo_uso(v_area);
    IF x.categoria <> 'prestador' THEN PERFORM app.erro(422, 'AREA_COMUM_SO_PRESTADOR', 'Área comum só é destino de prestador de serviço (RF-36).'); END IF;
    IF v_solicitante IS NOT NULL THEN PERFORM app.erro(422, 'AREA_COMUM_SEM_SOLICITANTE', 'Autorização de área comum não tem morador solicitante.'); END IF;
    sem_solicitante := false;
    v_just := app.vazio_para_nulo(v_just);
  ELSE
    PERFORM app.unidade_para_novo_uso(v_unidade);
    sem_solicitante := v_solicitante IS NULL;
    IF NOT sem_solicitante AND NOT app.tem_vinculo_valido(v_solicitante, v_unidade, now()) THEN
      PERFORM app.erro(422, 'SOLICITANTE_SEM_VINCULO', 'O morador que pediu precisa ter vínculo válido (aprovado ou legado no prazo) com a unidade.');
    END IF;
    IF sem_solicitante AND NOT app.justificativa_valida(v_just) THEN
      PERFORM app.erro(422, 'SOLICITANTE_OU_JUSTIFICATIVA', 'Informe o morador que pediu ou, sem ele, uma justificativa de pelo menos 15 caracteres.');
    END IF;
    v_just := CASE WHEN sem_solicitante THEN app.aparar(v_just) END;
  END IF;
  BEGIN
    INSERT INTO public.autorizacao_previa (pessoa_id, unidade_id, area_comum_id, valida_de, valida_ate, dias_semana, hora_inicio, hora_fim,
      solicitada_por_pessoa_id, sem_solicitante, justificativa, cadastrada_por_id, cadastrada_em)
    VALUES (v_pessoa, CASE WHEN v_area IS NULL THEN v_unidade END, v_area,
      CASE WHEN v_de IS NOT NULL THEN app.inicio_da_data(v_de) ELSE app.inicio_do_dia(now()) END, app.fim_da_data(v_ate), v_dias,
      v_ini::time, v_fim::time, v_solicitante, sem_solicitante, v_just, a.usuario_id, now())
    RETURNING * INTO nova;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_autorizacao(est, 'autorizacao');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'autorizacao.criar', 'autorizacao_previa', nova.id, NULL, NULL, app.snapshot(to_jsonb(nova)));
  RETURN app.autorizacao_view(nova, now());
END $$;

CREATE FUNCTION api.autorizacao_revogar(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('autorizacao.criar');
  antes public.autorizacao_previa;
  depois public.autorizacao_previa;
  est text;
BEGIN
  SELECT * INTO antes FROM public.autorizacao_previa WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'AUTORIZACAO_NAO_ENCONTRADA', 'Autorização não encontrada.'); END IF;
  IF antes.area_comum_id IS NOT NULL THEN
    PERFORM app.negar_se_nao_pode(a, 'autorizacao.area_comum', 'Só síndico ou administração revogam autorização de área comum.');
  END IF;
  IF antes.revogada_em IS NOT NULL THEN PERFORM app.erro(409, 'AUTORIZACAO_JA_REVOGADA', 'Esta autorização já foi revogada.'); END IF;
  BEGIN
    UPDATE public.autorizacao_previa SET revogada_em = now(), revogada_por_id = a.usuario_id WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_autorizacao(est, 'autorizacao');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'autorizacao.revogar', 'autorizacao_previa', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
END $$;

-- Autorizações da pessoa para o destino que valem agora ou valem hoje fora da janela (a tela avisa o horário).
CREATE FUNCTION api.autorizacoes_vigentes(p_pessoa uuid, p_destino uuid, p_area_comum boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('autorizacao.criar');
BEGIN
  RETURN coalesce((SELECT jsonb_agg(app.autorizacao_view(z, now()) ORDER BY z.cadastrada_em, z.id)
    FROM public.autorizacao_previa z
   WHERE z.pessoa_id = p_pessoa AND z.revogada_em IS NULL
     AND CASE WHEN coalesce(p_area_comum, false) THEN z.area_comum_id = p_destino ELSE z.unidade_id = p_destino END
     AND app.estado_autorizacao(z, now()) IN ('valida', 'fora_da_janela')), '[]');
END $$;

-- Autorizações que valem hoje (dia e dia da semana), pela hora de início.
CREATE FUNCTION api.autorizacoes_hoje() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('unidade.ver');
BEGIN
  RETURN coalesce((SELECT jsonb_agg(app.autorizacao_view(z, now()) ORDER BY coalesce(app.hhmm(z.hora_inicio), ''), z.cadastrada_em, z.id) FROM (
    SELECT * FROM public.autorizacao_previa z
     WHERE z.revogada_em IS NULL AND z.valida_de <= app.fim_do_dia(now()) AND z.valida_ate >= app.inicio_do_dia(now())
       AND (z.dias_semana IS NULL OR app.dow(now())::smallint = ANY (z.dias_semana))
     ORDER BY z.cadastrada_em LIMIT 500) z), '[]');
END $$;

/*
 * Previstos: autorização cuja janela vale agora ou começa nas próximas `p_horas` h (1 a 24), de quem NÃO está dentro.
 * Sem CPF e sem telefone (minimização). Polling da tela (60 s): não toca a sessão (ADR 2026-10-29).
 */
CREATE FUNCTION api.autorizacoes_previstas(p_horas integer DEFAULT 12) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver', false);
  horizonte interval;
BEGIN
  IF p_horas IS NULL OR p_horas NOT BETWEEN 1 AND 24 THEN PERFORM app.invalido('horas', 'Horas: de 1 a 24.'); END IF;
  horizonte := make_interval(hours => p_horas);
  RETURN coalesce((SELECT jsonb_agg(v ORDER BY (v ->> 'inicio')::bigint, v ->> 'nome', v ->> 'autorizacaoId') FROM (
    SELECT jsonb_build_object('autorizacaoId', z.id, 'pessoaId', z.pessoa_id, 'nome', x.nome, 'categoria', x.categoria,
             'destino', CASE WHEN z.unidade_id IS NOT NULL
               THEN jsonb_build_object('tipo', 'unidade', 'id', z.unidade_id, 'rotulo', app.codigo_da_unidade(z.unidade_id))
               ELSE jsonb_build_object('tipo', 'area_comum', 'id', z.area_comum_id,
                                       'rotulo', coalesce((SELECT nome FROM public.area_comum WHERE id = z.area_comum_id), '(área comum)')) END,
             'inicio', app.ms(j.inicio), 'fim', app.ms(j.fim)) AS v
      FROM public.autorizacao_previa z JOIN public.pessoa x ON x.id = z.pessoa_id
      CROSS JOIN LATERAL app.proxima_janela(z, now(), horizonte) j
     WHERE z.revogada_em IS NULL AND x.desativada_em IS NULL AND x.anonimizada_em IS NULL
       AND z.valida_ate >= now() AND z.valida_de <= now() + horizonte AND j.inicio IS NOT NULL
       AND NOT app.esta_dentro(z.pessoa_id)
     LIMIT 1000) y LIMIT 200), '[]');
END $$;

-- ===== Restrição ===================================================================================================
-- RF-16: restrições vigentes da pessoa (de unidade e, aprovadas, de condomínio). Sem unidade: só as de condomínio.
CREATE FUNCTION api.restricao_verificar(p_pessoa uuid, p_unidade uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.ver');
  alertas jsonb;
BEGIN
  alertas := coalesce((SELECT jsonb_agg(app.restricao_view(r) ORDER BY r.cadastrada_em, r.id) FROM public.restricao r
                        WHERE r.pessoa_id = p_pessoa AND r.revogada_em IS NULL AND app.restricao_vigente(r, p_pessoa, p_unidade, now())), '[]');
  RETURN jsonb_build_object('restrita', jsonb_array_length(alertas) > 0, 'alertas', alertas);
END $$;

-- RN-06: escopo condomínio nasce pendente; só o síndico aprova. Escopo unidade exige o morador que pediu, com vínculo válido.
CREATE FUNCTION api.restricao_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('restricao.criar');
  q jsonb := app.j_objeto(p);
  v_pessoa uuid := app.j_uuid(q, 'pessoaId');
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_motivo text := app.aparar(coalesce(app.j_texto(q, 'motivo', 300), ''));
  v_ate date := app.j_dia(q, 'validaAte');
  v_solicitante uuid := app.j_uuid(q, 'solicitadaPorPessoaId');
  para_todos boolean := coalesce(app.j_bool(q, 'paraTodoCondominio'), false);
  nova public.restricao;
  est text;
BEGIN
  IF v_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'Informe a pessoa.'); END IF;
  IF v_motivo = '' THEN PERFORM app.erro(422, 'MOTIVO_OBRIGATORIO', 'Informe o motivo da restrição.'); END IF;
  IF v_ate IS NULL THEN PERFORM app.erro(422, 'VALIDADE_OBRIGATORIA', 'Informe até quando a restrição vale.'); END IF;
  IF v_ate < app.dia_brt(now()) THEN PERFORM app.erro(422, 'VALIDADE_INVALIDA', 'A validade da restrição não pode estar no passado.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = v_pessoa) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF NOT para_todos AND v_unidade IS NULL THEN PERFORM app.erro(422, 'UNIDADE_OBRIGATORIA', 'Restrição de unidade exige a unidade.'); END IF;
  IF v_unidade IS NOT NULL THEN PERFORM app.unidade_para_novo_uso(v_unidade); END IF;
  IF NOT para_todos AND v_solicitante IS NULL THEN PERFORM app.erro(422, 'SOLICITANTE_OBRIGATORIO', 'Registre o morador que pediu a restrição.'); END IF;
  IF v_solicitante IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = v_solicitante) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Solicitante não encontrado.'); END IF;
    IF NOT para_todos AND NOT app.tem_vinculo_valido(v_solicitante, v_unidade, now()) THEN
      PERFORM app.erro(422, 'SOLICITANTE_SEM_VINCULO', 'Quem pediu a restrição precisa ter vínculo válido (aprovado ou legado no prazo) com a unidade.');
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.restricao (escopo, unidade_id, pessoa_id, motivo, valida_ate, solicitada_por_pessoa_id, cadastrada_por_id, cadastrada_em)
    VALUES (CASE WHEN para_todos THEN 'condominio' ELSE 'unidade' END::public.escopo_restricao, v_unidade, v_pessoa, v_motivo,
            app.fim_da_data(v_ate), v_solicitante, a.usuario_id, now())
    RETURNING * INTO nova;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_autorizacao(est, 'restricao');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'restricao.criar', 'restricao', nova.id, NULL, NULL, app.snapshot(to_jsonb(nova)));
  RETURN app.restricao_view(nova);
END $$;

-- RN-06: só o síndico aprova (restricao.aprovar). Aprovar duas vezes: 409.
CREATE FUNCTION api.restricao_aprovar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('restricao.aprovar');
  antes public.restricao;
  depois public.restricao;
  est text;
BEGIN
  SELECT * INTO antes FROM public.restricao WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'RESTRICAO_NAO_ENCONTRADA', 'Restrição não encontrada.'); END IF;
  IF antes.escopo <> 'condominio' THEN PERFORM app.erro(422, 'RESTRICAO_NAO_PENDENTE', 'Somente restrições para todo o condomínio exigem aprovação.'); END IF;
  IF antes.aprovada_em IS NOT NULL THEN PERFORM app.erro(409, 'RESTRICAO_JA_APROVADA', 'Restrição já aprovada.'); END IF;
  IF antes.revogada_em IS NOT NULL THEN PERFORM app.erro(409, 'RESTRICAO_JA_REVOGADA', 'Esta restrição já foi revogada.'); END IF;
  BEGIN
    UPDATE public.restricao SET aprovada_por_id = a.usuario_id, aprovada_em = now() WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_autorizacao(est, 'restricao');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'restricao.aprovar', 'restricao', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.restricao_view(depois);
END $$;

CREATE FUNCTION api.restricao_revogar(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.editar');
  antes public.restricao;
  depois public.restricao;
  est text;
BEGIN
  SELECT * INTO antes FROM public.restricao WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'RESTRICAO_NAO_ENCONTRADA', 'Restrição não encontrada.'); END IF;
  IF antes.revogada_em IS NOT NULL THEN PERFORM app.erro(409, 'RESTRICAO_JA_REVOGADA', 'Esta restrição já foi revogada.'); END IF;
  BEGIN
    UPDATE public.restricao SET revogada_em = now(), revogada_por_id = a.usuario_id WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE;
    PERFORM app.erro_autorizacao(est, 'restricao');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'restricao.revogar', 'restricao', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
END $$;

-- Pendentes de aprovação do síndico (escopo condomínio, não aprovadas, não revogadas).
CREATE FUNCTION api.restricoes_pendentes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('unidade.ver');
BEGIN
  RETURN coalesce((SELECT jsonb_agg(app.restricao_view(r) ORDER BY r.cadastrada_em, r.id) FROM (
    SELECT * FROM public.restricao r WHERE r.escopo = 'condominio' AND r.aprovada_em IS NULL AND r.revogada_em IS NULL
     ORDER BY r.cadastrada_em LIMIT 200) r), '[]');
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
  api.autorizacao_criar(jsonb), api.autorizacao_revogar(uuid), api.autorizacoes_vigentes(uuid, uuid, boolean),
  api.autorizacoes_hoje(), api.autorizacoes_previstas(integer),
  api.restricao_verificar(uuid, uuid), api.restricao_criar(jsonb), api.restricao_aprovar(uuid), api.restricao_revogar(uuid),
  api.restricoes_pendentes()
TO authenticated;
