-- 0025 — Vínculos: escrita (F3, item 1). Nova: não existe no legado Drizzle. Porte de vinculos.service.ts e
-- vinculos.controller.ts (eae0555): criar (vinculo.criar), conferência do comprovante, aprovar, rejeitar, regularizar e
-- encerrar (vinculo.decidir; RN-03: o porteiro não decide).
--
-- A máquina de estados continua no banco (trigger vinculo_unidade_transicao, 0001) e nos CHECKs (aprovado exige
-- conferência, inquilino exige fim de vigência...). A RPC confere ANTES, com a linha travada (FOR UPDATE), para responder
-- 409/422 legíveis, e traduz o erro do banco que sobrar (corrida, regra esquecida) sem deixar a mensagem do driver sair
-- (app.erro_vinculo, porte de traduzirErroVinculo). Toda escrita grava audit_log na mesma transação (RN-11).
--
-- Regras do domain portadas aqui (plano A, premissa Q1 assumida): validarConferencia e validarDecisaoVinculo, com teste de
-- paridade em supabase/tests/integracao/paridade-regras.test.ts. cadastroCompleto já existia (app.cadastro_completo, 0021).
-- Datas de calendário chegam como 'AAAA-MM-DD' (dia BRT), como no contrato REST do legado.

-- ===== Regras (porte de @portaria/domain/rules) ========================================================================
-- temNumeroDePessoa: 9+ dígitos seguidos, ignorando ". -" (CPF ou telefone digitado na conferência).
CREATE FUNCTION app.tem_numero_de_pessoa(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT regexp_replace(coalesce(t, ''), '[. -]', '', 'g') ~ '[0-9]{9}' $$;

-- validarConferencia (RF-05). NULL = válida; senão {status, code, message}. `p_data`: início do dia BRT da conferência.
CREATE FUNCTION app.validar_conferencia(p_tipo text, p_descricao text, p_observacao text, p_data timestamptz, p_agora timestamptz) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  d text := app.aparar(coalesce(p_descricao, ''));
  o text := app.aparar(coalesce(p_observacao, ''));
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('escritura', 'contrato_compra_venda', 'contrato_locacao', 'outro') THEN
    RETURN app.e422('TIPO_COMPROVANTE_INVALIDO', 'Tipo de comprovante inválido.');
  END IF;
  IF p_tipo = 'outro' AND d = '' THEN RETURN app.e422('DESCRICAO_OBRIGATORIA', 'Descreva o comprovante quando o tipo for “Outro”.'); END IF;
  IF length(d) > 80 THEN RETURN app.e422('DESCRICAO_LONGA', 'A descrição tem no máximo 80 caracteres.'); END IF;
  IF length(o) > 200 THEN RETURN app.e422('OBSERVACAO_LONGA', 'A observação tem no máximo 200 caracteres.'); END IF;
  IF app.tem_numero_de_pessoa(CASE WHEN p_tipo = 'outro' THEN d ELSE '' END || ' ' || o) THEN
    RETURN app.e422('DADO_PESSOAL_NA_CONFERENCIA', 'Não escreva CPF, telefone ou outro número pessoal na conferência: registre só o tipo do documento.');
  END IF;
  IF p_data > p_agora THEN RETURN app.e422('DATA_FUTURA', 'A data da conferência não pode ser futura.'); END IF;
  RETURN NULL;
END $$;

-- validarDecisaoVinculo (RN-02): rejeitar exige justificativa; aprovar exige conferência registrada.
CREATE FUNCTION app.validar_decisao_vinculo(p_decisao text, p_justificativa text, p_tem_conferencia boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_decisao = 'rejeitar' AND app.aparar(coalesce(p_justificativa, '')) = ''
      THEN app.e422('JUSTIFICATIVA_OBRIGATORIA', 'Rejeitar um vínculo exige justificativa.')
    WHEN p_decisao = 'aprovar' AND NOT coalesce(p_tem_conferencia, false)
      THEN app.e422('CONFERENCIA_OBRIGATORIA', 'Registre a conferência do comprovante (RF-05) antes de aprovar o vínculo.')
  END
$$;

-- ===== Erro do banco num vínculo -> 409/422 legível (traduzirErroVinculo) ==============================================
CREATE FUNCTION app.erro_vinculo(p_estado text, p_constraint text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_estado = '23505' THEN PERFORM app.erro(409, 'VINCULO_DUPLICADO', 'Já existe vínculo ativo ou pendente desta pessoa com a unidade.'); END IF;
  IF p_estado = '23503' THEN PERFORM app.erro(422, 'REFERENCIA_INVALIDA', 'Pessoa ou unidade informada não existe.'); END IF;
  IF p_estado <> '23514' THEN PERFORM app.erro(500, 'ERRO_INTERNO', 'O registro não foi aceito. Tente novamente.'); END IF;
  CASE coalesce(nullif(p_constraint, ''), '-')
    WHEN 'vinculo_aprovado_conferido_ck' THEN PERFORM app.erro(422, 'CONFERENCIA_OBRIGATORIA', 'Registre a conferência do comprovante (RF-05) antes de aprovar o vínculo.');
    WHEN 'vinculo_inquilino_fim_ck' THEN PERFORM app.erro(422, 'VIGENCIA_OBRIGATORIA', 'Inquilino exige data de fim da vigência.');
    WHEN 'vinculo_vigencia_ck' THEN PERFORM app.erro(422, 'VIGENCIA_INVALIDA', 'O fim da vigência não pode ser anterior ao início.');
    WHEN 'vinculo_conferencia_sem_numero_ck' THEN PERFORM app.erro(422, 'DADO_PESSOAL_NA_CONFERENCIA', 'Não escreva CPF, telefone ou outro número pessoal na conferência.');
    WHEN 'vinculo_conferencia_descricao_ck' THEN PERFORM app.erro(422, 'DESCRICAO_OBRIGATORIA', 'Descreva o comprovante (até 80 caracteres) só quando o tipo for “Outro”.');
    WHEN 'vinculo_conferencia_observacao_ck' THEN PERFORM app.erro(422, 'OBSERVACAO_LONGA', 'A observação tem no máximo 200 caracteres.');
    WHEN 'vinculo_rejeicao_justificada_ck' THEN PERFORM app.erro(422, 'JUSTIFICATIVA_OBRIGATORIA', 'Rejeitar um vínculo exige justificativa.');
    WHEN '-' THEN PERFORM app.erro(409, 'TRANSICAO_INVALIDA', 'O vínculo não permite esta operação no estado atual. Atualize a tela e tente de novo.');
    ELSE PERFORM app.erro(422, 'REGRA_VIOLADA', 'Os dados violam uma regra do vínculo.');
  END CASE;
END $$;

-- ===== Helpers ======================================================================================================
-- Vínculo travado (FOR UPDATE) ou 404.
CREATE FUNCTION app.travar_vinculo(p_id uuid) RETURNS public.vinculo_unidade
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.vinculo_unidade;
BEGIN
  SELECT * INTO v FROM public.vinculo_unidade WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'VINCULO_NAO_ENCONTRADO', 'Vínculo não encontrado.'); END IF;
  RETURN v;
END $$;

CREATE FUNCTION app.rotulo_status_vinculo(s public.status_vinculo) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT s::text $$;

-- pessoaDoVinculo: pessoa travada (a categoria pode mudar); RF-02: desativada não vira moradora válida.
CREATE FUNCTION app.pessoa_do_vinculo(p_pessoa uuid) RETURNS public.pessoa
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE x public.pessoa;
BEGIN
  SELECT * INTO x FROM public.pessoa WHERE id = p_pessoa FOR UPDATE;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
  END IF;
  RETURN x;
END $$;

-- RF-04: a categoria de morador nasce na aprovação (e na regularização do legado), com trilha própria.
CREATE FUNCTION app.tornar_morador(a app.ator_t, x public.pessoa) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF x.categoria = 'morador' THEN RETURN; END IF;
  UPDATE public.pessoa SET categoria = 'morador', atualizado_em = now() WHERE id = x.id;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.editar', 'pessoa', x.id, NULL,
    jsonb_build_object('categoria', x.categoria), jsonb_build_object('categoria', 'morador', 'motivo', 'aprovacao_de_vinculo'));
END $$;

-- UPDATE do vínculo com a tradução dos erros do banco. Devolve a linha nova.
CREATE FUNCTION app.atualizar_vinculo(v public.vinculo_unidade) RETURNS public.vinculo_unidade
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r public.vinculo_unidade;
  est text; con text;
BEGIN
  BEGIN
    UPDATE public.vinculo_unidade SET status = v.status, vigencia_fim = v.vigencia_fim, decidido_por_id = v.decidido_por_id,
           decidido_em = v.decidido_em, justificativa = v.justificativa, encerrado_em = v.encerrado_em,
           conferencia_tipo_documento = v.conferencia_tipo_documento, conferencia_descricao = v.conferencia_descricao,
           conferencia_data = v.conferencia_data, conferido_por_id = v.conferido_por_id, conferencia_observacao = v.conferencia_observacao,
           atualizado_em = now()
     WHERE id = v.id RETURNING * INTO r;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME;
    PERFORM app.erro_vinculo(est, con);
  END;
  RETURN r;
END $$;

CREATE FUNCTION app.auditar_vinculo(a app.ator_t, p_acao text, p_antes public.vinculo_unidade, p_depois public.vinculo_unidade) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  SELECT app.auditar(a.usuario_id, a.nome, a.papel, p_acao, 'vinculo_unidade', p_depois.id, NULL,
    CASE WHEN p_antes.id IS NULL THEN NULL ELSE app.snapshot(to_jsonb(p_antes)) END, app.snapshot(to_jsonb(p_depois)))
$$;

-- ===== RPCs ==========================================================================================================
-- RF-03: pedido de vínculo. Nasce pendente; a categoria só vira 'morador' na aprovação (RF-04).
CREATE FUNCTION api.vinculo_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.criar');
  q jsonb := app.j_objeto(p);
  v_pessoa uuid := app.j_uuid(q, 'pessoaId');
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_tipo text := app.j_enum(q, 'tipo', ARRAY['proprietario', 'inquilino', 'dependente']);
  v_ini date := app.j_dia(q, 'vigenciaInicio');
  v_fim date := app.j_dia(q, 'vigenciaFim');
  x public.pessoa;
  novo public.vinculo_unidade;
  est text; con text;
BEGIN
  IF v_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'pessoa inválida'); END IF;
  IF v_unidade IS NULL THEN PERFORM app.invalido('unidadeId', 'unidade inválida'); END IF;
  IF v_tipo IS NULL THEN PERFORM app.invalido('tipo', 'Campo tipo: valor inválido.'); END IF;
  IF v_tipo = 'inquilino' AND v_fim IS NULL THEN PERFORM app.erro(422, 'VIGENCIA_OBRIGATORIA', 'Inquilino exige data de fim da vigência.'); END IF;
  IF v_ini IS NOT NULL AND v_fim IS NOT NULL AND v_fim < v_ini THEN
    PERFORM app.erro(422, 'VIGENCIA_INVALIDA', 'O fim da vigência não pode ser anterior ao início.');
  END IF;
  -- FOR SHARE: a anonimização/desativação concorrente (que altera a pessoa) espera este vínculo nascer, e o vê.
  SELECT * INTO x FROM public.pessoa WHERE id = v_pessoa FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.anonimizada_em IS NOT NULL THEN PERFORM app.erro(422, 'PESSOA_ANONIMIZADA', 'Cadastro anonimizado não recebe vínculo.'); END IF;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
  END IF;
  PERFORM app.unidade_para_novo_uso(v_unidade);
  BEGIN
    INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, vigencia_inicio, vigencia_fim, registrado_por_id, registrado_em, atualizado_em)
    VALUES (v_pessoa, v_unidade, v_tipo::public.tipo_vinculo, 'pendente', v_ini, v_fim, a.usuario_id, now(), now())
    RETURNING * INTO novo;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME;
    PERFORM app.erro_vinculo(est, con);
  END;
  PERFORM app.auditar_vinculo(a, 'vinculo.criar', NULL, novo);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
