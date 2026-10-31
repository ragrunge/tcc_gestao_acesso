-- 0019 — Senha e e-mail do Auth só mudam pelo nosso fluxo (F1). Nova: não existe no legado Drizzle.
-- Achado na revisão da F1 (medido local): com `secure_password_change = false`, qualquer access token válido troca a
-- senha direto no GoTrue (PUT /auth/v1/user) sem a senha atual, e a Edge auth-entrar passa a aceitar a senha nova.
-- Um token roubado (XSS, desenho §2.7) virava tomada PERMANENTE da conta, e pulava a trilha e o limite da troca.
-- Defesa: trigger em auth.users recusa mudar encrypted_password ou e-mail de usuário vinculado, a não ser dentro de
-- uma janela curta aberta pelo banco no nosso fluxo (srv.troca_autorizar depois de conferir a senha atual;
-- srv.usuario_redefinir_senha). A janela vale para UMA alteração (é consumida) e dura 60 s.
-- O GoTrue recebe o erro e responde 500 ao cliente: falha fechada.

ALTER TABLE public.usuario_sistema ADD COLUMN auth_alteracao_ate timestamp (3) with time zone;

CREATE FUNCTION public.auth_users_guarda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid;
BEGIN
  UPDATE public.usuario_sistema SET auth_alteracao_ate = NULL
   WHERE auth_user_id = NEW.id AND auth_alteracao_ate > now()
  RETURNING id INTO uid;
  IF uid IS NULL AND EXISTS (SELECT 1 FROM public.usuario_sistema WHERE auth_user_id = NEW.id) THEN
    RAISE EXCEPTION 'alteração de senha/e-mail fora do fluxo do sistema' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.auth_users_guarda() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER portaria_guarda_credencial BEFORE UPDATE ON auth.users
FOR EACH ROW WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
                   OR OLD.email IS DISTINCT FROM NEW.email
                   OR coalesce(OLD.email_change, '') IS DISTINCT FROM coalesce(NEW.email_change, ''))
EXECUTE FUNCTION public.auth_users_guarda();

-- Depois de a Edge conferir a senha atual no Auth: abre a janela para a troca pela API admin.
CREATE FUNCTION srv.troca_autorizar(p_sessao_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a app.ator_t := app.ator_da_sessao(p_sessao_id, NULL, true, false, true);
BEGIN
  UPDATE public.usuario_sistema SET auth_alteracao_ate = now() + interval '60 seconds' WHERE id = a.usuario_id;
END $$;
ALTER FUNCTION srv.troca_autorizar(uuid) OWNER TO app_rw;
REVOKE ALL ON FUNCTION srv.troca_autorizar(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION srv.troca_autorizar(uuid) TO service_role;

-- A redefinição (já autorizada por usuario.gerenciar) também abre a janela para a senha temporária.
CREATE OR REPLACE FUNCTION srv.usuario_redefinir_senha(p_sessao_id uuid, p_alvo uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
  antes public.usuario_sistema;
  depois public.usuario_sistema;
BEGIN
  IF a.usuario_id = p_alvo THEN PERFORM app.erro(422, 'AUTO_REDEFINICAO', 'Para mudar a própria senha, use "trocar senha".'); END IF;
  antes := app.travar_alvo(p_alvo);
  PERFORM app.exigir_gestao_sindico(a, ARRAY[antes.papel]);
  IF antes.auth_user_id IS NULL THEN PERFORM app.erro(409, 'USUARIO_SEM_ACESSO', 'Usuário sem conta de acesso.'); END IF;
  UPDATE public.usuario_sistema SET deve_trocar_senha = true, senha_temporaria_expira_em = now() + interval '72 hours',
         senha_alterada_em = now(), atualizado_em = now(), auth_alteracao_ate = now() + interval '60 seconds'
   WHERE id = p_alvo RETURNING * INTO depois;
  UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'redefinicao_senha' WHERE usuario_id = p_alvo AND revogada_em IS NULL;
  PERFORM app.limite_zerar_login(antes.login);
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.redefinir_senha', 'usuario_sistema', p_alvo, p_ip,
    app.usuario_gestao(antes), app.usuario_gestao(depois));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(depois), 'auth_user_id', depois.auth_user_id);
END $$;
