-- 0023 — RPCs do registro de acesso (F2): entrada, recusa, saída, correção, permanência, consultas e turno.
-- Nova: não existe no legado Drizzle. Porte de eventos.service.ts (eae0555), na mesma ordem de validações:
--   pessoa (404, anonimizada, desativada) -> unidade/área para novo uso -> instante (retroativo) -> categoria efetiva
--   ("morador" sem vínculo válido vira visitante) -> RESTRIÇÃO VIGENTE (grava "negado") -> autorização
--   (app.validar_autorizacao_entrada, o porte de validarAutorizacaoEntrada) -> "já está dentro" -> grava.
--
-- A cadeia NÃO é calculada aqui: a RPC só faz INSERT em evento_acesso, e o trigger evento_acesso_antes_inserir (0013,
-- dono postgres) trava a cabeça, numera, carimba registrado_em e calcula o hash. A RPC roda como app_rw, que só tem
-- INSERT na tabela (sem UPDATE/DELETE, sem acesso à cabeça): não há como pular nem duplicar a cadeia daqui.
--
-- Negado (desenho §6, premissa ASSUMIDA): a tentativa barrada por restrição é GRAVADA e a RPC devolve SUCESSO com
-- { resultado: 'negado', evento, restricoes, mensagem }. Um RAISE desfaria o INSERT do negado (no legado ele era
-- commitado antes do 422). O adaptador do front converte esse resultado no 422 PESSOA_EM_RESTRICAO de sempre.
--
-- Concorrência (as mesmas travas do legado):
--   * entrada da MESMA pessoa: FOR NO KEY UPDATE na pessoa; a segunda espera e vê "já está dentro";
--   * todas as inserções: FOR UPDATE na cabeça da cadeia, dentro do trigger (seq sem buraco nem repetição);
--   * saída dupla: índice único evento_saida_unica_uq -> 409 SAIDA_JA_REGISTRADA;
--   * correção do mesmo evento: pg_advisory_xact_lock (app_rw não tem UPDATE em evento_acesso, logo não há FOR UPDATE);
--   * prorrogação dupla: índice único (evento, ordem) -> 409 PRORROGACAO_CONCORRENTE.
-- 40001/40P01: o adaptador repete a chamada (até 3 vezes); só se repete o que falhou, então o negado não duplica.

