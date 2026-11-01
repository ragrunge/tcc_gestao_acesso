-- 0026 — Encomendas (F3, item 2; RF-22 a RF-26, RN-08). Nova: não existe no legado Drizzle. Porte de
-- encomendas.module.ts (eae0555): receber (encomenda.operar), retirar/entregar (encomenda.operar), autorizar retirada
-- (encomenda.autorizar_retirada), listar, resumo e obter (encomenda.ver).
--
-- Regras: receber só com a unidade conferida (RF-23) e ativa; entregar só a quem tem vínculo válido na unidade ou
-- autorização de retirada DESTA encomenda (RN-08); a autorização é a pedido de morador com vínculo válido, para pessoa
-- cadastrada com CPF. Toda escrita grava audit_log na mesma transação (RN-11).
--
-- "Cancelar" encomenda NÃO existe: nem no legado (eae0555) nem no schema (encomenda não tem status de cancelamento), e o
-- trigger encomenda_retirada_congela congela a retirada. Não foi inventado (regra nova exigiria decisão do usuário).
--
-- Concorrência (as mesmas do legado): entregar e autorizar travam a encomenda (FOR UPDATE). A segunda entrega espera,
-- relê "já retirada" e responde 409; o trigger encomenda_retirada_congela é a última barreira (23514 -> 409).

-- ===== Regras (porte de @portaria/domain/rules) ========================================================================
-- diasDesde: dias inteiros desde `p_ts` (mínimo 0).
CREATE FUNCTION app.dias_desde(p_ts timestamptz, p_agora timestamptz) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT greatest(0, floor((app.ms(p_agora) - app.ms(p_ts)) / 86400000.0))::integer
$$;

-- encomendaAtrasada (RF-26): aguardando há mais de N dias inteiros (padrão DIAS_ENCOMENDA_ATRASADA = 7).
CREATE FUNCTION app.encomenda_atrasada(p_recebida timestamptz, p_agora timestamptz, p_dias integer DEFAULT 7) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT app.dias_desde(p_recebida, p_agora) > p_dias $$;

-- ===== Visão (EncomendaView) ===========================================================================================
-- "K108": prefixo fixo + o número (identity) do banco.
CREATE FUNCTION app.codigo_encomenda(p_numero integer) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 'K' || p_numero $$;

CREATE FUNCTION app.autorizacao_retirada_json(r public.autorizacao_retirada) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', r.id, 'encomendaId', r.encomenda_id, 'pessoaAutorizadaId', r.pessoa_autorizada_id,
    'solicitantePessoaId', r.solicitante_pessoa_id, 'registradaPorId', r.registrada_por_id, 'registradaEm', app.ms(r.registrada_em))
$$;

-- "Lúcia Ribeiro (dependente)" (pelo vínculo mais antigo dela com a unidade) ou "Fulano (autorizado por Ana Ribeiro)".
CREATE FUNCTION app.retirada_por_nome(e public.encomenda) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN e.retirada_por_pessoa_id IS NULL THEN NULL
    WHEN e.retirada_autorizacao_id IS NOT NULL THEN app.nome_pessoa(e.retirada_por_pessoa_id, '?') || ' (autorizado por '
      || coalesce((SELECT app.nome_pessoa(r.solicitante_pessoa_id, '?') FROM public.autorizacao_retirada r WHERE r.id = e.retirada_autorizacao_id), '?') || ')'
    ELSE app.nome_pessoa(e.retirada_por_pessoa_id, '?') || ' (' || coalesce((
      SELECT CASE v.tipo WHEN 'dependente' THEN 'dependente' WHEN 'inquilino' THEN 'inquilino' ELSE 'morador' END
        FROM public.vinculo_unidade v WHERE v.pessoa_id = e.retirada_por_pessoa_id AND v.unidade_id = e.unidade_id
       ORDER BY v.registrado_em, v.id LIMIT 1), 'morador') || ')'
  END
$$;

