-- 0045 — Consistência da portaria (plano de teste, rodada 2: BUG-5 a BUG-8). Corpos copiados da 0023; só muda o listado.
--   * BUG-5: entrada retroativa barra com 409 JA_ESTA_DENTRO quando a pessoa tinha entrada aberta (sem saída) com
--     ocorrido EFETIVO <= instante informado. Retroativo anterior a uma entrada aberta mais nova continua aceito (a
--     contingência chega fora de ordem); até a saída retroativa ser lançada, a pessoa fica com duas entradas abertas.
--   * BUG-6: janela de 72 h (antes de now()) para retroativo de entrada, recusa e saída; acima dela exige a ação nova
--     evento.retroativo_antigo (síndico e administração), senão 422 RETROATIVO_FORA_DA_JANELA. Checada nas RPCs depois de
--     app.resolver_instante (assinatura intacta), então formulário ausente e saída antes da entrada mantêm o erro de antes.
--   * BUG-7: correção de ocorridoEm respeita o par: entrada <= saída efetiva; saída >= entrada efetiva (422 DATA_INCONSISTENTE).
--   * BUG-8: correção de pessoaId de entrada ainda aberta barra com 409 JA_ESTA_DENTRO se a pessoa nova tem outra entrada
--     aberta. Entrada já fechada não é conferida (sobreposição histórica fica para a revisão da trilha).
-- CREATE OR REPLACE mantém dono (app_rw) e ACL das RPCs; os dois helpers novos recebem o mesmo dono e nenhum EXECUTE.

-- ===== Matriz RBAC ============================================================================================
-- ===== Bloco gerado (scripts/rbac-sql.mjs migracao) ===========================================================
DELETE FROM public.rbac_matriz;

INSERT INTO public.rbac_acao (acao) VALUES
  ('auditoria.exportar'),
  ('auditoria.selar'),
  ('auditoria.verificar'),
  ('autorizacao.area_comum'),
  ('autorizacao.criar'),
  ('documento.ver'),
  ('encomenda.autorizar_retirada'),
  ('encomenda.operar'),
  ('encomenda.ver'),
  ('evento.corrigir'),
  ('evento.registrar'),
  ('evento.retroativo'),
  ('evento.retroativo_antigo'),
  ('evento.ver'),
  ('funcionario.gerenciar'),
  ('funcionario.ver'),
  ('importacao.executar'),
  ('lgpd.anonimizar'),
  ('lgpd.exportar'),
  ('lgpd.retencao'),
  ('ocorrencia.operar'),
  ('ocorrencia.ver'),
  ('pessoa.cadastrar_externo'),
  ('pessoa.cadastrar_morador'),
  ('pessoa.desativar'),
  ('pessoa.editar'),
  ('pessoa.ver'),
  ('relatorio.ver'),
  ('restricao.aprovar'),
  ('restricao.criar'),
  ('turno.ver'),
  ('unidade.editar'),
  ('unidade.ver'),
  ('usuario.gerenciar'),
  ('usuario.gerenciar_sindico'),
  ('usuario.ver'),
  ('veiculo.cadastrar'),
  ('vinculo.criar'),
  ('vinculo.decidir'),
  ('vinculo.ver')
ON CONFLICT (acao) DO NOTHING;

