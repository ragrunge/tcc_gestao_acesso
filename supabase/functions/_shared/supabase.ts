// Clientes do Supabase dentro da Edge. As chaves vêm do ambiente que o Supabase injeta (SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY): nunca do repo. Nenhum cliente persiste sessão.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ErroHttp } from './http.ts';

const env = (nome: string): string => {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`variável ${nome} ausente`);
  return v;
};

const semSessao = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** service_role, schema srv: só para as RPCs srv.* e a API admin do Auth. Nunca sai da Edge. */
export const servico = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { ...semSessao, db: { schema: 'srv' } });

/** anon: só para verificar senha no Auth (signInWithPassword) com o e-mail que o banco devolveu. */
export const anon = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), semSessao);

/** A JWT do usuário, repassada ao PostgREST (que a verifica) para chamar api.*. */
const doUsuario = (jwt: string): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'),
  { ...semSessao, db: { schema: 'api' }, global: { headers: { Authorization: `Bearer ${jwt}` } } });

interface ErroRpc { status: number; code: string; message: string; details: unknown }

/** Chama a RPC e devolve `data`; erro vira exceção com o status e o corpo do PostgREST. */
export async function rpc<T>(c: SupabaseClient, nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await c.rpc(nome, args);
  if (error) {
    let details: unknown = error.details ?? null;
    // app.erro serializa os detalhes (o PostgREST só aceita texto ali).
    if (typeof details === 'string') { try { details = JSON.parse(details); } catch { /* texto comum */ } }
    const e: ErroRpc = { status, code: error.code, message: error.message, details };
    throw e;
  }
  return data as T;
}

/** Token Bearer do usuário; a anon key (sem `sub`) não serve. */
export function jwtDoUsuario(req: Request): string {
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new ErroHttp(401, 'NAO_AUTENTICADO', 'Entre no sistema para continuar.');
  return m[1];
}

export interface SessaoAtual {
  usuario: { id: string; nome: string; login: string; papel: string; deveTrocarSenha: boolean };
  sessao: { id: string; expiraEm: string; inatividadeMin: number };
}

/**
 * Quem chama: a JWT vai ao PostgREST (assinatura e validade conferidas lá) e api.sessao_atual aplica app.ator()
 * (sessão não revogada, prazos, usuário ativo). Nada do payload da JWT é usado aqui para decidir permissão.
 */
export async function sessaoDoUsuario(req: Request): Promise<SessaoAtual> {
  try {
    return await rpc<SessaoAtual>(doUsuario(jwtDoUsuario(req)), 'sessao_atual', {});
  } catch (e) {
    // Erro do próprio PostgREST (JWT inválida/expirada PGRST3xx, anon key sem EXECUTE 42501): sem sessão de usuário.
    const x = e as Partial<ErroRpc>;
    if ((x.status === 401 || x.status === 403) && !/^[A-Z_]+$/.test(x.code ?? '')) {
      throw new ErroHttp(401, 'NAO_AUTENTICADO', 'Entre no sistema para continuar.');
    }
    throw e;
  }
}

/** Payload de uma JWT que acabou de sair do próprio Auth (resposta direta do GoTrue; não é entrada do cliente). */
export function payloadDoToken(token: string): Record<string, unknown> {
  const p = token.split('.')[1] ?? '';
  const b64 = p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))));
}

/** Revoga no Auth a sessão que acabou de abrir (login recusado pelo banco, ou conferência da senha atual). */
export async function revogarSessaoAuth(accessToken: string): Promise<void> {
  const { error } = await servico().auth.admin.signOut(accessToken, 'local');
  if (error) console.error('edge.revogar_sessao_auth_falhou', { status: error.status });
}
