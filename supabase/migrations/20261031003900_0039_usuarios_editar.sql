-- 0039 — Editar usuário do sistema (nome, login, papel) e gestão só do síndico (F5).
-- Muda a 0018 (srv.usuario_*: usuario.gerenciar era SI e AD) e a 0038 (listagem com usuario.gerenciar):
--   * usuario.ver (SI, AD): ver a lista e os totais (api.usuarios_listar / api.usuarios_resumo).
--   * usuario.gerenciar (SI): criar, editar, desativar, reativar e redefinir senha. As srv.usuario_* da 0018/0019 já
--     começam por app.exigir_sessao(..., 'usuario.gerenciar'): mudam de comportamento só pela matriz, sem CREATE OR REPLACE.
--   * usuario.gerenciar_sindico (SI): sem mudança (hoje coincide com usuario.gerenciar; fica para não reescrever a 0018).
-- srv.usuario_editar (Edge usuarios-admin, ação `editar`):
--   * campos nulos não mudam; texto vazio é valor (e falha na validação). Mesmas regras de nome e login da criação,
--     com o login único (sem caixa) contra os OUTROS usuários. Mudar o login NÃO toca no Auth: o e-mail do Auth é o
--     sintético (auth_email), e o login só serve para srv.login_preparar achar esse e-mail.
--   * ninguém muda o próprio papel (422 AUTO_PAPEL); nome e login próprios podem mudar.
--   * papel novo ou antigo síndico exige usuario.gerenciar_sindico; anonimizado pela retenção não é editado (409).
--   * nunca sem síndico ativo (409 ULTIMO_SINDICO), com os outros síndicos ativos travados (FOR UPDATE). Hoje é defesa:
--     só o síndico edita e não muda o próprio papel, então quem rebaixa continua síndico ativo. Vale se a matriz mudar.
--   * mudar o papel revoga as sessões do alvo na mesma transação (motivo 'mudanca_papel'): o RBAC novo vale já, e o
--     prazo de sessão (longa só fora da portaria) é recalculado no próximo login.
--   * sem alteração real: devolve o estado atual e não audita. Com alteração: trilha 'usuario.editar' com antes/depois
--     (app.usuario_gestao), que a retenção de operadores já redige (entidade usuario_sistema, 0007).

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
  ('usuario.gerenciar_sindico', 'sindico'),
  ('usuario.ver', 'sindico'),
  ('usuario.ver', 'administracao'),
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

-- ===== Sessão: motivo novo de revogação ===========================================================================
ALTER TABLE public.sessao DROP CONSTRAINT sessao_motivo_ck;
ALTER TABLE public.sessao ADD CONSTRAINT sessao_motivo_ck CHECK (motivo_revogacao IS NULL
  OR motivo_revogacao IN ('logout', 'desativacao', 'troca_senha', 'redefinicao_senha', 'mudanca_papel'));

-- ===== Validação da edição ============================================================================================
-- As regras de app.validar_novo_usuario (0018), campo a campo: nulo = não valida (não muda). O login repetido só conta
-- contra os OUTROS usuários (p_alvo fora). A 0018 e a 0034 continuam com a função delas, sem mudança.
CREATE FUNCTION app.validar_edicao_usuario(p_alvo uuid, p_nome text, p_login text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_nome IS NOT NULL AND length(btrim(p_nome)) NOT BETWEEN 3 AND 120 THEN
    PERFORM app.erro(422, 'VALIDACAO', 'Nome: de 3 a 120 caracteres.', jsonb_build_array(jsonb_build_object('field', 'nome')));
  END IF;
  IF p_login IS NOT NULL THEN
    IF app.normalizar_login(p_login) !~ '^[a-z][a-z0-9._-]{2,39}$' THEN
      PERFORM app.erro(422, 'VALIDACAO', 'Login: 3 a 40 caracteres, começando por letra (a-z, 0-9, ".", "-", "_").',
        jsonb_build_array(jsonb_build_object('field', 'login')));
    END IF;
    IF EXISTS (SELECT 1 FROM public.usuario_sistema WHERE lower(login) = app.normalizar_login(p_login) AND id <> p_alvo) THEN
      PERFORM app.erro(409, 'LOGIN_EXISTENTE', 'Já existe um usuário com este login.');
    END IF;
  END IF;
END $$;

-- ===== srv.usuario_editar ===========================================================================================
CREATE FUNCTION srv.usuario_editar(p_sessao_id uuid, p_alvo uuid, p_nome text, p_login text, p_papel public.papel,
                                   p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
  antes public.usuario_sistema;
  depois public.usuario_sistema;
  novo_nome text;
  novo_login text;
  novo_papel public.papel;
BEGIN
  antes := app.travar_alvo(p_alvo);
  IF antes.anonimizado_em IS NOT NULL THEN
    PERFORM app.erro(409, 'USUARIO_ANONIMIZADO', 'Usuário anonimizado pela retenção (LGPD) não pode ser editado.');
  END IF;
  PERFORM app.exigir_gestao_sindico(a, ARRAY[antes.papel, coalesce(p_papel, antes.papel)]);

  novo_nome := coalesce(btrim(p_nome), antes.nome);
  novo_login := CASE WHEN p_login IS NULL THEN antes.login ELSE app.normalizar_login(p_login) END;
  novo_papel := coalesce(p_papel, antes.papel);
  IF a.usuario_id = p_alvo AND novo_papel <> antes.papel THEN
    PERFORM app.erro(422, 'AUTO_PAPEL', 'Você não pode mudar o próprio papel. Peça a outro síndico.');
  END IF;
  PERFORM app.validar_edicao_usuario(p_alvo, p_nome, p_login);

  IF novo_nome = antes.nome AND novo_login = antes.login AND novo_papel = antes.papel THEN
    RETURN jsonb_build_object('usuario', app.usuario_gestao(antes));
  END IF;

  IF antes.papel = 'sindico' AND novo_papel <> 'sindico' AND antes.ativo THEN
    PERFORM 1 FROM public.usuario_sistema WHERE papel = 'sindico' AND ativo AND id <> p_alvo FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM app.erro(409, 'ULTIMO_SINDICO', 'Este é o único síndico ativo. Promova outro usuário a síndico antes.');
    END IF;
  END IF;

  BEGIN
    UPDATE public.usuario_sistema SET nome = novo_nome, login = novo_login, papel = novo_papel, atualizado_em = now()
     WHERE id = p_alvo RETURNING * INTO depois;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida com outra criação/edição do mesmo login entre a validação e o UPDATE (índice usuario_login_uq).
    PERFORM app.erro(409, 'LOGIN_EXISTENTE', 'Já existe um usuário com este login.');
  END;
  IF novo_papel <> antes.papel THEN
    UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'mudanca_papel'
     WHERE usuario_id = p_alvo AND revogada_em IS NULL;
  END IF;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.editar', 'usuario_sistema', p_alvo, p_ip,
    app.usuario_gestao(antes), app.usuario_gestao(depois));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(depois));
