-- 0018 — Autenticação sobre o Supabase Auth (desenho §2, F1). Nova: não existe no legado Drizzle.
--
-- Quem é quem:
--   * O GoTrue (Supabase Auth) guarda a senha (bcrypt) e emite a JWT. A JWT só diz QUEM (sub) e QUAL sessão do GoTrue
--     (session_id). Papel, ativo, troca pendente e prazos NÃO vêm do token: vêm destas tabelas, lidas a cada chamada.
--   * usuario_sistema ganha o vínculo com auth.users (auth_user_id) e o e-mail sintético ALEATÓRIO (auth_email,
--     'u-<uuid v4>@usuarios.portaria.invalid'), que só o banco conhece. Com e-mail previsível, qualquer um com a anon
--     key (pública) iria direto ao /auth/v1/token e pularia o limite por conta e a trilha de falhas (desenho §2.1).
--   * sessao passa a referenciar a sessão do GoTrue (auth_session_id) no lugar do hash do token opaco antigo.
--     Revogar aqui vale na hora: app.ator() recusa, mesmo com um access token ainda dentro do prazo.
--
-- Camadas (desenho §1 e §3.2):
--   app.*  helpers internos (ator, exigir, limite de login, auditoria). Dono app_rw, SECURITY INVOKER, EXECUTE só app_rw.
--   api.*  RPCs do front (EXECUTE para authenticated). Dono app_rw, SECURITY DEFINER: rodam com os GRANTs da 0001.
--   srv.*  RPCs das Edge Functions (EXECUTE só para service_role). Idem.
--   public.login_limite_hmac: única função nova com dono postgres (lê o Vault). EXECUTE só para app_rw.
--
-- Erros: RAISE SQLSTATE 'PGRST' com MESSAGE em JSON {code, message, details, hint} e DETAIL {status, headers}: o
-- PostgREST responde com esse status e esse corpo (o adaptador converte no ApiError de sempre).
-- Relógio: now() (início da transação), como o relógio da API antiga por requisição.

-- ===== Schema app ===============================================================================================
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA app TO app_rw;

-- ===== Vínculo usuário <-> auth.users ==============================================================================
ALTER TABLE public.usuario_sistema ADD COLUMN auth_user_id uuid;
ALTER TABLE public.usuario_sistema ADD COLUMN auth_email text;
CREATE UNIQUE INDEX usuario_auth_user_uq ON public.usuario_sistema (auth_user_id);
CREATE UNIQUE INDEX usuario_auth_email_uq ON public.usuario_sistema (auth_email);
ALTER TABLE public.usuario_sistema ADD CONSTRAINT usuario_auth_email_ck CHECK (auth_email IS NULL OR auth_email ~
  '^u-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@usuarios\.portaria\.invalid$');
ALTER TABLE public.usuario_sistema ADD CONSTRAINT usuario_auth_par_ck CHECK (num_nonnulls(auth_user_id, auth_email) IN (0, 2));

-- ===== Sessão do GoTrue ==========================================================================================
-- token_hash (sessão opaca antiga) vira opcional; exatamente uma das duas credenciais por linha.
ALTER TABLE public.sessao ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE public.sessao ADD COLUMN auth_session_id uuid;
CREATE UNIQUE INDEX sessao_auth_session_uq ON public.sessao (auth_session_id);
ALTER TABLE public.sessao ADD CONSTRAINT sessao_credencial_ck CHECK (num_nonnulls(token_hash, auth_session_id) = 1);
-- app_rw já tem SELECT, INSERT e UPDATE (ultimo_uso_em, revogada_em, motivo_revogacao) em sessao (0003).

-- ===== Parâmetros (prazos de sessão e limite de login) =================================================================
-- Os números da API antiga (config.ts: PADROES_SESSAO, PADROES_LOGIN; ADR 2026-10-29 e 2026-10-18), agora em tabela:
-- mudar um prazo é UPDATE (dono), sem deploy. Faixas e coerências iguais às de carregarSessao() do legado.
CREATE TABLE public.auth_parametros (
  id smallint PRIMARY KEY DEFAULT 1,
  sessao_padrao_inatividade_min integer NOT NULL,
  sessao_padrao_absoluta_min integer NOT NULL,
  sessao_longa_inatividade_min integer NOT NULL,
  sessao_longa_absoluta_min integer NOT NULL,
  toque_seg integer NOT NULL,
  login_max_falhas_par integer NOT NULL,
  login_max_falhas_ip integer NOT NULL,
  login_janela_min integer NOT NULL,
  login_bloqueio_min integer NOT NULL,
  login_atraso_base_ms integer NOT NULL,
  login_atraso_max_ms integer NOT NULL,
  CONSTRAINT auth_parametros_linha_unica_ck CHECK (id = 1),
  CONSTRAINT auth_parametros_padrao_ck CHECK (sessao_padrao_inatividade_min BETWEEN 1 AND 1440
    AND sessao_padrao_absoluta_min BETWEEN 5 AND 1440 AND sessao_padrao_inatividade_min <= sessao_padrao_absoluta_min),
  CONSTRAINT auth_parametros_longa_ck CHECK (sessao_longa_inatividade_min BETWEEN 1 AND 43200
    AND sessao_longa_absoluta_min BETWEEN 5 AND 43200 AND sessao_longa_inatividade_min <= sessao_longa_absoluta_min),
  CONSTRAINT auth_parametros_longa_nao_encurta_ck CHECK (sessao_longa_inatividade_min >= sessao_padrao_inatividade_min
    AND sessao_longa_absoluta_min >= sessao_padrao_absoluta_min),
  CONSTRAINT auth_parametros_login_ck CHECK (toque_seg BETWEEN 0 AND 3600 AND login_max_falhas_par >= 1
    AND login_max_falhas_ip >= 1 AND login_janela_min >= 1 AND login_bloqueio_min >= 1
    AND login_atraso_base_ms BETWEEN 0 AND 10000 AND login_atraso_max_ms BETWEEN 0 AND 10000)
);
INSERT INTO public.auth_parametros VALUES (1, 4 * 60, 14 * 60, 24 * 60, 15 * 24 * 60, 60, 10, 30, 15, 15, 250, 3000);