CREATE FUNCTION app.encomenda_view(e public.encomenda) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', e.id, 'codigo', app.codigo_encomenda(e.numero), 'unidadeId', e.unidade_id, 'destinatario', e.destinatario,
    'transportadora', coalesce(e.transportadora, ''), 'codigoRastreio', coalesce(e.codigo_rastreio, ''), 'recebidaPorId', e.recebida_por_id,
    'recebidaEm', app.ms(e.recebida_em), 'unidadeConfirmada', e.unidade_confirmada, 'retiradaEm', app.ms(e.retirada_em),
    'retiradaPorPessoaId', e.retirada_por_pessoa_id, 'retiradaRegistradaPorId', e.retirada_registrada_por_id,
    'retiradaAutorizacaoId', e.retirada_autorizacao_id, 'unidadeCodigo', coalesce(app.codigo_da_unidade(e.unidade_id), '?'),
    'recebidaPorNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = e.recebida_por_id), '?'),
    'retiradaPorNome', app.retirada_por_nome(e),
    'retiradaRegistradaPorNome', CASE WHEN e.retirada_registrada_por_id IS NOT NULL
      THEN coalesce((SELECT nome FROM public.usuario_sistema WHERE id = e.retirada_registrada_por_id), '?') END,
    'autorizacoes', coalesce((SELECT jsonb_agg(app.autorizacao_retirada_json(r) || jsonb_build_object(
        'pessoaNome', app.nome_pessoa(r.pessoa_autorizada_id, '?'), 'solicitanteNome', app.nome_pessoa(r.solicitante_pessoa_id, '?'))
        ORDER BY r.registrada_em, r.id) FROM public.autorizacao_retirada r WHERE r.encomenda_id = e.id), '[]'))
$$;

-- Erro do banco numa escrita de encomenda -> resposta legível, sem a mensagem do driver.
CREATE FUNCTION app.erro_encomenda(p_estado text, p_constraint text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_estado = '23514' AND coalesce(p_constraint, '') = '' THEN PERFORM app.erro(409, 'ENCOMENDA_JA_ENTREGUE', 'Esta encomenda já foi retirada.'); END IF;
  IF p_estado = '23505' AND p_constraint = 'autorizacao_retirada_pessoa_uq' THEN
    PERFORM app.erro(409, 'AUTORIZACAO_DUPLICADA', 'Esta pessoa já está autorizada a retirar esta encomenda.');
  END IF;
  IF p_estado = '23503' THEN PERFORM app.erro(422, 'REFERENCIA_INVALIDA', 'Pessoa ou unidade informada não existe.'); END IF;
  IF p_estado = '23514' THEN PERFORM app.erro(422, 'REGRA_VIOLADA', 'Os dados violam uma regra da encomenda.'); END IF;
  PERFORM app.erro(500, 'ERRO_INTERNO', 'O registro não foi aceito. Tente novamente.');
END $$;

CREATE FUNCTION app.travar_encomenda(p_id uuid) RETURNS public.encomenda
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE e public.encomenda;
BEGIN
  SELECT * INTO e FROM public.encomenda WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'ENCOMENDA_NAO_ENCONTRADA', 'Encomenda não encontrada.'); END IF;
  IF e.retirada_em IS NOT NULL THEN PERFORM app.erro(409, 'ENCOMENDA_JA_ENTREGUE', 'Esta encomenda já foi retirada.'); END IF;
  RETURN e;
END $$;

-- ===== Leitura ======================================================================================================
-- RF-26: filas por status, mais recentes primeiro (recebida_em, id). Cursor = id da última encomenda da página.
CREATE FUNCTION api.encomendas_listar(p jsonb DEFAULT '{}') RETURNS jsonb
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
  -- Aguardando: pelo status ou pelo filtro de atrasadas (atrasada é sempre aguardando).
  pendentes boolean := v_status IS NOT DISTINCT FROM 'aguardando' OR v_dias IS NOT NULL;
  c public.encomenda;
  itens jsonb;
  n integer;