END $$;

-- RF-05: registra (ou refaz, enquanto pendente/legado) a conferência do comprovante. O conferente é quem está logado.
CREATE FUNCTION api.vinculo_conferir(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.decidir');
  q jsonb := app.j_objeto(p);
  v_tipo text := app.j_enum(q, 'tipo', ARRAY['escritura', 'contrato_compra_venda', 'contrato_locacao', 'outro']);
  v_desc text := app.j_texto(q, 'descricao', 200);
  v_obs text := app.j_texto(q, 'observacao', 400);
  v_dia date := coalesce(app.j_dia(q, 'data'), app.dia_brt(now()));
  antes public.vinculo_unidade;
  novo public.vinculo_unidade;
  erro jsonb;
BEGIN
  IF v_tipo IS NULL THEN PERFORM app.invalido('tipo', 'Campo tipo: valor inválido.'); END IF;
  antes := app.travar_vinculo(p_id);
  IF antes.status NOT IN ('pendente', 'legado') THEN
    PERFORM app.erro(409, 'CONFERENCIA_IMUTAVEL', 'A conferência só pode ser registrada em vínculo pendente ou legado.');
  END IF;
  erro := app.validar_conferencia(v_tipo, v_desc, v_obs, app.inicio_da_data(v_dia), now());
  IF erro IS NOT NULL THEN PERFORM app.erro((erro ->> 'status')::integer, erro ->> 'code', erro ->> 'message'); END IF;
  novo := antes;
  novo.conferencia_tipo_documento := v_tipo::public.tipo_comprovante;
  novo.conferencia_descricao := CASE WHEN v_tipo = 'outro' THEN app.vazio_para_nulo(v_desc) END;
  novo.conferencia_data := v_dia;
  novo.conferido_por_id := a.usuario_id;
  novo.conferencia_observacao := app.vazio_para_nulo(v_obs);
  novo := app.atualizar_vinculo(novo);
  PERFORM app.auditar_vinculo(a, 'vinculo.conferir', antes, novo);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
END $$;

-- RF-06, RN-02, RN-03: aprovar exige cadastro completo e conferência; a pessoa passa a morador.
CREATE FUNCTION api.vinculo_aprovar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.decidir');
  antes public.vinculo_unidade := app.travar_vinculo(p_id);
  novo public.vinculo_unidade;
  x public.pessoa;
  erro jsonb;
BEGIN
  IF antes.status <> 'pendente' THEN
    PERFORM app.erro(409, 'VINCULO_JA_DECIDIDO', 'Este vínculo já foi decidido (está ' || app.rotulo_status_vinculo(antes.status) || ').');
  END IF;
  x := app.pessoa_do_vinculo(antes.pessoa_id);
  IF NOT app.cadastro_completo(x, antes.tipo) THEN
    PERFORM app.erro(422, 'CADASTRO_INCOMPLETO', 'Para aprovar o vínculo a pessoa precisa ter CPF válido (não “sem CPF”) e telefone cadastrados (dependente menor de idade dispensa os dois).');
  END IF;
  -- Aprovar é um novo uso da unidade: desativada barra (422 UNIDADE_INATIVA); FOR SHARE segura a desativação concorrente.
  PERFORM app.unidade_para_novo_uso(antes.unidade_id);
  erro := app.validar_decisao_vinculo('aprovar', NULL, antes.conferido_por_id IS NOT NULL);
  IF erro IS NOT NULL THEN PERFORM app.erro((erro ->> 'status')::integer, erro ->> 'code', erro ->> 'message'); END IF;
  novo := antes;
  novo.status := 'aprovado'; novo.decidido_por_id := a.usuario_id; novo.decidido_em := now();
  novo := app.atualizar_vinculo(novo);
  PERFORM app.auditar_vinculo(a, 'vinculo.aprovar', antes, novo);
  PERFORM app.tornar_morador(a, x);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
END $$;

CREATE FUNCTION api.vinculo_rejeitar(p_id uuid, p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.decidir');
  q jsonb := app.j_objeto(p);
  v_just text := app.aparar(coalesce(app.j_texto(q, 'justificativa', 500), ''));
  antes public.vinculo_unidade;
  novo public.vinculo_unidade;
  erro jsonb;
BEGIN
  antes := app.travar_vinculo(p_id);
  IF antes.status <> 'pendente' THEN
    PERFORM app.erro(409, 'VINCULO_JA_DECIDIDO', 'Este vínculo já foi decidido (está ' || app.rotulo_status_vinculo(antes.status) || ').');
  END IF;
  erro := app.validar_decisao_vinculo('rejeitar', v_just, NULL);
  IF erro IS NOT NULL THEN PERFORM app.erro((erro ->> 'status')::integer, erro ->> 'code', erro ->> 'message'); END IF;
  novo := antes;
  novo.status := 'rejeitado'; novo.decidido_por_id := a.usuario_id; novo.decidido_em := now(); novo.justificativa := v_just;
  novo := app.atualizar_vinculo(novo);
  PERFORM app.auditar_vinculo(a, 'vinculo.rejeitar', antes, novo);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
END $$;

-- RN-09: legado -> aprovado, com conferência registrada e cadastro completo. `vigenciaFim` ausente = mantém; null = sem fim.
CREATE FUNCTION api.vinculo_regularizar(p_id uuid, p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.decidir');
  q jsonb := app.j_objeto(p);
  muda_fim boolean := q ? 'vigenciaFim';
  v_fim date := app.j_dia(q, 'vigenciaFim');
  antes public.vinculo_unidade;
  novo public.vinculo_unidade;
  x public.pessoa;
BEGIN
  antes := app.travar_vinculo(p_id);
  IF antes.status <> 'legado' THEN PERFORM app.erro(409, 'VINCULO_NAO_LEGADO', 'Só vínculo legado (importado da planilha) é regularizado.'); END IF;
  x := app.pessoa_do_vinculo(antes.pessoa_id);
  IF NOT app.cadastro_completo(x, antes.tipo) THEN
    PERFORM app.erro(422, 'CADASTRO_INCOMPLETO', 'Para regularizar, complete o cadastro (CPF válido e telefone) pela ficha da pessoa.');
  END IF;
  PERFORM app.unidade_para_novo_uso(antes.unidade_id); -- regularizar aprova: unidade desativada barra
  IF antes.conferido_por_id IS NULL THEN
    PERFORM app.erro(422, 'CONFERENCIA_OBRIGATORIA', 'Registre a conferência do comprovante (RF-05) antes de regularizar.');
  END IF;
  IF NOT muda_fim THEN v_fim := antes.vigencia_fim; END IF;
  IF antes.tipo = 'inquilino' AND v_fim IS NULL THEN
    PERFORM app.erro(422, 'VIGENCIA_OBRIGATORIA', 'Inquilino exige data de fim da vigência para ser regularizado.');
  END IF;
  IF v_fim IS NOT NULL AND antes.vigencia_inicio IS NOT NULL AND v_fim < antes.vigencia_inicio THEN
    PERFORM app.erro(422, 'VIGENCIA_INVALIDA', 'O fim da vigência não pode ser anterior ao início.');
  END IF;
  novo := antes;
  novo.status := 'aprovado'; novo.vigencia_fim := v_fim; novo.decidido_por_id := a.usuario_id; novo.decidido_em := now();
  novo := app.atualizar_vinculo(novo);
  PERFORM app.auditar_vinculo(a, 'vinculo.regularizar', antes, novo);
  PERFORM app.tornar_morador(a, x);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
END $$;

/*
 * RF-07, encerramento manual. Só aprovado ou legado. Data padrão: hoje; se a vigência já terminou, o fim da vigência.
 * Não pode ser futura nem anterior ao início da vigência. Motivo de 15+ caracteres (MIN_JUSTIFICATIVA) em justificativa.
 * encerrado_em: agora, se a data for hoje; senão, o início do dia informado (BRT).
 */
CREATE FUNCTION api.vinculo_encerrar(p_id uuid, p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('vinculo.decidir');
  q jsonb := app.j_objeto(p);
  v_motivo text := app.aparar(coalesce(app.j_texto(q, 'motivo', 500), ''));
  v_dia date := app.j_dia(q, 'data');
  hoje date := app.dia_brt(now());
  antes public.vinculo_unidade;
  novo public.vinculo_unidade;
BEGIN
  antes := app.travar_vinculo(p_id);
  IF antes.status NOT IN ('aprovado', 'legado') THEN
    PERFORM app.erro(409, 'VINCULO_NAO_ENCERRAVEL', CASE WHEN antes.status = 'pendente'
      THEN 'Vínculo pendente não é encerrado: rejeite a solicitação.'
      ELSE 'Este vínculo já está ' || app.rotulo_status_vinculo(antes.status) || '.' END);
  END IF;
  IF NOT app.justificativa_valida(v_motivo) THEN
    PERFORM app.erro(422, 'MOTIVO_OBRIGATORIO', 'Informe o motivo do encerramento (mínimo de 15 caracteres).');
  END IF;
  v_dia := coalesce(v_dia, CASE WHEN antes.vigencia_fim IS NOT NULL AND antes.vigencia_fim < hoje THEN antes.vigencia_fim ELSE hoje END);
  IF v_dia > hoje THEN
    PERFORM app.erro(422, 'DATA_FUTURA', 'A data do encerramento não pode ser futura. Para encerrar no futuro, ajuste o fim da vigência.');
  END IF;
  IF antes.vigencia_inicio IS NOT NULL AND v_dia < antes.vigencia_inicio THEN
    PERFORM app.erro(422, 'DATA_ANTES_DO_INICIO', 'A data do encerramento não pode ser anterior ao início do vínculo.');
  END IF;
  novo := antes;
  novo.status := 'encerrado'; novo.justificativa := v_motivo;
  novo.encerrado_em := CASE WHEN v_dia = hoje THEN now() ELSE app.inicio_da_data(v_dia) END;
  novo := app.atualizar_vinculo(novo);
  PERFORM app.auditar_vinculo(a, 'vinculo.encerrar', antes, novo);
  RETURN app.vinculo_json(novo, app.dia_brt(now()));
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
  api.vinculo_criar(jsonb), api.vinculo_conferir(uuid, jsonb), api.vinculo_aprovar(uuid), api.vinculo_rejeitar(uuid, jsonb),
  api.vinculo_regularizar(uuid, jsonb), api.vinculo_encerrar(uuid, jsonb)
TO authenticated;
