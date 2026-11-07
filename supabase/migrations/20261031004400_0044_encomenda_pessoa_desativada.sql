-- 0044 — Encomenda não é retirada por cadastro desativado (RF-02: desativada "não pode entrar até ser reativada").
-- Defeito da 0026: api.encomenda_autorizar_retirada só recusava anonimizada/sem CPF, e api.encomenda_entregar só conferia
-- se a pessoa existia. Como a autorização de retirada dispensa o vínculo, uma pessoa desativada autorizada (antes ou
-- depois da desativação) retirava a encomenda. As demais rotas (eventos 0023, autorização prévia 0024, vínculos 0025) já
-- devolvem 422 PESSOA_DESATIVADA com a mesma mensagem.
-- Mudança mínima, o resto do corpo é o da 0026:
--   * entregar: a pessoa é lida com FOR SHARE (como na 0024/0025, a desativação concorrente espera) e, depois do 404 e
--     ANTES de vínculo/autorização, a desativada recebe PESSOA_DESATIVADA.
--   * autorizar: o mesmo para a pessoa autorizada, logo depois do CPF_OBRIGATORIO (anonimizada continua com esse código).
-- O solicitante não ganha checagem própria: desativar exige não ter vínculo válido nem aprovado futuro (0022), e criar,
-- aprovar, regularizar ou importar vínculo recusa pessoa desativada (0025, 0032); logo tem_vinculo_valido já o barra.
-- CREATE OR REPLACE mantém dono (app_rw) e ACL (EXECUTE só para authenticated); mesma assinatura, nomes e retorno.

CREATE OR REPLACE FUNCTION api.encomenda_entregar(p_id uuid, p_pessoa uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('encomenda.operar');
  antes public.encomenda;
  depois public.encomenda;
  x public.pessoa;
  aut uuid;
  est text; con text;
BEGIN
  IF p_pessoa IS NULL THEN PERFORM app.invalido('pessoaId', 'pessoa inválida'); END IF;
  antes := app.travar_encomenda(p_id);
  SELECT * INTO x FROM public.pessoa WHERE id = p_pessoa FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
  END IF;
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

CREATE OR REPLACE FUNCTION api.encomenda_autorizar_retirada(p_id uuid, p jsonb) RETURNS jsonb
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
  SELECT * INTO x FROM public.pessoa WHERE id = v_pessoa FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
  IF x.anonimizada_em IS NOT NULL OR x.sem_cpf OR x.documento_busca IS NULL THEN
    PERFORM app.erro(422, 'CPF_OBRIGATORIO', 'Quem vai retirar precisa estar cadastrado com CPF.');
  END IF;
  IF x.desativada_em IS NOT NULL THEN
    PERFORM app.erro(422, 'PESSOA_DESATIVADA', 'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.');
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