BEGIN
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.encomenda WHERE id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH pagina AS (
    SELECT e.id, row_number() OVER (ORDER BY e.recebida_em DESC, e.id DESC) AS i FROM public.encomenda e
     WHERE (NOT pendentes OR e.retirada_em IS NULL)
       AND (v_status IS DISTINCT FROM 'entregue' OR e.retirada_em IS NOT NULL)
       AND (v_unidade IS NULL OR e.unidade_id = v_unidade)
       AND (v_dias IS NULL OR app.encomenda_atrasada(e.recebida_em, now(), v_dias))
       AND (cur IS NULL OR (e.recebida_em, e.id) < (c.recebida_em, c.id))
     ORDER BY e.recebida_em DESC, e.id DESC LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.encomenda_view(e) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.encomenda e ON e.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END);
END $$;

-- Contagens das abas e do painel: aguardando, atrasadas (há mais de `p_dias`, padrão 7) e entregues.
CREATE FUNCTION api.encomendas_resumo(p_dias integer DEFAULT 7) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.ver');
  d integer := coalesce(p_dias, 7);
BEGIN
  IF d NOT BETWEEN 0 AND 365 THEN PERFORM app.invalido('dias', 'Dias: de 0 a 365.'); END IF;
  RETURN jsonb_build_object(
    'aguardando', (SELECT count(*) FROM public.encomenda WHERE retirada_em IS NULL),
    'atrasadas', (SELECT count(*) FROM public.encomenda WHERE retirada_em IS NULL AND app.encomenda_atrasada(recebida_em, now(), d)),
    'entregues', (SELECT count(*) FROM public.encomenda WHERE retirada_em IS NOT NULL),
    'diasAtraso', d);
END $$;

CREATE FUNCTION api.encomenda_obter(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.ver');
  e public.encomenda;
BEGIN
  SELECT * INTO e FROM public.encomenda WHERE id = p_id;
  IF NOT FOUND THEN PERFORM app.erro(404, 'ENCOMENDA_NAO_ENCONTRADA', 'Encomenda não encontrada.'); END IF;
  RETURN app.encomenda_view(e);
END $$;

-- ===== Escrita ======================================================================================================
-- RF-22, RF-23: unidade conferida e ativa (FOR SHARE contra a desativação concorrente).
CREATE FUNCTION api.encomenda_receber(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.operar');
  q jsonb := app.j_objeto(p);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_dest text := app.aparar(coalesce(app.j_texto(q, 'destinatario', 120), ''));
  v_transp text := app.vazio_para_nulo(app.j_texto(q, 'transportadora', 60));
  v_rastreio text := app.vazio_para_nulo(app.j_texto(q, 'codigoRastreio', 60));
  v_conf boolean := app.j_bool(q, 'unidadeConfirmada');
  e public.encomenda;
  est text; con text;
BEGIN
  IF v_unidade IS NULL THEN PERFORM app.invalido('unidadeId', 'unidade inválida'); END IF;
  IF v_conf IS NULL THEN PERFORM app.invalido('unidadeConfirmada', 'Campo unidadeConfirmada: esperado verdadeiro ou falso.'); END IF;
  IF NOT v_conf THEN PERFORM app.erro(422, 'UNIDADE_NAO_CONFIRMADA', 'Confirme a unidade de destino antes de salvar (RF-23).'); END IF;
  IF v_dest = '' THEN PERFORM app.erro(422, 'DESTINATARIO_OBRIGATORIO', 'Informe o destinatário.'); END IF;
  PERFORM app.unidade_para_novo_uso(v_unidade);
  BEGIN
    INSERT INTO public.encomenda (unidade_id, destinatario, transportadora, codigo_rastreio, unidade_confirmada, recebida_por_id, recebida_em)
    VALUES (v_unidade, v_dest, v_transp, v_rastreio, true, a.usuario_id, now()) RETURNING * INTO e;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME;
    PERFORM app.erro_encomenda(est, con);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'encomenda.receber', 'encomenda', e.id, NULL, NULL, app.snapshot(to_jsonb(e)));
  RETURN app.encomenda_view(e);
END $$;

-- RF-25, RN-08: vínculo válido na unidade OU autorização de retirada desta encomenda para esta pessoa.
CREATE FUNCTION api.encomenda_entregar(p_id uuid, p_pessoa uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.operar');
  antes public.encomenda;
  depois public.encomenda;
  aut uuid;
  est text; con text;
BEGIN
  IF p_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'pessoa inválida'); END IF;
  antes := app.travar_encomenda(p_id);
  IF NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = p_pessoa) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF NOT app.tem_vinculo_valido(p_pessoa, antes.unidade_id, now()) THEN
    SELECT r.id INTO aut FROM public.autorizacao_retirada r WHERE r.encomenda_id = p_id AND r.pessoa_autorizada_id = p_pessoa;
    IF aut IS NULL THEN
      PERFORM app.erro(422, 'PESSOA_SEM_VINCULO', 'Esta pessoa não tem vínculo com a ' || coalesce(app.codigo_da_unidade(antes.unidade_id), 'unidade')
        || ' nem autorização de retirada. Contate a unidade.');
    END IF;
  END IF;
  BEGIN
    UPDATE public.encomenda SET retirada_em = now(), retirada_por_pessoa_id = p_pessoa, retirada_registrada_por_id = a.usuario_id,
           retirada_autorizacao_id = aut
     WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME;
    PERFORM app.erro_encomenda(est, con);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'encomenda.entregar', 'encomenda', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.encomenda_view(depois);