-- ===== Erros do banco num evento -> 409/422 legível (traduzirErroEvento), sem a mensagem do driver ====================
CREATE FUNCTION app.erro_evento(p_estado text, p_constraint text, p_mensagem text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
BEGIN
  IF p_estado = '23505' AND p_constraint = 'evento_saida_unica_uq' THEN PERFORM app.erro(409, 'SAIDA_JA_REGISTRADA', 'A saída desta entrada já foi registrada.'); END IF;
  IF p_estado = '23505' AND p_constraint = 'permanencia_evento_ordem_uq' THEN
    PERFORM app.erro(409, 'PRORROGACAO_CONCORRENTE', 'Outra prorrogação desta entrada acabou de ser registrada. Atualize a tela.');
  END IF;
  IF p_estado = '23503' THEN PERFORM app.erro(422, 'REFERENCIA_INVALIDA', 'Pessoa, unidade, área ou autorização informada não existe.'); END IF;
  IF p_estado <> '23514' THEN PERFORM app.erro(500, 'ERRO_INTERNO', 'O registro não foi aceito. Tente novamente.'); END IF;
  CASE coalesce(nullif(p_constraint, ''), '-')
    WHEN 'evento_retroativo_tempo_ck' THEN PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'Lançamento retroativo exige data e hora reais anteriores ao momento atual.');
    WHEN 'evento_retroativo_formulario_ck' THEN PERFORM app.erro(422, 'FORMULARIO_OBRIGATORIO', 'Registro retroativo exige o número do formulário de contingência.');
    WHEN 'evento_rf17_excecao_ck' THEN PERFORM app.erro(422, 'JUSTIFICATIVA_OBRIGATORIA', 'A exceção exige justificativa de pelo menos 15 caracteres (RF-17).');
    WHEN 'evento_correcao_justificada_ck' THEN PERFORM app.erro(422, 'JUSTIFICATIVA_OBRIGATORIA', 'A correção exige justificativa de pelo menos 15 caracteres (RN-04).');
    WHEN 'evento_rn01_autorizado_por_ck' THEN PERFORM app.erro(422, 'AUTORIZADO_POR_OBRIGATORIO', 'Informe quem autorizou a entrada (RN-01).');
    WHEN 'evento_morador_identificado_ck' THEN PERFORM app.erro(422, 'AUTORIZADO_POR_SEM_IDENTIFICACAO', 'Informe o morador que autorizou (nome obrigatório).');
    WHEN 'evento_destino_obrigatorio_ck' THEN PERFORM app.erro(422, 'UNIDADE_OBRIGATORIA', 'Informe a unidade de destino.');
    WHEN 'evento_area_comum_prestador_ck' THEN PERFORM app.erro(422, 'AREA_COMUM_SO_PRESTADOR', 'Área comum só é destino de prestador de serviço (RF-36).');
    WHEN 'evento_prestador_ck' THEN PERFORM app.erro(422, 'PRESTADOR_SEM_EMPRESA', 'Prestador precisa ter empresa no cadastro.');
    WHEN 'evento_autorizacao_previa_ref_ck' THEN PERFORM app.erro(422, 'AUTORIZACAO_PREVIA_INVALIDA', 'Autorização prévia inexistente, vencida ou fora da janela de dias/horário (RN-07).');
    WHEN 'evento_escala_ck' THEN PERFORM app.erro(422, 'MEIO_INVALIDO_PARA_TIPO', 'Este meio de autorização não se aplica ao tipo de pessoa.');
    WHEN 'permanencia_ordem_ck' THEN PERFORM app.erro(422, 'PRORROGACAO_LIMITE', 'Limite de prorrogações atingido para esta entrada.');
    WHEN 'evento_veiculo_placa_ck' THEN PERFORM app.erro(422, 'PLACA_INVALIDA', 'Placa fora do padrão antigo ou Mercosul.');
    WHEN 'evento_veiculo_detalhe_ck' THEN PERFORM app.erro(422, 'VEICULO_INVALIDO', 'Informe a placa do veículo; modelo e cor são opcionais.');
    WHEN '-' THEN
      -- RAISE dos triggers (0001/0011/0013): a mensagem é nossa e só é lida aqui, nunca devolvida.
      IF p_mensagem ~* '(corrige|correção)' THEN PERFORM app.erro(422, 'CORRECAO_DE_CORRECAO', 'Não é possível corrigir uma correção: corrija o evento original.'); END IF;
      IF p_mensagem ~* 'sem CPF' THEN PERFORM app.erro(422, 'SEM_CPF_SO_EXCECAO', 'Pessoa cadastrada sem CPF só pode entrar por exceção do porteiro, com justificativa.'); END IF;
      IF p_mensagem ~* '(data corrigida|ISO 8601)' THEN PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'A data e hora corrigidas devem ser anteriores ao momento atual.'); END IF;
      IF p_mensagem ~* 'saída precisa' THEN PERFORM app.erro(404, 'ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada.'); END IF;
      IF p_mensagem ~* 'já saiu' THEN PERFORM app.erro(422, 'PESSOA_JA_SAIU', 'A saída desta pessoa já foi registrada: não há permanência a prorrogar.'); END IF;
      IF p_mensagem ~* '(permanência|prorrogação)' THEN PERFORM app.erro(422, 'PERMANENCIA_INVALIDA', 'O prazo de permanência não foi aceito. Atualize a tela e tente de novo.'); END IF;
      PERFORM app.erro(409, 'TRANSICAO_INVALIDA', 'O registro não foi aceito no estado atual. Atualize a tela e tente de novo.');
    ELSE PERFORM app.erro(422, 'REGRA_VIOLADA', 'Os dados violam uma regra do registro de acesso.');
  END CASE;
END $$;

-- INSERT de evento com a tradução dos erros. A cadeia (seq, registrado_em, hash) é do trigger.
CREATE FUNCTION app.inserir_evento(e public.evento_acesso) RETURNS public.evento_acesso
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  r public.evento_acesso;
  est text; con text; msg text;
BEGIN
  BEGIN
    INSERT INTO public.evento_acesso (tipo, categoria_pessoa, pessoa_id, unidade_destino_id, area_comum_id, ponto_acesso_id,
      autorizado_por_tipo, autorizado_por_pessoa_id, autorizacao_previa_id, justificativa, restricao_id, operador_id, operador_papel,
      ocorrido_em, retroativo, formulario_contingencia, refere_evento_id, corrige_evento_id, correcao_valores, empresa, servico,
      observacao, veiculo_placa, veiculo_modelo, veiculo_cor)
    VALUES (e.tipo, e.categoria_pessoa, e.pessoa_id, e.unidade_destino_id, e.area_comum_id, e.ponto_acesso_id,
      e.autorizado_por_tipo, e.autorizado_por_pessoa_id, e.autorizacao_previa_id, e.justificativa, e.restricao_id, e.operador_id, e.operador_papel,
      coalesce(e.ocorrido_em, now()), coalesce(e.retroativo, false), e.formulario_contingencia, e.refere_evento_id, e.corrige_evento_id,
      e.correcao_valores, e.empresa, e.servico, e.observacao, e.veiculo_placa, e.veiculo_modelo, e.veiculo_cor)
    RETURNING * INTO r;
  EXCEPTION WHEN unique_violation OR foreign_key_violation OR check_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME, msg = MESSAGE_TEXT;
    PERFORM app.erro_evento(est, con, msg);
  END;
  RETURN r;
END $$;

