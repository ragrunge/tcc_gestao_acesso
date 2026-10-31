-- Login pelas srv.* que a Edge auth-entrar chama (desenho §2.2), como service_role. Limite por par login+IP e por IP
-- (ADR 2026-10-22), resposta igual para inexistente/inativo, recusa da temporária vencida só com a senha certa, e a
-- trilha sem o texto digitado.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, senha_temporaria_expira_em, auth_user_id, auth_email) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Lauro Login', 'l.login', 'porteiro', false, NULL,
   '00000000-0000-4000-8000-0000000000b1', 'u-00000000-0000-4000-8000-0000000000c1@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'Inês Inativa', 'l.inativa', 'porteiro', false, NULL,
   '00000000-0000-4000-8000-0000000000b2', 'u-00000000-0000-4000-8000-0000000000c2@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-0000000000a3', 'Vera Vencida', 'l.vencida', 'porteiro', true, now() - interval '1 second',
   '00000000-0000-4000-8000-0000000000b3', 'u-00000000-0000-4000-8000-0000000000c3@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-0000000000a4', 'Sem Conta', 'l.semconta', 'porteiro', false, NULL, NULL, NULL);
UPDATE public.usuario_sistema SET ativo = false WHERE login = 'l.inativa';

SET LOCAL ROLE service_role;

-- ===== Passo 1: e-mail sintético só para quem pode entrar ===============================================================
SELECT is(srv.login_preparar('  L.Login ', '203.0.113.7') ->> 'auth_email',
  'u-00000000-0000-4000-8000-0000000000c1@usuarios.portaria.invalid', 'login normalizado (trim + minúsculas) devolve o e-mail sintético');
SELECT is(srv.login_preparar('nao.existe', '203.0.113.7') - 'atraso_ms', '{"bloqueado": false, "auth_email": null}'::jsonb,
  'login inexistente: mesma forma de resposta, sem e-mail');
SELECT is(srv.login_preparar('l.inativa', '203.0.113.7') - 'atraso_ms', '{"bloqueado": false, "auth_email": null}'::jsonb,
  'usuário inativo: idêntico ao inexistente');
SELECT is(srv.login_preparar('l.semconta', '203.0.113.7') - 'atraso_ms', '{"bloqueado": false, "auth_email": null}'::jsonb,
  'usuário sem conta no Auth: idêntico ao inexistente');

-- ===== Trilha da falha sem o texto digitado =============================================================================
SELECT lives_ok($$SELECT srv.login_falhou('senha-digitada-no-campo-errado', '203.0.113.7')$$, 'falha de login inexistente registrada');
RESET ROLE;
SELECT ok(NOT EXISTS (SELECT 1 FROM public.audit_log WHERE (coalesce(antes::text, '') || coalesce(depois::text, '') || usuario_nome) LIKE '%senha-digitada%'),
  'o texto digitado no login não vai para a trilha');
SELECT is((SELECT depois FROM public.audit_log WHERE acao = 'auth.login_falha' ORDER BY seq DESC LIMIT 1),
  '{"motivo": "login_inexistente"}'::jsonb, 'motivo decidido pelo banco: login_inexistente');
SELECT is((SELECT usuario_nome FROM public.audit_log WHERE acao = 'auth.login_falha' ORDER BY seq DESC LIMIT 1),
  '(login inexistente)', 'rótulo fixo no lugar do login digitado');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.login_limite WHERE chave !~ '^[0-9a-f]{64}$' OR chave LIKE '%login%'),
  'login_limite guarda só HMAC (o login digitado pode ser um CPF)');
SET LOCAL ROLE service_role;

-- ===== Bloqueio por par login+IP: 10 falhas na janela ======================================================================
DO $$ BEGIN
  FOR i IN 1..10 LOOP PERFORM srv.login_preparar('l.login', '198.51.100.9'); PERFORM srv.login_falhou('l.login', '198.51.100.9'); END LOOP;
END $$;
SELECT is((srv.login_preparar('l.login', '198.51.100.9') ->> 'bloqueado')::boolean, true, '11ª tentativa do mesmo login no mesmo IP: bloqueada');
SELECT ok((srv.login_preparar('l.login', '198.51.100.9') ->> 'retry_after_s')::int BETWEEN 890 AND 901, 'bloqueio informa Retry-After de ~15 min (timestamp(3) arredonda o ms)');
SELECT is((srv.login_preparar('l.login', '198.51.100.9') ->> 'auth_email'), NULL, 'bloqueado não devolve e-mail (o Auth nem é consultado)');
SELECT is((srv.login_preparar('l.login', '192.0.2.44') ->> 'bloqueado')::boolean, false,
  'outro IP: o mesmo login segue liberado (bloqueio só por login deixaria qualquer um travar o porteiro)');
SELECT ok((srv.login_preparar('l.login', '192.0.2.44') ->> 'atraso_ms')::int >= 3000,
  'o contador só do login gradua o atraso da resposta (até o teto)');

-- ===== Passo 3: o Auth aceitou a senha ====================================================================================
SELECT is(srv.login_registrar('l.login', '192.0.2.44', 'ua', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), false) ->> 'ok',
  'false', 'auth_user_id de outra conta: recusa (não confia no que a Edge diz ter autenticado)');
SELECT is(srv.login_registrar('l.vencida', '192.0.2.44', 'ua', '00000000-0000-4000-8000-0000000000b3', gen_random_uuid(), false) ->> 'motivo',
  'senha_temporaria_expirada', 'temporária vencida com a senha certa: recusa com motivo próprio');
SELECT is(srv.login_registrar('l.inativa', '192.0.2.44', 'ua', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), false) ->> 'motivo',
  'credenciais', 'inativo, mesmo que o Auth aceite: credenciais (mensagem genérica)');
SELECT is(srv.login_registrar('l.login', '192.0.2.44', repeat('x', 400), '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000d1', true) #>> '{sessao,manterConectado}', 'false',
  'login certo cria a sessão; porteiro que pede "manter conectado" fica com a sessão padrão');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.sessao WHERE auth_session_id = '00000000-0000-4000-8000-0000000000d1'
  AND usuario_id = '00000000-0000-4000-8000-0000000000a1' AND NOT manter_conectado AND length(user_agent) = 300), 1,
  'sessão ligada ao session_id do Auth, user_agent cortado em 300');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'auth.login' AND usuario_id = '00000000-0000-4000-8000-0000000000a1'),
  'login auditado com o ator');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.sessao s JOIN public.usuario_sistema u ON u.id = s.usuario_id
  WHERE u.login IN ('l.vencida', 'l.inativa')), 'recusas do passo 3 não criam sessão');
SET LOCAL ROLE service_role;
SELECT is((srv.login_preparar('l.login', '198.51.100.9') ->> 'bloqueado')::boolean, true,
  'sucesso em outro IP não desbloqueia o par bloqueado');

SELECT * FROM finish();
ROLLBACK;