END $$;

-- RN-08: "ou a pessoa autorizada por ela". Retirante com CPF; solicitante com vínculo válido na unidade.
CREATE FUNCTION api.encomenda_autorizar_retirada(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.autorizar_retirada');
  q jsonb := app.j_objeto(p);
  v_pessoa uuid := app.j_uuid(q, 'pessoaId');
  v_solic uuid := app.j_uuid(q, 'solicitadaPorPessoaId');
  e public.encomenda;
  x public.pessoa;
  nova public.autorizacao_retirada;
  est text; con text;
BEGIN
  IF v_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'pessoa inválida'); END IF;
  IF v_solic IS NULL THEN PERFORM app.invalido('solicitadaPorPessoaId', 'solicitante inválido'); END IF;
  e := app.travar_encomenda(p_id);
  SELECT * INTO x FROM public.pessoa WHERE id = v_pessoa;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.anonimizada_em IS NOT NULL OR x.sem_cpf OR x.documento_busca IS NULL THEN
    PERFORM app.erro(422, 'CPF_OBRIGATORIO', 'Quem vai retirar precisa estar cadastrado com CPF.');
  END IF;
  IF NOT app.tem_vinculo_valido(v_solic, e.unidade_id, now()) THEN
    PERFORM app.erro(422, 'SOLICITANTE_SEM_VINCULO', 'Quem autoriza precisa ter vínculo válido (aprovado ou legado no prazo) com a unidade da encomenda.');
  END IF;
  IF v_pessoa = v_solic THEN PERFORM app.erro(422, 'AUTORIZACAO_PROPRIA', 'O morador com vínculo já pode retirar: não precisa se autorizar.'); END IF;
  IF EXISTS (SELECT 1 FROM public.autorizacao_retirada r WHERE r.encomenda_id = p_id AND r.pessoa_autorizada_id = v_pessoa) THEN
    PERFORM app.erro(409, 'AUTORIZACAO_DUPLICADA', 'Esta pessoa já está autorizada a retirar esta encomenda.');
  END IF;
  BEGIN
    INSERT INTO public.autorizacao_retirada (encomenda_id, pessoa_autorizada_id, solicitante_pessoa_id, registrada_por_id, registrada_em)
    VALUES (p_id, v_pessoa, v_solic, a.usuario_id, now()) RETURNING * INTO nova;
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS est = RETURNED_SQLSTATE, con = CONSTRAINT_NAME;
    PERFORM app.erro_encomenda(est, con);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'encomenda.autorizarRetirada', 'autorizacao_retirada', nova.id, NULL, NULL, app.snapshot(to_jsonb(nova)));
  RETURN app.autorizacao_retirada_json(nova);
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
  api.encomendas_listar(jsonb), api.encomendas_resumo(integer), api.encomenda_obter(uuid), api.encomenda_receber(jsonb),
  api.encomenda_entregar(uuid, uuid), api.encomenda_autorizar_retirada(uuid, jsonb)
TO authenticated;