-- ===== Chave do limite de login (Vault) ================================================================================
-- login_limite.chave é HMAC (o login digitado pode ser um CPF; SHA puro se percorre por força bruta). A chave é gerada
-- AQUI, aleatória, e fica só no Vault: nunca no repo nem em env. db reset gera outra (só zera os contadores).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'portaria_login_limite_v1') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'portaria_login_limite_v1',
      'Chave HMAC das chaves de login_limite (F1). Sem valor fora do banco.');
  END IF;
END $$;

CREATE FUNCTION public.login_limite_hmac(p_texto text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'portaria_login_limite_v1';
  IF k IS NULL THEN RAISE EXCEPTION 'chave portaria_login_limite_v1 ausente no Vault'; END IF;
  RETURN encode(extensions.hmac(convert_to(p_texto, 'UTF8'), decode(k, 'hex'), 'sha256'), 'hex');
END $$;
REVOKE ALL ON FUNCTION public.login_limite_hmac(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_limite_hmac(text) TO app_rw;

-- ===== Helpers app.* ===============================================================================================
CREATE TYPE app.ator_t AS (
  usuario_id uuid, nome text, login text, papel public.papel, sessao_id uuid, auth_user_id uuid,
  deve_trocar_senha boolean, expira_em timestamptz, inatividade_min integer
);

-- Erro com status HTTP e corpo JSON pelo PostgREST. Nunca retorna. O PostgREST (v16.5 local) só aceita `details` como TEXTO
-- (objeto dá PGRST121 e vira 500): os detalhes estruturados vão serializados, e o adaptador os lê de volta.
CREATE FUNCTION app.erro(p_status integer, p_codigo text, p_mensagem text, p_detalhes jsonb DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE SQLSTATE 'PGRST' USING
    MESSAGE = json_build_object('code', p_codigo, 'message', p_mensagem, 'details', p_detalhes::text, 'hint', NULL)::text,
    DETAIL = json_build_object('status', p_status, 'headers', json_build_object())::text;
END $$;

CREATE FUNCTION app.erro_sessao() RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT app.erro(401, 'SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.') $$;

CREATE FUNCTION app.ip_ou_nulo(p text) RETURNS inet
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN nullif(btrim(p), '')::inet;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END $$;

CREATE FUNCTION app.normalizar_login(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT lower(btrim(coalesce(p, ''))) $$;

-- Sessão longa só fora da portaria (terminal compartilhado), pelo papel ATUAL (sessaoLonga do legado).
CREATE FUNCTION app.sessao_longa(p_pediu boolean, p_papel public.papel) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT coalesce(p_pediu, false) AND p_papel <> 'porteiro' $$;

CREATE FUNCTION app.parametros() RETURNS public.auth_parametros
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE p public.auth_parametros;
BEGIN
  SELECT * INTO p FROM public.auth_parametros WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'auth_parametros sem a linha 1'; END IF;
  RETURN p;
END $$;

-- Visão pública do usuário (como UsuarioPublico do legado; ultimoAcesso em ms).
CREATE FUNCTION app.usuario_publico(u public.usuario_sistema) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', u.id, 'nome', u.nome, 'login', u.login, 'papel', u.papel, 'ativo', u.ativo,
    'ultimoAcesso', (extract(epoch FROM u.ultimo_acesso) * 1000)::bigint, 'deveTrocarSenha', u.deve_trocar_senha)
$$;

-- Gestão de usuários: a visão pública + o fim da validade da senha temporária.
CREATE FUNCTION app.usuario_gestao(u public.usuario_sistema) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT app.usuario_publico(u) || jsonb_build_object('senhaTemporariaExpiraEm',
    (extract(epoch FROM u.senha_temporaria_expira_em) * 1000)::bigint)
$$;

/*
 * O equivalente do SessaoGuard + PapelGuard (desenho §2.4). Recusa (401) sessão inexistente, revogada, expirada pelo
 * prazo absoluto (min(expira_em, criada_em + prazo de HOJE pelo papel ATUAL)), inativa, de usuário desativado, de outro
 * usuário do Auth, ou com a senha temporária vencida. Troca pendente: 403, salvo nas chamadas que a permitem.
 * Toque: grava ultimo_uso_em no máximo uma vez por toque_seg (exige transação de escrita: RPC por POST).
 */
CREATE FUNCTION app.ator_da_sessao(p_sessao_id uuid, p_auth_user_id uuid, p_permite_troca boolean, p_tocar boolean,
                                   p_travar boolean DEFAULT false) RETURNS app.ator_t
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  s public.sessao;
  u public.usuario_sistema;
  p public.auth_parametros := app.parametros();
  agora timestamptz := now();
  longa boolean;
  inat integer;
  fim timestamptz;
BEGIN
  SELECT * INTO s FROM public.sessao WHERE id = p_sessao_id;
  IF NOT FOUND OR s.revogada_em IS NOT NULL THEN PERFORM app.erro_sessao(); END IF;
  IF p_travar THEN
    SELECT * INTO u FROM public.usuario_sistema WHERE id = s.usuario_id FOR UPDATE;
  ELSE
    SELECT * INTO u FROM public.usuario_sistema WHERE id = s.usuario_id;
  END IF;
  IF NOT FOUND OR NOT u.ativo THEN PERFORM app.erro_sessao(); END IF;
  IF p_auth_user_id IS NOT NULL AND u.auth_user_id IS DISTINCT FROM p_auth_user_id THEN PERFORM app.erro_sessao(); END IF;

  longa := app.sessao_longa(s.manter_conectado, u.papel);
  inat := CASE WHEN longa THEN p.sessao_longa_inatividade_min ELSE p.sessao_padrao_inatividade_min END;
  fim := least(s.expira_em, s.criada_em + make_interval(mins => CASE WHEN longa THEN p.sessao_longa_absoluta_min
                                                                     ELSE p.sessao_padrao_absoluta_min END));
  IF fim <= agora THEN PERFORM app.erro_sessao(); END IF;
  IF agora - s.ultimo_uso_em >= make_interval(mins => inat) THEN PERFORM app.erro_sessao(); END IF;
  -- senhaTemporariaVencida: troca pendente sem prazo também conta como vencida (falha fechada).
  IF u.deve_trocar_senha AND (u.senha_temporaria_expira_em IS NULL OR u.senha_temporaria_expira_em <= agora) THEN
    PERFORM app.erro_sessao();
  END IF;
  IF u.deve_trocar_senha AND NOT p_permite_troca THEN
    PERFORM app.erro(403, 'TROCA_DE_SENHA_OBRIGATORIA', 'Troque a senha provisória antes de continuar.');
  END IF;

  IF p_tocar AND agora - s.ultimo_uso_em >= make_interval(secs => p.toque_seg) THEN
    UPDATE public.sessao SET ultimo_uso_em = agora WHERE id = s.id AND revogada_em IS NULL;
  END IF;
  RETURN ROW(u.id, u.nome, u.login, u.papel, s.id, u.auth_user_id, u.deve_trocar_senha, fim, inat)::app.ator_t;
END $$;

-- Ator da requisição do front: claims da JWT já verificada pelo PostgREST (role, sub, session_id).
CREATE FUNCTION app.ator(p_permite_troca boolean DEFAULT false, p_tocar boolean DEFAULT true) RETURNS app.ator_t
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  sid uuid;
BEGIN
  IF c IS NULL OR c ->> 'role' IS DISTINCT FROM 'authenticated'
     OR coalesce(c ->> 'sub', '') !~ uuid_re OR coalesce(c ->> 'session_id', '') !~ uuid_re THEN
    PERFORM app.erro(401, 'NAO_AUTENTICADO', 'Entre no sistema para continuar.');
  END IF;
  SELECT id INTO sid FROM public.sessao WHERE auth_session_id = (c ->> 'session_id')::uuid;
  IF sid IS NULL THEN PERFORM app.erro_sessao(); END IF;
  RETURN app.ator_da_sessao(sid, (c ->> 'sub')::uuid, p_permite_troca, p_tocar);
END $$;

-- Ação fora de rbac_acao é erro de programação: exceção comum (500), nunca "permitido".
CREATE FUNCTION app.pode(p_papel public.papel, p_acao text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rbac_acao WHERE acao = p_acao) THEN
    RAISE EXCEPTION 'ação RBAC desconhecida: %', p_acao;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.rbac_matriz WHERE acao = p_acao AND papel = p_papel);
END $$;

CREATE FUNCTION app.negar_se_nao_pode(a app.ator_t, p_acao text, p_mensagem text DEFAULT NULL) RETURNS app.ator_t
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT app.pode(a.papel, p_acao) THEN
    PERFORM app.erro(403, 'SEM_PERMISSAO', coalesce(p_mensagem, 'Seu perfil não tem permissão para esta ação.'),
      jsonb_build_object('acao', p_acao));
  END IF;
  RETURN a;
END $$;

-- Primeira linha de toda RPC do front que exige uma ação.
CREATE FUNCTION app.exigir(p_acao text, p_tocar boolean DEFAULT true) RETURNS app.ator_t
LANGUAGE sql SET search_path = '' AS $$ SELECT app.negar_se_nao_pode(app.ator(false, p_tocar), p_acao) $$;

-- Mesma decisão para as RPCs srv.* (a Edge já obteve o sessao_id por api.sessao_atual com a JWT do usuário).
-- Trava a linha do ator: serializa ações cruzadas (dois síndicos desativando um ao outro), como revalidarAtor.
CREATE FUNCTION app.exigir_sessao(p_sessao_id uuid, p_acao text) RETURNS app.ator_t
LANGUAGE sql SET search_path = '' AS $$
  SELECT app.negar_se_nao_pode(app.ator_da_sessao(p_sessao_id, NULL, false, false, true), p_acao)
$$;

CREATE FUNCTION app.auditar(p_usuario_id uuid, p_usuario_nome text, p_papel public.papel, p_acao text, p_entidade text,
                            p_registro_id uuid, p_ip text, p_antes jsonb DEFAULT NULL, p_depois jsonb DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.audit_log (usuario_id, usuario_nome, usuario_papel, acao, entidade, registro_id, antes, depois, ip)
  VALUES (p_usuario_id, p_usuario_nome, p_papel, p_acao, p_entidade, p_registro_id, p_antes, p_depois, app.ip_ou_nulo(p_ip))
$$;

-- ===== Limite de tentativas (porte de limite-login.service.ts; ADR 2026-10-22) =====================================
-- login_ip (par): bloqueia ao atingir login_max_falhas_par; ip: bloqueia em login_max_falhas_ip; login: nunca bloqueia,
-- só gradua o atraso da resposta (os logins do seed são públicos: bloqueio só por login deixaria qualquer um manter o
-- porteiro fora). A tentativa é RESERVADA antes de verificar a senha (UPSERT atômico) e desfeita no sucesso.
CREATE FUNCTION app.limite_chave(p_tipo text, p_valor text) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.login_limite_hmac(p_tipo || ':' || CASE WHEN p_tipo = 'login' THEN app.normalizar_login(p_valor) ELSE p_valor END)
$$;

-- Metade do HMAC do login + metade do HMAC do par: o prefixo deixa zerar todos os pares de um login sem saber os IPs.
CREATE FUNCTION app.limite_chave_par(p_login text, p_ip text) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT left(app.limite_chave('login', p_login), 32)
      || left(public.login_limite_hmac('login_ip:' || json_build_array(app.normalizar_login(p_login), coalesce(p_ip, ''))::text), 32)
$$;

CREATE FUNCTION app.limite_reservar(p_tipo text, p_chave text, OUT falhas integer, OUT bloqueado_ate timestamptz)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  janela interval := make_interval(mins => (app.parametros()).login_janela_min);
  agora timestamptz := now();
BEGIN
  INSERT INTO public.login_limite AS l (tipo, chave, falhas, janela_inicio, bloqueado_ate, atualizado_em)
  VALUES (p_tipo, p_chave, 1, agora, NULL, agora)
  ON CONFLICT (tipo, chave) DO UPDATE SET
    falhas = CASE WHEN l.bloqueado_ate > agora THEN l.falhas
                  WHEN l.bloqueado_ate IS NOT NULL OR l.janela_inicio <= agora - janela THEN 1
                  ELSE least(l.falhas + 1, 10000) END,
    janela_inicio = CASE WHEN l.bloqueado_ate > agora THEN l.janela_inicio
                         WHEN l.bloqueado_ate IS NOT NULL OR l.janela_inicio <= agora - janela THEN agora
                         ELSE l.janela_inicio END,
    bloqueado_ate = CASE WHEN l.bloqueado_ate > agora THEN l.bloqueado_ate ELSE NULL END,
    atualizado_em = agora
  RETURNING l.falhas, l.bloqueado_ate INTO falhas, bloqueado_ate;
END $$;

CREATE FUNCTION app.limite_maximo(p_tipo text) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE p_tipo WHEN 'login_ip' THEN p.login_max_falhas_par WHEN 'ip' THEN p.login_max_falhas_ip END
    FROM app.parametros() p
$$;

CREATE FUNCTION app.limite_bloqueada(p_tipo text, p_falhas integer, p_bloqueado_ate timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_tipo <> 'login' AND (coalesce(p_bloqueado_ate > now(), false) OR p_falhas > app.limite_maximo(p_tipo))
$$;

-- Ao atingir o máximo, grava o bloqueio. Devolve o fim só se ESTA chamada o criou (auth.bloqueio sai uma vez).
CREATE FUNCTION app.limite_bloquear_se_atingiu(p_tipo text, p_chave text, p_falhas integer) RETURNS timestamptz
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE ate timestamptz := now() + make_interval(mins => (app.parametros()).login_bloqueio_min);
BEGIN
  IF p_tipo = 'login' OR p_falhas < app.limite_maximo(p_tipo) THEN RETURN NULL; END IF;
  UPDATE public.login_limite SET bloqueado_ate = ate, atualizado_em = now()
   WHERE tipo = p_tipo AND chave = p_chave AND (bloqueado_ate IS NULL OR bloqueado_ate <= now());
  RETURN CASE WHEN FOUND THEN ate END;
END $$;

-- Zera o contador do login e TODOS os pares dele (troca e redefinição de senha desbloqueiam o alvo).
CREATE FUNCTION app.limite_zerar_login(p_login text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.login_limite SET falhas = 0, janela_inicio = now(), bloqueado_ate = NULL, atualizado_em = now()
   WHERE (tipo = 'login' AND chave = app.limite_chave('login', p_login))
      OR (tipo = 'login_ip' AND left(chave, 32) = left(app.limite_chave('login', p_login), 32))
$$;

-- Atraso crescente das falhas pelo contador do LOGIN (qualquer IP): base * 2^(n-1), com teto.
CREATE FUNCTION app.limite_atraso_ms(p_falhas integer) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p.login_atraso_base_ms <= 0 THEN 0
              ELSE least(p.login_atraso_max_ms::numeric, p.login_atraso_base_ms * power(2::numeric, greatest(0, p_falhas - 1)))::integer END
    FROM app.parametros() p
$$;

-- Registra a falha (trilha) e grava os bloqueios do par e do IP que esta tentativa atingiu.
-- O texto digitado NUNCA vai para a trilha (ADR 2026-10-22): login existente grava o ator; inexistente, rótulo fixo.
CREATE FUNCTION app.limite_falhou(p_login text, p_ip text, p_motivo text, p_acao text DEFAULT 'auth.login_falha') RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  u public.usuario_sistema;
  r record;
  ate timestamptz;
BEGIN
  SELECT * INTO u FROM public.usuario_sistema WHERE lower(login) = app.normalizar_login(p_login);
  PERFORM app.auditar(u.id, coalesce(u.nome, '(login inexistente)'), u.papel, p_acao, 'sessao', NULL, p_ip, NULL,
    jsonb_build_object('motivo', p_motivo));
  FOR r IN
    SELECT l.tipo, l.chave, l.falhas FROM public.login_limite l
     WHERE (l.tipo = 'login_ip' AND l.chave = app.limite_chave_par(p_login, p_ip))
        OR (p_ip IS NOT NULL AND l.tipo = 'ip' AND l.chave = app.limite_chave('ip', p_ip))
  LOOP
    ate := app.limite_bloquear_se_atingiu(r.tipo, r.chave, r.falhas);
    IF ate IS NOT NULL THEN
      PERFORM app.auditar(CASE WHEN r.tipo = 'login_ip' THEN u.id END,
        CASE WHEN r.tipo = 'login_ip' THEN coalesce(u.nome, '(login inexistente)') ELSE '(ip)' END,
        CASE WHEN r.tipo = 'login_ip' THEN u.papel END, 'auth.bloqueio', 'login_limite', NULL, p_ip, NULL,
        jsonb_build_object('tipo', r.tipo, 'falhas', r.falhas, 'bloqueado_ate', ate));
    END IF;
  END LOOP;
END $$;

-- ===== srv.*: login (Edge auth-entrar) =================================================================================
/*
 * Passo 1 do login: conta a tentativa (login, par, IP) e devolve o e-mail sintético SÓ para usuário ativo vinculado ao
 * Auth. Inexistente, inativo e sem vínculo recebem o mesmo { auth_email: null }: a Edge responde a mesma mensagem.
 * Bloqueado (par ou IP): registra a falha sem consultar o Auth e devolve o fim do bloqueio.
 */
CREATE FUNCTION srv.login_preparar(p_login text, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rl record; rp record;
  ip_falhas integer := 0; ip_ate timestamptz;
  ip text := host(app.ip_ou_nulo(p_ip));
  email text;
  fim timestamptz;
BEGIN
  IF length(coalesce(p_login, '')) > 200 OR btrim(coalesce(p_login, '')) = '' THEN
    PERFORM app.erro(400, 'VALIDACAO', 'Informe o login.');
  END IF;
  SELECT * INTO rl FROM app.limite_reservar('login', app.limite_chave('login', p_login));
  SELECT * INTO rp FROM app.limite_reservar('login_ip', app.limite_chave_par(p_login, ip));
  IF ip IS NOT NULL THEN
    SELECT r.falhas, r.bloqueado_ate INTO ip_falhas, ip_ate FROM app.limite_reservar('ip', app.limite_chave('ip', ip)) r;
  END IF;

  IF app.limite_bloqueada('login_ip', rp.falhas, rp.bloqueado_ate)
     OR (ip IS NOT NULL AND app.limite_bloqueada('ip', ip_falhas, ip_ate)) THEN
    PERFORM app.limite_falhou(p_login, ip, 'bloqueado');
    fim := greatest(CASE WHEN rp.bloqueado_ate > now() THEN rp.bloqueado_ate END,
                    CASE WHEN ip_ate > now() THEN ip_ate END);
    fim := coalesce(fim, now() + make_interval(mins => (app.parametros()).login_bloqueio_min));
    RETURN jsonb_build_object('bloqueado', true, 'retry_after_s', greatest(1, ceil(extract(epoch FROM fim - now()))::integer));
  END IF;

  SELECT u.auth_email INTO email FROM public.usuario_sistema u
   WHERE lower(u.login) = app.normalizar_login(p_login) AND u.ativo AND u.auth_user_id IS NOT NULL;
  RETURN jsonb_build_object('bloqueado', false, 'auth_email', email, 'atraso_ms', app.limite_atraso_ms(rl.falhas));
END $$;

-- Falha depois do passo 1 (senha errada no Auth, ou sem e-mail). O motivo é decidido aqui, não pela Edge.
CREATE FUNCTION srv.login_falhou(p_login text, p_ip text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.usuario_sistema;
BEGIN
  SELECT * INTO u FROM public.usuario_sistema WHERE lower(login) = app.normalizar_login(p_login);
  PERFORM app.limite_falhou(p_login, host(app.ip_ou_nulo(p_ip)),
    CASE WHEN u.id IS NULL THEN 'login_inexistente' WHEN NOT u.ativo THEN 'usuario_inativo'
         WHEN u.auth_user_id IS NULL THEN 'sem_vinculo_auth' ELSE 'senha_incorreta' END);
END $$;

/*
 * Passo 3: o Auth aceitou a senha. Confere de novo o estado (o usuário pode ter sido desativado entre os passos; o
 * auth_user_id tem de ser o do login), recusa senha temporária vencida (só agora, com a senha certa, como o legado) e
 * cria a sessão. Sem sucesso: { ok: false } e a Edge revoga a sessão que o Auth acabou de abrir.
 */
CREATE FUNCTION srv.login_registrar(p_login text, p_ip text, p_user_agent text, p_auth_user_id uuid,
                                    p_auth_session_id uuid, p_manter_conectado boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  u public.usuario_sistema;
  p public.auth_parametros := app.parametros();
  ip text := host(app.ip_ou_nulo(p_ip));
  longa boolean;
  sid uuid;
  expira timestamptz;
BEGIN
  SELECT * INTO u FROM public.usuario_sistema WHERE lower(login) = app.normalizar_login(p_login) FOR UPDATE;
  IF NOT FOUND OR NOT u.ativo OR u.auth_user_id IS DISTINCT FROM p_auth_user_id OR p_auth_session_id IS NULL THEN
    PERFORM app.limite_falhou(p_login, ip, CASE WHEN u.id IS NULL THEN 'login_inexistente' WHEN NOT u.ativo
      THEN 'usuario_inativo' ELSE 'vinculo_auth_divergente' END);
    RETURN jsonb_build_object('ok', false, 'motivo', 'credenciais');
  END IF;
  IF u.deve_trocar_senha AND (u.senha_temporaria_expira_em IS NULL OR u.senha_temporaria_expira_em <= now()) THEN
    PERFORM app.limite_falhou(p_login, ip, 'senha_temporaria_expirada');
    RETURN jsonb_build_object('ok', false, 'motivo', 'senha_temporaria_expirada');
  END IF;

  longa := app.sessao_longa(p_manter_conectado, u.papel);
  expira := now() + make_interval(mins => CASE WHEN longa THEN p.sessao_longa_absoluta_min ELSE p.sessao_padrao_absoluta_min END);
  INSERT INTO public.sessao (usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em, manter_conectado, ip, user_agent)
  VALUES (u.id, p_auth_session_id, now(), now(), expira, longa, app.ip_ou_nulo(ip), left(p_user_agent, 300))
  RETURNING id INTO sid;
  UPDATE public.usuario_sistema SET ultimo_acesso = now() WHERE id = u.id RETURNING * INTO u;
  PERFORM app.auditar(u.id, u.nome, u.papel, 'auth.login', 'sessao', sid, ip, NULL,
    jsonb_build_object('login', u.login, 'expira_em', expira, 'manter_conectado', longa));

  -- Sucesso: zera login e par; o IP só desfaz a reserva (outras contas atrás do mesmo NAT).
  UPDATE public.login_limite SET falhas = 0, janela_inicio = now(), bloqueado_ate = NULL, atualizado_em = now()
   WHERE (tipo = 'login' AND chave = app.limite_chave('login', p_login))
      OR (tipo = 'login_ip' AND chave = app.limite_chave_par(p_login, ip));
  IF ip IS NOT NULL THEN
    UPDATE public.login_limite SET falhas = greatest(falhas - 1, 0), atualizado_em = now()
     WHERE tipo = 'ip' AND chave = app.limite_chave('ip', ip);
  END IF;

  RETURN jsonb_build_object('ok', true, 'usuario', app.usuario_publico(u), 'condominio', NULL,
    'sessao', jsonb_build_object('expiraEm', to_char(expira AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'inatividadeMin', CASE WHEN longa THEN p.sessao_longa_inatividade_min ELSE p.sessao_padrao_inatividade_min END,
      'manterConectado', longa));
END $$;

-- ===== srv.*: troca da própria senha (Edge auth-trocar-senha) =========================================================
-- A senha atual é um segredo sendo adivinhado (sessão roubada): conta no limite do par login+IP, como no legado.
CREATE FUNCTION srv.troca_preparar(p_sessao_id uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.ator_da_sessao(p_sessao_id, NULL, true, false);
  ip text := host(app.ip_ou_nulo(p_ip));
  r record;
  email text;
BEGIN
  SELECT * INTO r FROM app.limite_reservar('login_ip', app.limite_chave_par(a.login, ip));
  IF app.limite_bloqueada('login_ip', r.falhas, r.bloqueado_ate) THEN
    RETURN jsonb_build_object('bloqueado', true, 'retry_after_s',
      greatest(1, ceil(extract(epoch FROM coalesce(r.bloqueado_ate, now() + interval '1 minute') - now()))::integer));
  END IF;
  SELECT auth_email INTO email FROM public.usuario_sistema WHERE id = a.usuario_id;
  RETURN jsonb_build_object('bloqueado', false, 'auth_email', email, 'auth_user_id', a.auth_user_id, 'login', a.login);
END $$;

CREATE FUNCTION srv.troca_falhou(p_sessao_id uuid, p_ip text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.ator_da_sessao(p_sessao_id, NULL, true, false);
  ip text := host(app.ip_ou_nulo(p_ip));
  ch text := app.limite_chave_par(a.login, ip);
  ate timestamptz;
BEGIN
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'auth.trocar_senha_falha', 'usuario_sistema', a.usuario_id, ip);
  ate := app.limite_bloquear_se_atingiu('login_ip', ch, (SELECT falhas FROM public.login_limite WHERE tipo = 'login_ip' AND chave = ch));
  IF ate IS NOT NULL THEN
    PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'auth.bloqueio', 'login_limite', NULL, ip, NULL,
      jsonb_build_object('tipo', 'login_ip', 'bloqueado_ate', ate));
  END IF;
END $$;

-- A senha nova já foi aplicada no Auth pela Edge. Limpa a troca pendente, revoga as OUTRAS sessões e desbloqueia.
CREATE FUNCTION srv.troca_concluir(p_sessao_id uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.ator_da_sessao(p_sessao_id, NULL, true, false, true);
  u public.usuario_sistema;
  n integer;
BEGIN
  UPDATE public.usuario_sistema SET deve_trocar_senha = false, senha_temporaria_expira_em = NULL,
         senha_alterada_em = now(), atualizado_em = now()
   WHERE id = a.usuario_id RETURNING * INTO u;
  UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'troca_senha'
   WHERE usuario_id = a.usuario_id AND revogada_em IS NULL AND id <> p_sessao_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM app.limite_zerar_login(a.login);
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'auth.trocar_senha', 'usuario_sistema', a.usuario_id, p_ip,
    jsonb_build_object('deve_trocar_senha', a.deve_trocar_senha), jsonb_build_object('deve_trocar_senha', false, 'sessoes_revogadas', n));
  RETURN jsonb_build_object('usuario', app.usuario_publico(u));
END $$;

-- ===== srv.*: gestão de usuários (Edge usuarios-admin) =================================================================
-- usuario.gerenciar (SI, AD); alvo ou papel síndico exige usuario.gerenciar_sindico (SI). Ninguém desativa ou redefine
-- a si mesmo por aqui (usuarios.service.ts do legado).
CREATE FUNCTION app.exigir_gestao_sindico(a app.ator_t, p_papeis public.papel[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF 'sindico' = ANY (p_papeis) THEN
    PERFORM app.negar_se_nao_pode(a, 'usuario.gerenciar_sindico', 'Só o síndico gerencia usuários com o papel de síndico.');
  END IF;
END $$;

CREATE FUNCTION app.travar_alvo(p_id uuid) RETURNS public.usuario_sistema
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE u public.usuario_sistema;
BEGIN
  SELECT * INTO u FROM public.usuario_sistema WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.'); END IF;
  RETURN u;
END $$;

CREATE FUNCTION app.validar_novo_usuario(p_nome text, p_login text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 3 AND 120 THEN
    PERFORM app.erro(422, 'VALIDACAO', 'Nome: de 3 a 120 caracteres.', jsonb_build_array(jsonb_build_object('field', 'nome')));
  END IF;
  IF app.normalizar_login(p_login) !~ '^[a-z][a-z0-9._-]{2,39}$' THEN
    PERFORM app.erro(422, 'VALIDACAO', 'Login: 3 a 40 caracteres, começando por letra (a-z, 0-9, ".", "-", "_").',
      jsonb_build_array(jsonb_build_object('field', 'login')));
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario_sistema WHERE lower(login) = app.normalizar_login(p_login)) THEN
    PERFORM app.erro(409, 'LOGIN_EXISTENTE', 'Já existe um usuário com este login.');
  END IF;
END $$;

-- Antes de criar no Auth: confere permissão e dados, e sorteia o e-mail sintético. Não grava nada.
CREATE FUNCTION srv.usuario_criar_preparar(p_sessao_id uuid, p_nome text, p_login text, p_papel public.papel) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
BEGIN
  PERFORM app.exigir_gestao_sindico(a, ARRAY[p_papel]);
  PERFORM app.validar_novo_usuario(p_nome, p_login);
  RETURN jsonb_build_object('auth_email', 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid');
END $$;

-- Depois de criar no Auth (com a senha temporária): revalida tudo na transação e grava. Falhou: a Edge apaga o
-- usuário do Auth.
CREATE FUNCTION srv.usuario_criar(p_sessao_id uuid, p_nome text, p_login text, p_papel public.papel,
                                  p_auth_user_id uuid, p_auth_email text, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
  u public.usuario_sistema;
BEGIN
  PERFORM app.exigir_gestao_sindico(a, ARRAY[p_papel]);
  PERFORM app.validar_novo_usuario(p_nome, p_login);
  INSERT INTO public.usuario_sistema (nome, login, papel, deve_trocar_senha, senha_temporaria_expira_em, auth_user_id, auth_email)
  VALUES (btrim(p_nome), app.normalizar_login(p_login), p_papel, true, now() + interval '72 hours', p_auth_user_id, p_auth_email)
  RETURNING * INTO u;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.criar', 'usuario_sistema', u.id, p_ip, NULL, app.usuario_gestao(u));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(u));
END $$;

-- Desativa e derruba as sessões na mesma transação. A Edge depois bane no Auth (login novo e refresh).
CREATE FUNCTION srv.usuario_desativar(p_sessao_id uuid, p_alvo uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
  antes public.usuario_sistema;
  depois public.usuario_sistema;
BEGIN
  IF a.usuario_id = p_alvo THEN PERFORM app.erro(422, 'AUTO_DESATIVACAO', 'Você não pode desativar o próprio usuário.'); END IF;
  antes := app.travar_alvo(p_alvo);
  PERFORM app.exigir_gestao_sindico(a, ARRAY[antes.papel]);
  IF NOT antes.ativo THEN
    RETURN jsonb_build_object('usuario', app.usuario_gestao(antes), 'auth_user_id', antes.auth_user_id);
  END IF;
  UPDATE public.usuario_sistema SET ativo = false, desativado_em = now(), atualizado_em = now() WHERE id = p_alvo RETURNING * INTO depois;
  UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'desativacao' WHERE usuario_id = p_alvo AND revogada_em IS NULL;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.desativar', 'usuario_sistema', p_alvo, p_ip,
    app.usuario_gestao(antes), app.usuario_gestao(depois));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(depois), 'auth_user_id', depois.auth_user_id);
END $$;

CREATE FUNCTION srv.usuario_reativar(p_sessao_id uuid, p_alvo uuid, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.exigir_sessao(p_sessao_id, 'usuario.gerenciar');
  antes public.usuario_sistema;
  depois public.usuario_sistema;
BEGIN
  antes := app.travar_alvo(p_alvo);
  PERFORM app.exigir_gestao_sindico(a, ARRAY[antes.papel]);
  IF antes.ativo THEN RETURN jsonb_build_object('usuario', app.usuario_gestao(antes), 'auth_user_id', antes.auth_user_id); END IF;
  IF antes.anonimizado_em IS NOT NULL THEN
    PERFORM app.erro(409, 'USUARIO_ANONIMIZADO', 'Usuário anonimizado pela retenção (LGPD) não pode ser reativado. Cadastre um usuário novo.');
  END IF;
  UPDATE public.usuario_sistema SET ativo = true, desativado_em = NULL, atualizado_em = now() WHERE id = p_alvo RETURNING * INTO depois;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.reativar', 'usuario_sistema', p_alvo, p_ip,
    app.usuario_gestao(antes), app.usuario_gestao(depois));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(depois), 'auth_user_id', depois.auth_user_id);
END $$;

-- Banco ANTES do Auth: marca a troca pendente com prazo novo, revoga as sessões e desbloqueia. Se o Auth falhar em
-- seguida, o alvo fica com a senha antiga + troca obrigatória e sem sessão (falha fechada); a administração repete.
CREATE FUNCTION srv.usuario_redefinir_senha(p_sessao_id uuid, p_alvo uuid, p_ip text) RETURNS jsonb
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
         senha_alterada_em = now(), atualizado_em = now()
   WHERE id = p_alvo RETURNING * INTO depois;
  UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'redefinicao_senha' WHERE usuario_id = p_alvo AND revogada_em IS NULL;
  PERFORM app.limite_zerar_login(antes.login);
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'usuario.redefinir_senha', 'usuario_sistema', p_alvo, p_ip,
    app.usuario_gestao(antes), app.usuario_gestao(depois));
  RETURN jsonb_build_object('usuario', app.usuario_gestao(depois), 'auth_user_id', depois.auth_user_id);
END $$;

-- ===== api.*: sessão do front ==========================================================================================
-- /auth/me: permite troca pendente (a tela de troca precisa saber quem é). Devolve o id da sessão para a Edge.
CREATE FUNCTION api.sessao_atual() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a app.ator_t := app.ator(true, true);
  u public.usuario_sistema;
BEGIN
  SELECT * INTO u FROM public.usuario_sistema WHERE id = a.usuario_id;
  RETURN jsonb_build_object('usuario', app.usuario_publico(u), 'condominio', NULL,
    'sessao', jsonb_build_object('id', a.sessao_id,
      'expiraEm', to_char(a.expira_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'inatividadeMin', a.inatividade_min));
END $$;

-- Logout: revoga e audita. Depois o front faz signOut no Auth (refresh token desta sessão).
CREATE FUNCTION api.sessao_encerrar() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a app.ator_t := app.ator(true, false);
BEGIN
  UPDATE public.sessao SET revogada_em = now(), motivo_revogacao = 'logout' WHERE id = a.sessao_id AND revogada_em IS NULL;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'auth.logout', 'sessao', a.sessao_id, NULL, NULL,
    jsonb_build_object('login', a.login));
END $$;

-- ===== Posse e EXECUTE (fail-closed: tudo explícito) ======================================================================
-- Dono app_rw: SECURITY DEFINER roda com os GRANTs mínimos da 0001 (camada 1 do append-only preservada).
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace IN ('app'::regnamespace, 'api'::regnamespace, 'srv'::regnamespace)
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO app_rw', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;
ALTER TYPE app.ator_t OWNER TO app_rw;

GRANT EXECUTE ON FUNCTION api.sessao_atual(), api.sessao_encerrar() TO authenticated;
GRANT EXECUTE ON FUNCTION
  srv.login_preparar(text, text), srv.login_falhou(text, text),
  srv.login_registrar(text, text, text, uuid, uuid, boolean),
  srv.troca_preparar(uuid, text), srv.troca_falhou(uuid, text), srv.troca_concluir(uuid, text),
  srv.usuario_criar_preparar(uuid, text, text, public.papel),
  srv.usuario_criar(uuid, text, text, public.papel, uuid, text, text),
  srv.usuario_desativar(uuid, uuid, text), srv.usuario_reativar(uuid, uuid, text), srv.usuario_redefinir_senha(uuid, uuid, text)
TO service_role;

-- auth_parametros: só leitura para app_rw; contenção da 0016.
REVOKE ALL ON public.auth_parametros FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.auth_parametros TO app_rw;
ALTER TABLE public.auth_parametros ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_rw_acesso ON public.auth_parametros TO app_rw USING (true) WITH CHECK (true);