-- resolverInstante (RNF-05): retroativo exige hora real anterior a agora (e, na saída, não anterior à entrada) e o
-- formulário; fora dele, o relógio é o do servidor (tolerância de 5 min para o que o front mandar).
CREATE FUNCTION app.resolver_instante(p_retro boolean, p_ocorrido timestamptz, p_formulario text, p_minimo timestamptz,
                                      OUT quando timestamptz, OUT formulario text)
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
BEGIN
  quando := now();
  IF p_retro THEN
    IF p_ocorrido IS NULL OR p_ocorrido >= now() THEN
      PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'Lançamento retroativo exige data e hora reais anteriores ao momento atual.');
    END IF;
    IF p_minimo IS NOT NULL AND p_ocorrido < p_minimo THEN
      PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'A saída retroativa não pode ser anterior à entrada.');
    END IF;
    quando := p_ocorrido;
  ELSIF p_ocorrido IS NOT NULL AND abs(extract(epoch FROM p_ocorrido - now())) > 300 THEN
    PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'Registro que não é retroativo deve ter data e hora atuais.');
  END IF;
  formulario := app.vazio_para_nulo(p_formulario);
  IF p_retro AND formulario IS NULL THEN
    PERFORM app.erro(422, 'FORMULARIO_OBRIGATORIO', 'Registro retroativo exige o número do formulário de contingência.');
  END IF;
  IF NOT p_retro THEN formulario := NULL; END IF;
END $$;

-- Pessoas com vínculo válido na unidade no dia do acesso.
CREATE FUNCTION app.moradores_validos(p_unidade uuid, p_quando timestamptz) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(v.pessoa_id), ARRAY[]::uuid[]) FROM public.vinculo_unidade v
   WHERE v.unidade_id = p_unidade AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, app.dia_brt(p_quando))
$$;

-- "morador" sem vínculo válido (na unidade de destino, ou em qualquer uma sem destino) entra como visitante (RN-01/RN-02).
CREATE FUNCTION app.categoria_efetiva(p public.pessoa, p_unidade uuid, p_quando timestamptz) RETURNS public.categoria_pessoa
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p.categoria <> 'morador' THEN p.categoria
              WHEN EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.pessoa_id = p.id AND (p_unidade IS NULL OR v.unidade_id = p_unidade)
                             AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, app.dia_brt(p_quando)))
              THEN 'morador'::public.categoria_pessoa ELSE 'visitante'::public.categoria_pessoa END
$$;

