// Login por "usuário" (desenho §2.2). O front manda { login, senha, manterConectado } com a anon key; a Edge:
//   1. srv.login_preparar: conta a tentativa (par login+IP, IP, login) e devolve o e-mail sintético SÓ se a conta
//      existe, está ativa e tem vínculo com o Auth. Bloqueado: 429 com Retry-After, sem consultar o Auth.
//   2. Auth (signInWithPassword) com esse e-mail. O e-mail é aleatório e só o banco o conhece: ir direto ao
//      /auth/v1/token pulando esta Edge exige adivinhá-lo.
//   3. srv.login_registrar: confere o estado de novo, recusa temporária vencida e cria a sessão (auth_session_id).
//      Recusado aqui: a sessão que o Auth abriu é revogada na hora.
// Falhas: mesma mensagem para login inexistente, inativo e senha errada, e duração mínima igual (o tempo não revela
// se o Auth foi consultado). Nada do corpo (login, senha) é logado.
import { ErroHttp, esperarAte, ipDoCliente, json, lerCorpo, servir, texto } from '../_shared/http.ts';
import { anon, payloadDoToken, revogarSessaoAuth, rpc, servico } from '../_shared/supabase.ts';
import { SENHA_MAX_BYTES } from '../_shared/senha.ts';

const MENSAGEM_CREDENCIAIS = 'Usuário ou senha inválidos.';
const MENSAGEM_TEMPORARIA_EXPIRADA = 'Senha temporária vencida. Peça a redefinição à administração.';
/** Piso de duração de toda falha (ms), acima do tempo do bcrypt do Auth (~70 ms medido local). */
const MINIMO_FALHA_MS = 700;

interface Preparo { bloqueado: boolean; retry_after_s?: number; auth_email?: string | null; atraso_ms?: number }
interface Registro {
  ok: boolean; motivo?: 'credenciais' | 'senha_temporaria_expirada';
  usuario?: unknown; condominio?: unknown; sessao?: unknown;
}

servir(async (req) => {
  const inicio = Date.now();
  const corpo = await lerCorpo(req);
  const login = texto(corpo.login, 200)?.trim() ?? '';
  const senha = texto(corpo.senha, 1024) ?? '';
  if (!login) throw new ErroHttp(400, 'VALIDACAO', 'Informe o login.', [{ field: 'login', message: 'Informe o login.' }]);
  if (!senha) throw new ErroHttp(400, 'VALIDACAO', 'Informe a senha.', [{ field: 'senha', message: 'Informe a senha.' }]);
  const manterConectado = corpo.manterConectado === true;
  const ip = ipDoCliente(req);
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null;
  const srv = servico();

  const falhar = async (codigo: string, mensagem: string, atrasoMs = 0): Promise<never> => {
    await esperarAte(inicio, MINIMO_FALHA_MS + atrasoMs);
    throw new ErroHttp(401, codigo, mensagem);
  };

  const prep = await rpc<Preparo>(srv, 'login_preparar', { p_login: login, p_ip: ip });
  if (prep.bloqueado) {
    await esperarAte(inicio, MINIMO_FALHA_MS);
    const s = String(Math.max(1, prep.retry_after_s ?? 60));
    throw new ErroHttp(429, 'LOGIN_BLOQUEADO', 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', null, { 'Retry-After': s });
  }
  // Senha acima de 72 bytes nunca é a certa (bcrypt): falha comum, sem ir ao Auth.
  if (!prep.auth_email || new TextEncoder().encode(senha).length > SENHA_MAX_BYTES) {
    await rpc(srv, 'login_falhou', { p_login: login, p_ip: ip });
    return falhar('CREDENCIAIS_INVALIDAS', MENSAGEM_CREDENCIAIS, prep.atraso_ms);
  }

  const { data, error } = await anon().auth.signInWithPassword({ email: prep.auth_email, password: senha });
  if (error || !data.session || !data.user) {
    if (error?.status === 429) {
      // Limite do próprio Auth (por IP; atrás da Edge pode ser o IP da Edge: ver desenho §2.2).
      throw new ErroHttp(429, 'LOGIN_BLOQUEADO', 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
    }
    if (error && error.status && error.status >= 500) {
      throw new ErroHttp(503, 'AUTH_INDISPONIVEL', 'O serviço de login não respondeu. Tente novamente em instantes.');
    }
    await rpc(srv, 'login_falhou', { p_login: login, p_ip: ip });
    return falhar('CREDENCIAIS_INVALIDAS', MENSAGEM_CREDENCIAIS, prep.atraso_ms);
  }

  const sessaoAuth = data.session;
  let reg: Registro;
  try {
    reg = await rpc<Registro>(srv, 'login_registrar', {
      p_login: login, p_ip: ip, p_user_agent: userAgent, p_auth_user_id: data.user.id,
      p_auth_session_id: payloadDoToken(sessaoAuth.access_token).session_id ?? null, p_manter_conectado: manterConectado,
    });
  } catch (e) {
    await revogarSessaoAuth(sessaoAuth.access_token);
    throw e;
  }
  if (!reg.ok) {
    await revogarSessaoAuth(sessaoAuth.access_token);
    return reg.motivo === 'senha_temporaria_expirada'
      ? falhar('SENHA_TEMPORARIA_EXPIRADA', MENSAGEM_TEMPORARIA_EXPIRADA, prep.atraso_ms)
      : falhar('CREDENCIAIS_INVALIDAS', MENSAGEM_CREDENCIAIS, prep.atraso_ms);
  }

  return json(req, 200, {
    usuario: reg.usuario, condominio: reg.condominio ?? null, sessao: reg.sessao,
    auth: {
      access_token: sessaoAuth.access_token, refresh_token: sessaoAuth.refresh_token,
      expires_in: sessaoAuth.expires_in, expires_at: sessaoAuth.expires_at, token_type: sessaoAuth.token_type,
    },
  });
});
