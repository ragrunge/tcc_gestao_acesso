-- Seed SÓ LOCAL (supabase db reset). Dados fictícios: nenhum nome, login ou senha daqui é de pessoa real.
-- Nunca rodar no projeto hospedado (não usar `db push --include-seed`): a senha de demonstração é pública (README).
--
-- Usuários do sistema: um por papel, com os logins do legado. A conta do Auth é criada aqui direto em auth.users
-- (o GoTrue aceita bcrypt do pgcrypto), com o e-mail sintético ALEATÓRIO sorteado a cada reset: nem o seed conhece
-- o e-mail de antemão, e o login só funciona pela Edge auth-entrar (desenho §2.1).
-- Senha de demonstração (só local): Demo-Portaria-2026. Sem troca obrigatória, para o e2e cair direto na rota inicial.
DO $$
DECLARE
  r record;
  uid uuid;
  email text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Roberto Faria', 'roberto.faria', 'sindico'),
    ('Paula Nogueira', 'paula.nogueira', 'administracao'),
    ('João Lima', 'joao.lima', 'porteiro'),
    ('Luíza Campos', 'luiza.campos', 'auditor')
  ) AS v (nome, login, papel)
  LOOP
    uid := gen_random_uuid();
    email := 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid';
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                            is_sso_user, is_anonymous)
    VALUES ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email,
            extensions.crypt('Demo-Portaria-2026', extensions.gen_salt('bf', 10)), now(),
            '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
            '', '', '', '', '', '', '', '', false, false);
    INSERT INTO auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (uid, uid::text, jsonb_build_object('sub', uid::text, 'email', email, 'email_verified', true), 'email',
            now(), now(), now());
    INSERT INTO public.usuario_sistema (nome, login, papel, deve_trocar_senha, auth_user_id, auth_email)
    VALUES (r.nome, r.login, r.papel::public.papel, false, uid, email);
  END LOOP;
END $$;