-- ===== Entrada (RF-12, RF-13, RF-16, RF-17, RF-35, RN-01, RN-07) ======================================================
CREATE FUNCTION api.evento_entrada(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  q jsonb := app.j_objeto(p);
  pessoa_id uuid := app.j_uuid(q, 'pessoaId');
  unidade_id uuid := app.j_uuid(q, 'unidadeDestinoId');
  area_id uuid := app.j_uuid(q, 'areaComumId');
  meio text := app.j_enum(q, 'autorizadoPorTipo', ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala']);
  autorizador uuid := app.j_uuid(q, 'autorizadoPorPessoaId');
  ap_id uuid := app.j_uuid(q, 'autorizacaoPreviaId');
  justificativa text := app.j_texto(q, 'justificativa', 500);
  retro boolean := coalesce(app.j_bool(q, 'retroativo'), false);
  ocorrido timestamptz := app.j_instante(q, 'ocorridoEm');
  observacao text := app.vazio_para_nulo(app.j_texto(q, 'observacao', 500));
  formulario_in text := app.j_texto(q, 'formularioContingencia', 60);
  tipo_visita text := app.j_enum(q, 'tipoVisita', ARRAY['visita', 'entrega', 'transporte_app', 'servico']);
  vq jsonb := q -> 'veiculo';
  placa text; modelo text; cor text;
  x public.pessoa;
  u public.unidade;
  ar public.area_comum;
  inst record;
  categoria public.categoria_pessoa;
  prestador boolean;
  ponto uuid;
  rs public.restricao[];
  aps public.autorizacao_previa[];
  f public.funcionario;
  erro jsonb;
  aut_pessoa uuid;
  ev public.evento_acesso;
  nova public.evento_acesso;
  tipo public.tipo_visita;
  hora_fim time;
  prazo jsonb;
BEGIN
  IF pessoa_id IS NULL THEN PERFORM app.invalido('pessoaId', 'Informe a pessoa.'); END IF;
  IF retro THEN PERFORM app.negar_se_nao_pode(a, 'evento.retroativo'); END IF;
  -- Veículo: só na entrada autorizada (o negado não grava veículo: a pessoa não entrou, minimização).
  IF vq IS NOT NULL AND jsonb_typeof(vq) <> 'null' THEN
    IF jsonb_typeof(vq) <> 'object' THEN PERFORM app.invalido('veiculo', 'Veículo inválido.'); END IF;
    placa := app.normalizar_placa(app.j_texto(vq, 'placa', 10));
    IF placa IS NULL THEN PERFORM app.erro(422, 'PLACA_INVALIDA', 'Placa fora do padrão antigo ou Mercosul.'); END IF;
    modelo := app.vazio_para_nulo(app.j_texto(vq, 'modelo', 60));
    cor := app.vazio_para_nulo(app.j_texto(vq, 'cor', 30));
  END IF;

  -- FOR NO KEY UPDATE: serializa entradas da mesma pessoa sem bloquear as FKs (FOR KEY SHARE) de outros eventos.
  SELECT * INTO x FROM public.pessoa WHERE id = pessoa_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.anonimizada_em IS NOT NULL THEN PERFORM app.erro(422, 'PESSOA_ANONIMIZADA', 'Cadastro anonimizado: faça um novo cadastro.'); END IF;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
  END IF;
  IF unidade_id IS NOT NULL THEN u := app.unidade_para_novo_uso(unidade_id); END IF;
  IF area_id IS NOT NULL THEN ar := app.area_para_novo_uso(area_id); END IF;
  inst := app.resolver_instante(retro, ocorrido, formulario_in, NULL);
  categoria := app.categoria_efetiva(x, unidade_id, inst.quando);
  prestador := categoria = 'prestador';
  IF ar.id IS NOT NULL AND NOT prestador THEN PERFORM app.erro(422, 'AREA_COMUM_SO_PRESTADOR', 'Área comum só é destino de prestador de serviço (RF-36).'); END IF;
  ponto := app.ponto_padrao();

  -- RF-16: restrição vigente BLOQUEIA, e a tentativa fica na trilha como "negado" (gravado; a RPC responde sucesso).
  SELECT coalesce(array_agg(r ORDER BY r.cadastrada_em, r.id), ARRAY[]::public.restricao[]) INTO rs
    FROM public.restricao r WHERE r.pessoa_id = x.id AND r.revogada_em IS NULL AND app.restricao_vigente(r, x.id, unidade_id, inst.quando);
  IF cardinality(rs) > 0 THEN
    ev.tipo := 'negado'; ev.categoria_pessoa := categoria; ev.pessoa_id := x.id; ev.unidade_destino_id := u.id; ev.area_comum_id := ar.id;
    ev.ponto_acesso_id := ponto; ev.restricao_id := rs[1].id; ev.operador_id := a.usuario_id; ev.operador_papel := a.papel;
    ev.ocorrido_em := inst.quando; ev.retroativo := retro; ev.formulario_contingencia := inst.formulario; ev.observacao := observacao;
    nova := app.inserir_evento(ev);
    RETURN jsonb_build_object('resultado', 'negado', 'evento', app.evento_view(nova),
      'restricoes', (SELECT jsonb_agg(app.restricao_view(r)) FROM unnest(rs) r),
      'mensagem', 'Entrada não permitida ' || CASE WHEN u.id IS NOT NULL THEN 'para ' || app.rotulo_unidade(u) ELSE 'no condomínio' END
                  || ': ' || rs[1].motivo || '.');
  END IF;

  -- Autorizações da pessoa para o destino. FOR SHARE: a revogação concorrente espera este registro.
  PERFORM 1 FROM public.autorizacao_previa z WHERE z.pessoa_id = x.id AND z.revogada_em IS NULL
     AND CASE WHEN ar.id IS NOT NULL THEN z.area_comum_id = ar.id WHEN unidade_id IS NOT NULL THEN z.unidade_id = unidade_id ELSE false END
     FOR SHARE;
  SELECT coalesce(array_agg(z ORDER BY z.cadastrada_em, z.id), ARRAY[]::public.autorizacao_previa[]) INTO aps
    FROM public.autorizacao_previa z WHERE z.pessoa_id = x.id AND z.revogada_em IS NULL
     AND CASE WHEN ar.id IS NOT NULL THEN z.area_comum_id = ar.id WHEN unidade_id IS NOT NULL THEN z.unidade_id = unidade_id ELSE false END;
  IF categoria = 'funcionario' THEN SELECT * INTO f FROM public.funcionario WHERE funcionario.pessoa_id = x.id; END IF;
  erro := app.validar_autorizacao_entrada(categoria, unidade_id, area_id, meio::public.meio_autorizacao, autorizador, ap_id, justificativa,
    x.sem_cpf, inst.quando, CASE WHEN u.id IS NOT NULL THEN app.moradores_validos(u.id, inst.quando) ELSE ARRAY[]::uuid[] END, aps, f);
  IF erro IS NOT NULL THEN PERFORM app.erro((erro ->> 'status')::integer, erro ->> 'code', erro ->> 'message'); END IF;

  IF NOT retro AND app.esta_dentro(x.id) THEN
    PERFORM app.erro(409, 'JA_ESTA_DENTRO', x.nome || ' já consta como dentro do condomínio. Registre a saída antes.');
  END IF;

  aut_pessoa := autorizador;
  IF meio = 'autorizacao_previa' THEN SELECT z.solicitada_por_pessoa_id INTO aut_pessoa FROM unnest(aps) z WHERE z.id = ap_id; END IF;
  IF meio IN ('excecao_porteiro', 'escala') THEN aut_pessoa := NULL; END IF;
  IF categoria = 'morador' AND meio IS NULL THEN aut_pessoa := NULL; END IF;

  ev.tipo := 'entrada'; ev.categoria_pessoa := categoria; ev.pessoa_id := x.id; ev.unidade_destino_id := u.id; ev.area_comum_id := ar.id;
  ev.ponto_acesso_id := ponto; ev.autorizado_por_tipo := meio::public.meio_autorizacao; ev.autorizado_por_pessoa_id := aut_pessoa;
  ev.autorizacao_previa_id := CASE WHEN meio = 'autorizacao_previa' THEN ap_id END;
  ev.justificativa := CASE WHEN meio = 'excecao_porteiro' THEN app.aparar(coalesce(justificativa, '')) END;
  ev.operador_id := a.usuario_id; ev.operador_papel := a.papel; ev.ocorrido_em := inst.quando; ev.retroativo := retro;
  ev.formulario_contingencia := inst.formulario; ev.observacao := observacao;
  ev.empresa := CASE WHEN prestador THEN x.empresa END; ev.servico := CASE WHEN prestador THEN x.servico END;
  ev.veiculo_placa := placa; ev.veiculo_modelo := modelo; ev.veiculo_cor := cor;
  nova := app.inserir_evento(ev);

  -- Prazo de permanência (tabela à parte, fora do hash) na MESMA transação, contado do ocorrido_em gravado.
  IF app.tem_prazo_permanencia(categoria) THEN
    tipo := coalesce(tipo_visita::public.tipo_visita, app.tipo_visita_padrao(categoria));
    IF meio = 'autorizacao_previa' THEN SELECT z.hora_fim INTO hora_fim FROM unnest(aps) z WHERE z.id = ap_id; END IF;
    BEGIN
      INSERT INTO public.permanencia (evento_entrada_id, ordem, tipo_visita, prazo_ate, motivo, definido_por_id)
      VALUES (nova.id, 0, tipo, app.prazo_inicial(tipo, nova.ocorrido_em, hora_fim), 'entrada', a.usuario_id);
    EXCEPTION WHEN check_violation OR unique_violation THEN
      DECLARE est text; con text; msg text;
      BEGIN
        GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME, msg = MESSAGE_TEXT;
        PERFORM app.erro_evento(est, con, msg);
      END;
    END;
    prazo := app.permanencia_vigente(nova.id);
  END IF;
  RETURN jsonb_build_object('resultado', 'entrada', 'evento', app.evento_view(nova) || jsonb_build_object('permanencia', prazo));
END $$;

-- ===== Recusa (UC02 A4): o morador recusou a visita; fica na trilha como "recusado" ====================================
CREATE FUNCTION api.evento_recusa(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  q jsonb := app.j_objeto(p);
  pessoa_id uuid := app.j_uuid(q, 'pessoaId');
  unidade_id uuid := app.j_uuid(q, 'unidadeDestinoId');
  meio text := app.j_enum(q, 'meio', ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala']);
  morador uuid := app.j_uuid(q, 'moradorPessoaId');
  retro boolean := coalesce(app.j_bool(q, 'retroativo'), false);
  ocorrido timestamptz := app.j_instante(q, 'ocorridoEm');
  observacao text := app.vazio_para_nulo(app.j_texto(q, 'observacao', 500));
  formulario_in text := app.j_texto(q, 'formularioContingencia', 60);
  x public.pessoa;
  inst record;
  ev public.evento_acesso;
BEGIN
  IF pessoa_id IS NULL OR unidade_id IS NULL OR morador IS NULL OR meio IS NULL THEN
    PERFORM app.invalido('corpo', 'Informe a pessoa, a unidade, o meio e o morador.');
  END IF;
  IF retro THEN PERFORM app.negar_se_nao_pode(a, 'evento.retroativo'); END IF;
  SELECT * INTO x FROM public.pessoa WHERE id = pessoa_id;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  PERFORM app.unidade_para_novo_uso(unidade_id);
  IF NOT app.meio_com_morador(meio::public.meio_autorizacao) THEN
    PERFORM app.erro(422, 'MEIO_INVALIDO_PARA_TIPO', 'A recusa só se registra por interfone, celular ou morador presente.');
  END IF;
  inst := app.resolver_instante(retro, ocorrido, formulario_in, NULL);
  IF NOT (morador = ANY (app.moradores_validos(unidade_id, inst.quando))) THEN
    PERFORM app.erro(422, 'AUTORIZADOR_SEM_VINCULO', 'O morador que recusou não tem vínculo válido (aprovado ou legado no prazo) com a unidade.');
  END IF;
  ev.tipo := 'recusado'; ev.categoria_pessoa := app.categoria_efetiva(x, unidade_id, inst.quando); ev.pessoa_id := x.id;
  ev.unidade_destino_id := unidade_id; ev.ponto_acesso_id := app.ponto_padrao(); ev.autorizado_por_tipo := meio::public.meio_autorizacao;
  ev.autorizado_por_pessoa_id := morador; ev.operador_id := a.usuario_id; ev.operador_papel := a.papel; ev.ocorrido_em := inst.quando;
  ev.retroativo := retro; ev.formulario_contingencia := inst.formulario; ev.observacao := observacao;
  RETURN app.evento_view(app.inserir_evento(ev));
END $$;

-- ===== Saída: um NOVO evento ligado à entrada (RN-04: a entrada não muda) ===============================================
CREATE FUNCTION api.evento_saida(p_entrada uuid, p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  q jsonb := app.j_objeto(p);
  retro boolean := coalesce(app.j_bool(q, 'retroativo'), false);
  ocorrido timestamptz := app.j_instante(q, 'ocorridoEm');
  observacao text := app.vazio_para_nulo(app.j_texto(q, 'observacao', 500));
  formulario_in text := app.j_texto(q, 'formularioContingencia', 60);
  ent public.evento_acesso;
  base public.evento_acesso;
  inst record;
  ev public.evento_acesso;
BEGIN
  IF retro THEN PERFORM app.negar_se_nao_pode(a, 'evento.retroativo'); END IF;
  SELECT * INTO ent FROM public.evento_acesso WHERE id = p_entrada;
  IF NOT FOUND OR ent.tipo <> 'entrada' THEN PERFORM app.erro(404, 'ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada.'); END IF;
  IF EXISTS (SELECT 1 FROM public.evento_acesso WHERE tipo = 'saida' AND refere_evento_id = ent.id) THEN
    PERFORM app.erro(409, 'SAIDA_JA_REGISTRADA', 'A saída desta entrada já foi registrada.');
  END IF;
  base := app.efetivo(ent);
  inst := app.resolver_instante(retro, ocorrido, formulario_in, base.ocorrido_em);
  ev.tipo := 'saida'; ev.categoria_pessoa := ent.categoria_pessoa; ev.pessoa_id := base.pessoa_id; ev.unidade_destino_id := base.unidade_destino_id;
  ev.area_comum_id := base.area_comum_id; ev.ponto_acesso_id := app.ponto_padrao(); ev.operador_id := a.usuario_id; ev.operador_papel := a.papel;
  ev.ocorrido_em := inst.quando; ev.retroativo := retro; ev.refere_evento_id := ent.id; ev.formulario_contingencia := inst.formulario;
  ev.observacao := observacao;
  RETURN app.evento_view(app.inserir_evento(ev));
END $$;

-- ===== Correção (RN-04): evento novo; correcao_valores carrega o ACUMULADO; não se corrige uma correção ================
CREATE FUNCTION api.evento_corrigir(p_evento uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.corrigir');
  q jsonb := app.j_objeto(p);
  justificativa text := app.j_texto(q, 'justificativa', 500);
  observacao text := app.vazio_para_nulo(app.j_texto(q, 'observacao', 500));
  v jsonb := q -> 'valores';
  orig public.evento_acesso;
  atual public.evento_acesso;
  acumulado jsonb;
  novos jsonb := '{}';
  juntos jsonb;
  canonico jsonb := '{}';
  t timestamptz;
  ev public.evento_acesso;
  pid uuid;
BEGIN
  IF v IS NOT NULL AND jsonb_typeof(v) = 'null' THEN v := NULL; END IF;
  IF v IS NOT NULL AND (jsonb_typeof(v) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v) k
       WHERE k NOT IN ('unidadeDestinoId', 'ocorridoEm', 'pessoaId', 'autorizadoPorPessoaId'))) THEN
    PERFORM app.invalido('valores', 'Valores de correção inválidos.');
  END IF;
  -- Serializa correções do mesmo evento: a segunda acumula sobre a primeira.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('correcao:' || p_evento::text, 0));
  SELECT * INTO orig FROM public.evento_acesso WHERE id = p_evento;
  IF NOT FOUND THEN PERFORM app.erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.'); END IF;
  IF orig.tipo = 'correcao' THEN PERFORM app.erro(422, 'CORRECAO_DE_CORRECAO', 'Não é possível corrigir uma correção: corrija o evento original.'); END IF;
  IF NOT app.justificativa_valida(justificativa) THEN
    PERFORM app.erro(422, 'JUSTIFICATIVA_OBRIGATORIA', 'A correção exige justificativa de pelo menos 15 caracteres (RN-04).');
  END IF;
  acumulado := coalesce((app.ultima_correcao(orig.id)).correcao_valores, '{}');
  atual := app.efetivo(orig);
  IF v ? 'unidadeDestinoId' THEN
    IF atual.area_comum_id IS NOT NULL THEN PERFORM app.erro(422, 'DESTINO_AREA_COMUM', 'Evento em área comum não tem unidade de destino para corrigir.'); END IF;
    pid := app.j_uuid(v, 'unidadeDestinoId');
    IF pid IS NULL AND atual.categoria_pessoa <> 'funcionario' THEN PERFORM app.erro(422, 'UNIDADE_OBRIGATORIA', 'Informe a unidade de destino.'); END IF;
    IF pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.unidade WHERE id = pid) THEN
      PERFORM app.erro(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.');
    END IF;
    novos := novos || jsonb_build_object('unidade_destino_id', pid);
  END IF;
  IF v ? 'ocorridoEm' THEN
    t := app.j_instante(v, 'ocorridoEm');
    IF t IS NULL OR t >= now() THEN PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'A data e hora corrigidas devem ser anteriores ao momento atual.'); END IF;
    novos := novos || jsonb_build_object('ocorrido_em', to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  IF v ? 'pessoaId' THEN
    pid := app.j_uuid(v, 'pessoaId');
    IF pid IS NULL OR NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = pid) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
    novos := novos || jsonb_build_object('pessoa_id', pid);
  END IF;
  IF v ? 'autorizadoPorPessoaId' THEN
    pid := app.j_uuid(v, 'autorizadoPorPessoaId');
    IF pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = pid) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Autorizador não encontrado.'); END IF;
    IF pid IS NULL AND app.meio_com_morador(atual.autorizado_por_tipo) THEN PERFORM app.erro(422, 'AUTORIZADOR_OBRIGATORIO', 'Informe o morador que autorizou.'); END IF;
    novos := novos || jsonb_build_object('autorizado_por_pessoa_id', pid);
  END IF;
  juntos := acumulado || novos;
  ev.tipo := 'correcao'; ev.categoria_pessoa := atual.categoria_pessoa; ev.pessoa_id := atual.pessoa_id; ev.unidade_destino_id := atual.unidade_destino_id;
  ev.area_comum_id := atual.area_comum_id; ev.ponto_acesso_id := orig.ponto_acesso_id; ev.justificativa := app.aparar(justificativa);
  ev.operador_id := a.usuario_id; ev.operador_papel := a.papel; ev.ocorrido_em := now(); ev.retroativo := false; ev.corrige_evento_id := orig.id;
  ev.observacao := observacao; ev.correcao_valores := CASE WHEN juntos = '{}' THEN NULL ELSE juntos END;
  RETURN app.evento_view(app.inserir_evento(ev));
END $$;

-- ===== Permanência: "+1h" (linha nova na permanencia; o evento e a cadeia não mudam) ====================================
CREATE FUNCTION api.evento_prorrogar(p_entrada uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  ent public.evento_acesso;
  vig public.permanencia;
  nova public.permanencia;
  r jsonb;
  est text; con text; msg text;
BEGIN
  SELECT * INTO ent FROM public.evento_acesso WHERE id = p_entrada;
  IF NOT FOUND OR ent.tipo <> 'entrada' THEN PERFORM app.erro(404, 'ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada.'); END IF;
  IF EXISTS (SELECT 1 FROM public.evento_acesso WHERE tipo = 'saida' AND refere_evento_id = ent.id) THEN
    PERFORM app.erro(422, 'PESSOA_JA_SAIU', 'A saída desta pessoa já foi registrada: não há permanência a prorrogar.');
  END IF;
  SELECT * INTO vig FROM public.permanencia WHERE evento_entrada_id = ent.id ORDER BY ordem DESC LIMIT 1;
  IF NOT FOUND THEN
    PERFORM app.erro(422, 'SEM_PRAZO_PERMANENCIA', 'Esta entrada não tem prazo de permanência (morador, funcionário ou entrada anterior ao controle de prazo).');
  END IF;
  r := app.proxima_prorrogacao(ent.ocorrido_em, vig.prazo_ate, vig.ordem, now());
  IF NOT (r ->> 'ok')::boolean THEN PERFORM app.erro((r #>> '{erro,status}')::integer, r #>> '{erro,code}', r #>> '{erro,message}'); END IF;
  BEGIN
    INSERT INTO public.permanencia (evento_entrada_id, ordem, tipo_visita, prazo_ate, motivo, definido_por_id)
    VALUES (ent.id, vig.ordem + 1, vig.tipo_visita, app.de_ms((r ->> 'prazoAte')::bigint), 'prorrogacao', a.usuario_id)
    RETURNING * INTO nova;
  EXCEPTION WHEN check_violation OR unique_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME, msg = MESSAGE_TEXT;
    PERFORM app.erro_evento(est, con, msg);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'permanencia.prorrogar', 'permanencia', nova.id, NULL, app.snapshot(to_jsonb(vig)), app.snapshot(to_jsonb(nova)));
  RETURN jsonb_build_object('eventoId', ent.id, 'tipoVisita', nova.tipo_visita, 'prazoAte', app.ms(nova.prazo_ate), 'prorrogacoes', nova.ordem);
END $$;

-- ===== Consultas ======================================================================================================
/*
 * Página de eventos, mais recentes primeiro (seq). Filtros pelos VALORES EFETIVOS (com correção), devolvendo o gravado.
 * Texto do nome e placa (dado pessoal) só no corpo (POST do supabase.rpc). Placa com menos de 3 caracteres é ignorada.
 * Cursor = seq do último evento da página.
 */
CREATE FUNCTION api.eventos_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
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
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN (itens -> (lim - 1) ->> 'seq') END);
END $$;

CREATE FUNCTION api.evento_obter(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.ver');
  e public.evento_acesso;
BEGIN
  SELECT * INTO e FROM public.evento_acesso WHERE id = p_id;
  IF NOT FOUND THEN PERFORM app.erro(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.'); END IF;
  RETURN app.evento_view(e);
END $$;

-- Correções do evento, da mais antiga para a mais nova (linha do tempo da gaveta).
CREATE FUNCTION api.evento_correcoes(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('evento.ver');
BEGIN
  RETURN coalesce((SELECT jsonb_agg(app.evento_view(c) ORDER BY c.seq) FROM (
    SELECT * FROM public.evento_acesso c WHERE c.tipo = 'correcao' AND c.corrige_evento_id = p_id ORDER BY c.seq LIMIT 100) c), '[]');
END $$;

-- RF-20: quem está dentro (entradas sem saída), com o prazo de permanência vigente, pela hora efetiva (mais recente
-- primeiro). Polling da tela: não toca a sessão (ADR 2026-10-29). Teto de 2000 (P2: volume de um condomínio).
CREATE FUNCTION api.eventos_presentes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('evento.ver', false);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(v ORDER BY (v ->> 'ocorridoEm')::bigint DESC, (v ->> 'seq')::bigint DESC) FROM (
    SELECT app.evento_view(e) || jsonb_build_object('permanencia', app.permanencia_vigente(e.id)) AS v FROM (
      SELECT * FROM public.evento_acesso e WHERE e.tipo = 'entrada'
         AND NOT EXISTS (SELECT 1 FROM public.evento_acesso s WHERE s.tipo = 'saida' AND s.refere_evento_id = e.id)
       ORDER BY e.seq DESC LIMIT 2000) e) x), '[]');
END $$;

-- "Mesmo veículo da última visita": o da última ENTRADA com veículo da pessoa efetiva. Anonimizado: nada a oferecer.
CREATE FUNCTION api.evento_ultimo_veiculo(p_pessoa uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('evento.registrar');
  x public.pessoa;
BEGIN
  SELECT * INTO x FROM public.pessoa WHERE id = p_pessoa;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.anonimizada_em IS NOT NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('placa', e.veiculo_placa, 'modelo', e.veiculo_modelo, 'cor', e.veiculo_cor)
            FROM public.evento_acesso e
           WHERE e.tipo = 'entrada' AND e.veiculo_placa IS NOT NULL
             AND (e.pessoa_id = p_pessoa OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c WHERE c.correcao_valores ? 'pessoa_id'))
             AND app.pessoa_efetiva(e) = p_pessoa
           ORDER BY e.seq DESC LIMIT 1);
END $$;

-- RF-29: passagem de turno.
CREATE FUNCTION api.turno_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('turno.ver');
  ini timestamptz := app.inicio_do_dia(now());
  fim timestamptz := app.fim_do_dia(now());
BEGIN
  RETURN jsonb_build_object(
    'pessoasDentro', (SELECT count(*) FROM public.evento_acesso e WHERE e.tipo = 'entrada'
                        AND NOT EXISTS (SELECT 1 FROM public.evento_acesso s WHERE s.tipo = 'saida' AND s.refere_evento_id = e.id)),
    'encomendasPendentes', (SELECT count(*) FROM public.encomenda WHERE retirada_em IS NULL),
    'ocorrenciasAbertas', (SELECT count(*) FROM public.ocorrencia WHERE status <> 'encerrada'),
    'autorizacoesHoje', (SELECT count(*) FROM public.autorizacao_previa WHERE revogada_em IS NULL AND valida_de <= fim AND valida_ate >= ini
                           AND (dias_semana IS NULL OR app.dow(now())::smallint = ANY (dias_semana))),
    'excecoesHoje', (SELECT count(*) FROM public.evento_acesso e WHERE app.eh_excecao(e) AND (app.efetivo(e)).ocorrido_em >= ini),
    'restricoesPendentes', (SELECT count(*) FROM public.restricao WHERE escopo = 'condominio' AND aprovada_em IS NULL AND revogada_em IS NULL));
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
  api.evento_entrada(jsonb), api.evento_recusa(jsonb), api.evento_saida(uuid, jsonb), api.evento_corrigir(uuid, jsonb),
  api.evento_prorrogar(uuid), api.eventos_listar(jsonb), api.evento_obter(uuid), api.evento_correcoes(uuid),
  api.eventos_presentes(), api.evento_ultimo_veiculo(uuid), api.turno_resumo()
TO authenticated;
