-- 0034 — Primeiro síndico (bootstrap). Nova: não existe no legado Drizzle.
-- O projeto nasce sem usuário, e a Edge usuarios-admin exige um síndico ou administração com sessão: sem isto ninguém
-- entra. O script `npm run sb:sindico` (scripts/sindico) segue a mesma ordem da usuarios-admin:
--   srv.bootstrap_sindico_preparar (confere e sorteia o e-mail sintético) -> Auth cria -> srv.bootstrap_sindico_criar
--   (falhou: o script apaga a conta do Auth).
-- A decisão "não existe nenhum usuário" vale na criar, sob trava da tabela: duas execuções simultâneas se enfileiram e
-- a segunda enxerga a linha da primeira. Depois do primeiro usuário as duas recusam sempre; a gestão segue pela
-- usuarios-admin (só o síndico cria síndico, usuario.gerenciar_sindico).
-- EXECUTE só para service_role (a chave que o script obtém em memória); nem anon nem authenticated.

CREATE FUNCTION app.bootstrap_exigir_vazio() RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario_sistema) THEN
    PERFORM app.erro(409, 'SISTEMA_JA_INICIADO',
      'Já existe usuário no sistema: o primeiro síndico só é criado com o sistema vazio. Use a gestão de usuários.');
  END IF;
END $$;

-- Antes de criar no Auth: não grava nada (recusa cedo, sem conta órfã no Auth na segunda execução).
CREATE FUNCTION srv.bootstrap_sindico_preparar(p_nome text, p_login text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.bootstrap_exigir_vazio();
  PERFORM app.validar_novo_usuario(p_nome, p_login);
  RETURN jsonb_build_object('auth_email', 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid');
END $$;

-- Sem troca obrigatória: a senha foi escolhida por quem vai usá-la (não é temporária ditada por terceiro), e com
-- deve_trocar_senha o prazo de 72 h da temporária trancaria o único síndico sem ninguém que pudesse redefini-la.
-- A trilha não tem ator (ninguém estava logado): rótulo fixo, como '(login inexistente)'.
CREATE FUNCTION srv.bootstrap_sindico_criar(p_nome text, p_login text, p_auth_user_id uuid, p_auth_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.usuario_sistema;
BEGIN
  -- Conflita consigo mesmo e com INSERT/UPDATE na tabela; em READ COMMITTED o comando seguinte já vê o que a outra
  -- execução gravou antes de soltar a trava.
  LOCK TABLE public.usuario_sistema IN SHARE ROW EXCLUSIVE MODE;
  PERFORM app.bootstrap_exigir_vazio();
  PERFORM app.validar_novo_usuario(p_nome, p_login);
  IF p_auth_user_id IS NULL OR p_auth_email IS NULL THEN
    PERFORM app.erro(422, 'VALIDACAO', 'Conta de acesso ausente.');
  END IF;
  INSERT INTO public.usuario_sistema (nome, login, papel, deve_trocar_senha, senha_temporaria_expira_em, auth_user_id, auth_email)
  VALUES (btrim(p_nome), app.normalizar_login(p_login), 'sindico', false, NULL, p_auth_user_id, p_auth_email)
  RETURNING * INTO u;
  PERFORM app.auditar(NULL, '(instalação)', NULL, 'usuario.criar', 'usuario_sistema', u.id, NULL, NULL,
    app.usuario_gestao(u) || jsonb_build_object('origem', 'bootstrap'));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(u));
END $$;

ALTER FUNCTION app.bootstrap_exigir_vazio() OWNER TO app_rw;
ALTER FUNCTION srv.bootstrap_sindico_preparar(text, text) OWNER TO app_rw;
ALTER FUNCTION srv.bootstrap_sindico_criar(text, text, uuid, text) OWNER TO app_rw;
REVOKE ALL ON FUNCTION app.bootstrap_exigir_vazio(), srv.bootstrap_sindico_preparar(text, text),
  srv.bootstrap_sindico_criar(text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION srv.bootstrap_sindico_preparar(text, text), srv.bootstrap_sindico_criar(text, text, uuid, text)
  TO service_role;