END $$;

-- ===== Listagem e totais: usuario.ver (corpo igual ao da 0038, só a ação muda) ===================================
CREATE OR REPLACE FUNCTION api.usuarios_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('usuario.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_papel text := app.j_enum(q, 'papel', ARRAY['sindico', 'administracao', 'porteiro', 'auditor']);
  v_situacao text := app.j_enum(q, 'situacao', ARRAY['ativos', 'desativados']);
  termo text := app.sem_acento(app.aparar(coalesce(app.j_texto(q, 'q', 100), '')));
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  padrao text;
  c public.usuario_sistema;
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF termo <> '' THEN padrao := '%' || app.escapar_like(termo) || '%'; END IF;
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.usuario_sistema WHERE id = cur AND anonimizado_em IS NULL;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH base AS (
    SELECT x.id, x.nome FROM public.usuario_sistema x
     WHERE x.anonimizado_em IS NULL
       AND (v_papel IS NULL OR x.papel = v_papel::public.papel)
       AND (v_situacao IS NULL OR x.ativo = (v_situacao = 'ativos'))
       AND (padrao IS NULL OR app.sem_acento(x.nome) LIKE padrao OR lower(x.login) LIKE padrao)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.nome, s.id) AS i FROM (
      SELECT b.id, b.nome FROM base b WHERE cur IS NULL OR (b.nome, b.id) > (c.nome, c.id)
       ORDER BY b.nome, b.id OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.usuario_gestao(u) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.usuario_sistema u ON u.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

CREATE OR REPLACE FUNCTION api.usuarios_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('usuario.ver');
BEGIN
  RETURN (SELECT jsonb_build_object(
      'ativos', count(*) FILTER (WHERE x.ativo),
      'desativados', count(*) FILTER (WHERE NOT x.ativo),
      'porPapel', jsonb_build_object(
        'sindico', count(*) FILTER (WHERE x.ativo AND x.papel = 'sindico'),
        'administracao', count(*) FILTER (WHERE x.ativo AND x.papel = 'administracao'),
        'porteiro', count(*) FILTER (WHERE x.ativo AND x.papel = 'porteiro'),
        'auditor', count(*) FILTER (WHERE x.ativo AND x.papel = 'auditor')))
    FROM public.usuario_sistema x WHERE x.anonimizado_em IS NULL);
END $$;

-- ===== Posse e EXECUTE (fail-closed) ==================================================================================
ALTER FUNCTION app.validar_edicao_usuario(uuid, text, text) OWNER TO app_rw;
ALTER FUNCTION srv.usuario_editar(uuid, uuid, text, text, public.papel, text) OWNER TO app_rw;
ALTER FUNCTION api.usuarios_listar(jsonb) OWNER TO app_rw;
ALTER FUNCTION api.usuarios_resumo() OWNER TO app_rw;
REVOKE ALL ON FUNCTION app.validar_edicao_usuario(uuid, text, text), srv.usuario_editar(uuid, uuid, text, text, public.papel, text),
  api.usuarios_listar(jsonb), api.usuarios_resumo() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION srv.usuario_editar(uuid, uuid, text, text, public.papel, text) TO service_role;
GRANT EXECUTE ON FUNCTION api.usuarios_listar(jsonb), api.usuarios_resumo() TO authenticated;