INSERT INTO public.rbac_matriz (acao, papel) VALUES
  ('auditoria.exportar', 'sindico'),
  ('auditoria.exportar', 'administracao'),
  ('auditoria.exportar', 'auditor'),
  ('auditoria.selar', 'sindico'),
  ('auditoria.selar', 'auditor'),
  ('auditoria.verificar', 'sindico'),
  ('auditoria.verificar', 'administracao'),
  ('auditoria.verificar', 'auditor'),
  ('autorizacao.area_comum', 'sindico'),
  ('autorizacao.area_comum', 'administracao'),
  ('autorizacao.criar', 'sindico'),
  ('autorizacao.criar', 'administracao'),
  ('autorizacao.criar', 'porteiro'),
  ('documento.ver', 'sindico'),
  ('documento.ver', 'administracao'),
  ('encomenda.autorizar_retirada', 'sindico'),
  ('encomenda.autorizar_retirada', 'administracao'),
  ('encomenda.autorizar_retirada', 'porteiro'),
  ('encomenda.operar', 'sindico'),
  ('encomenda.operar', 'administracao'),
  ('encomenda.operar', 'porteiro'),
  ('encomenda.ver', 'sindico'),
  ('encomenda.ver', 'administracao'),
  ('encomenda.ver', 'porteiro'),
  ('encomenda.ver', 'auditor'),
  ('evento.corrigir', 'sindico'),
  ('evento.corrigir', 'administracao'),
  ('evento.registrar', 'sindico'),
  ('evento.registrar', 'administracao'),
  ('evento.registrar', 'porteiro'),
  ('evento.retroativo', 'sindico'),
  ('evento.retroativo', 'administracao'),
  ('evento.retroativo', 'porteiro'),
  ('evento.retroativo_antigo', 'sindico'),
  ('evento.retroativo_antigo', 'administracao'),
  ('evento.ver', 'sindico'),
  ('evento.ver', 'administracao'),
  ('evento.ver', 'porteiro'),
  ('evento.ver', 'auditor'),
  ('funcionario.gerenciar', 'sindico'),
  ('funcionario.gerenciar', 'administracao'),
  ('funcionario.ver', 'sindico'),
  ('funcionario.ver', 'administracao'),
  ('funcionario.ver', 'auditor'),
  ('importacao.executar', 'sindico'),
  ('importacao.executar', 'administracao'),
  ('lgpd.anonimizar', 'sindico'),
  ('lgpd.exportar', 'sindico'),
  ('lgpd.exportar', 'administracao'),
  ('lgpd.retencao', 'sindico'),
  ('ocorrencia.operar', 'sindico'),
  ('ocorrencia.operar', 'administracao'),
  ('ocorrencia.operar', 'porteiro'),
  ('ocorrencia.ver', 'sindico'),
  ('ocorrencia.ver', 'administracao'),
  ('ocorrencia.ver', 'porteiro'),
  ('ocorrencia.ver', 'auditor'),
  ('pessoa.cadastrar_externo', 'sindico'),
  ('pessoa.cadastrar_externo', 'administracao'),
  ('pessoa.cadastrar_externo', 'porteiro'),
  ('pessoa.cadastrar_morador', 'sindico'),
  ('pessoa.cadastrar_morador', 'administracao'),
  ('pessoa.desativar', 'sindico'),
  ('pessoa.desativar', 'administracao'),
  ('pessoa.editar', 'sindico'),
  ('pessoa.editar', 'administracao'),
  ('pessoa.ver', 'sindico'),
  ('pessoa.ver', 'administracao'),
  ('pessoa.ver', 'porteiro'),
  ('pessoa.ver', 'auditor'),
  ('relatorio.ver', 'sindico'),
  ('relatorio.ver', 'administracao'),
  ('relatorio.ver', 'auditor'),
  ('restricao.aprovar', 'sindico'),
  ('restricao.criar', 'sindico'),
  ('restricao.criar', 'administracao'),
  ('restricao.criar', 'porteiro'),
  ('turno.ver', 'sindico'),
  ('turno.ver', 'administracao'),
  ('turno.ver', 'porteiro'),
  ('unidade.editar', 'sindico'),
  ('unidade.editar', 'administracao'),
  ('unidade.ver', 'sindico'),
  ('unidade.ver', 'administracao'),
  ('unidade.ver', 'porteiro'),
  ('unidade.ver', 'auditor'),
  ('usuario.gerenciar', 'sindico'),
  ('usuario.gerenciar', 'admin_sistema'),
  ('usuario.gerenciar_sindico', 'sindico'),
  ('usuario.ver', 'sindico'),
  ('usuario.ver', 'administracao'),
  ('usuario.ver', 'admin_sistema'),
  ('veiculo.cadastrar', 'sindico'),
  ('veiculo.cadastrar', 'administracao'),
  ('vinculo.criar', 'sindico'),
  ('vinculo.criar', 'administracao'),
  ('vinculo.decidir', 'sindico'),
  ('vinculo.decidir', 'administracao'),
  ('vinculo.ver', 'sindico'),
  ('vinculo.ver', 'administracao'),
  ('vinculo.ver', 'auditor');
-- ===== Fim do bloco gerado ======================================================================================

-- ===== Helpers ====================================================================================================
CREATE FUNCTION app.exigir_janela_retroativo(a app.ator_t, p_quando timestamptz) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_quando < now() - interval '72 hours' AND NOT app.pode(a.papel, 'evento.retroativo_antigo') THEN
    PERFORM app.erro(422, 'RETROATIVO_FORA_DA_JANELA',
      'Lançamento retroativo com mais de 72 horas só pode ser feito pela administração ou pelo síndico.');
  END IF;
END $$;

-- Entrada (pessoa efetiva) sem saída, opcionalmente com ocorrido efetivo <= p_ate e excluindo um evento.
CREATE FUNCTION app.entrada_aberta(p_pessoa uuid, p_ate timestamptz, p_excluir uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evento_acesso e
     WHERE e.tipo = 'entrada'
       AND (e.pessoa_id = p_pessoa OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c
                                                WHERE c.corrige_evento_id IS NOT NULL AND c.correcao_valores ? 'pessoa_id'))
       AND app.pessoa_efetiva(e) = p_pessoa
       AND (p_excluir IS NULL OR e.id <> p_excluir)
       AND (p_ate IS NULL OR (app.efetivo(e)).ocorrido_em <= p_ate)
       AND NOT EXISTS (SELECT 1 FROM public.evento_acesso s WHERE s.tipo = 'saida' AND s.refere_evento_id = e.id))
$$;

