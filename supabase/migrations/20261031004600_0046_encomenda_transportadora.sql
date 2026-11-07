-- BUG-3: transportadora obrigatória também no servidor (a tela já exigia).
CREATE OR REPLACE FUNCTION api.encomenda_receber(p jsonb) RETURNS jsonb
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
  IF v_transp IS NULL THEN PERFORM app.erro(422, 'TRANSPORTADORA_OBRIGATORIA', 'Informe a transportadora (use "Outra" se não estiver na lista).'); END IF;
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