ALTER FUNCTION app.exigir_janela_retroativo(app.ator_t, timestamptz) OWNER TO app_rw;
ALTER FUNCTION app.entrada_aberta(uuid, timestamptz, uuid) OWNER TO app_rw;
REVOKE ALL ON FUNCTION app.exigir_janela_retroativo(app.ator_t, timestamptz), app.entrada_aberta(uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ===== Entrada =====
CREATE OR REPLACE FUNCTION api.evento_entrada(p jsonb) RETURNS jsonb
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
  IF retro THEN PERFORM app.exigir_janela_retroativo(a, inst.quando); END IF;
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

  -- Retroativo: barra só se já havia entrada aberta naquele instante (a contingência pode chegar depois de uma entrada nova).
  IF (NOT retro AND app.esta_dentro(x.id)) OR (retro AND app.entrada_aberta(x.id, inst.quando, NULL)) THEN
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

-- ===== Recusa =====
CREATE OR REPLACE FUNCTION api.evento_recusa(p jsonb) RETURNS jsonb
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
  IF retro THEN PERFORM app.exigir_janela_retroativo(a, inst.quando); END IF;
  IF NOT (morador = ANY (app.moradores_validos(unidade_id, inst.quando))) THEN
    PERFORM app.erro(422, 'AUTORIZADOR_SEM_VINCULO', 'O morador que recusou não tem vínculo válido (aprovado ou legado no prazo) com a unidade.');
  END IF;
  ev.tipo := 'recusado'; ev.categoria_pessoa := app.categoria_efetiva(x, unidade_id, inst.quando); ev.pessoa_id := x.id;
  ev.unidade_destino_id := unidade_id; ev.ponto_acesso_id := app.ponto_padrao(); ev.autorizado_por_tipo := meio::public.meio_autorizacao;
  ev.autorizado_por_pessoa_id := morador; ev.operador_id := a.usuario_id; ev.operador_papel := a.papel; ev.ocorrido_em := inst.quando;
  ev.retroativo := retro; ev.formulario_contingencia := inst.formulario; ev.observacao := observacao;
  RETURN app.evento_view(app.inserir_evento(ev));
END $$;

-- ===== Saída =====
CREATE OR REPLACE FUNCTION api.evento_saida(p_entrada uuid, p jsonb DEFAULT '{}') RETURNS jsonb
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
  IF retro THEN PERFORM app.exigir_janela_retroativo(a, inst.quando); END IF;
  ev.tipo := 'saida'; ev.categoria_pessoa := ent.categoria_pessoa; ev.pessoa_id := base.pessoa_id; ev.unidade_destino_id := base.unidade_destino_id;
  ev.area_comum_id := base.area_comum_id; ev.ponto_acesso_id := app.ponto_padrao(); ev.operador_id := a.usuario_id; ev.operador_papel := a.papel;
  ev.ocorrido_em := inst.quando; ev.retroativo := retro; ev.refere_evento_id := ent.id; ev.formulario_contingencia := inst.formulario;
  ev.observacao := observacao;
  RETURN app.evento_view(app.inserir_evento(ev));
END $$;

-- ===== Correção =====
CREATE OR REPLACE FUNCTION api.evento_corrigir(p_evento uuid, p jsonb) RETURNS jsonb
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
  par public.evento_acesso;
  nome_novo text;
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
    IF orig.tipo = 'entrada' THEN
      SELECT * INTO par FROM public.evento_acesso WHERE tipo = 'saida' AND refere_evento_id = orig.id;
      IF FOUND AND t > (app.efetivo(par)).ocorrido_em THEN
        PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'A entrada corrigida não pode ficar depois da saída já registrada.');
      END IF;
    ELSIF orig.tipo = 'saida' THEN
      SELECT * INTO par FROM public.evento_acesso WHERE id = orig.refere_evento_id;
      IF FOUND AND t < (app.efetivo(par)).ocorrido_em THEN
        PERFORM app.erro(422, 'DATA_INCONSISTENTE', 'A saída corrigida não pode ficar antes da entrada.');
      END IF;
    END IF;
    novos := novos || jsonb_build_object('ocorrido_em', to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  END IF;
  IF v ? 'pessoaId' THEN
    pid := app.j_uuid(v, 'pessoaId');
    IF pid IS NULL OR NOT EXISTS (SELECT 1 FROM public.pessoa WHERE id = pid) THEN PERFORM app.erro(404, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.'); END IF;
    -- Mesma trava da entrada (FOR NO KEY UPDATE na pessoa): a entrada concorrente da pessoa nova espera e vê esta correção.
    IF orig.tipo = 'entrada' AND NOT EXISTS (SELECT 1 FROM public.evento_acesso WHERE tipo = 'saida' AND refere_evento_id = orig.id) THEN
      SELECT nome INTO nome_novo FROM public.pessoa WHERE id = pid FOR NO KEY UPDATE;
      IF app.entrada_aberta(pid, NULL, orig.id) THEN
        PERFORM app.erro(409, 'JA_ESTA_DENTRO', nome_novo || ' já consta como dentro do condomínio. Registre a saída antes.');
      END IF;
    END IF;
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
