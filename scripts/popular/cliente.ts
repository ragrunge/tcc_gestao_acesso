// Rede do carregador: login pela Edge auth-entrar (o mesmo fluxo da tela) e RPCs api.* com a sessão do síndico, em
// ritmo fixo. Nenhuma mensagem leva a senha, o token ou o corpo da requisição (que tem CPF).
import { createClient } from '@supabase/supabase-js';
import type { Alvo, Credenciais } from './configuracao.ts';

export class ErroCarga extends Error {
  codigo: string;
  status: number;
  detalhes: unknown;
  constructor(codigo: string, mensagem: string, status = 0, detalhes?: unknown) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
    this.detalhes = detalhes;
  }
}

export interface Api {
  /** `leitura`: pode ser repetida sem risco depois de uma falha de rede. */
  rpc<T>(nome: string, args?: Record<string, unknown>, opc?: { leitura?: boolean }): Promise<T>;
  encerrar(): Promise<void>;
  readonly chamadas: number;
}

export interface UsuarioLogado { id: string; nome: string; login: string; papel: string }

const TEMPO_LIMITE_MS = 30_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function detalhesDe(d: unknown): unknown {
  if (typeof d !== 'string') return d ?? undefined;
  try { return JSON.parse(d); } catch { return d; }
}

export async function conectar(alvo: Alvo, cred: Credenciais, intervaloMs: number): Promise<{ api: Api; usuario: UsuarioLogado }> {
  const comTempo: typeof fetch = (entrada, init) => fetch(entrada, { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  let r: Response;
  try {
    r = await comTempo(`${alvo.url}/functions/v1/auth-entrar`, {
      method: 'POST',
      headers: { apikey: alvo.chaveAnon, Authorization: `Bearer ${alvo.chaveAnon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: cred.login, senha: cred.senha }),
    });
  } catch {
    throw new ErroCarga('FALHA_DE_REDE', 'Não foi possível falar com a Edge auth-entrar.');
  }
  const corpo = (await r.json().catch(() => ({}))) as {
    code?: string; message?: string; usuario?: UsuarioLogado; auth?: { access_token?: string; refresh_token?: string };
  };
  if (!r.ok) {
    const espera = r.headers.get('retry-after');
    throw new ErroCarga(corpo.code ?? `HTTP_${r.status}`, `Login recusado (${r.status})${espera ? `; aguarde ${espera} s` : ''}: ${corpo.message ?? ''}`, r.status);
  }
  if (!corpo.usuario || !corpo.auth?.access_token || !corpo.auth.refresh_token) throw new ErroCarga('RESPOSTA_INVALIDA', 'Resposta do login sem sessão.');
  if (corpo.usuario.papel !== 'sindico') throw new ErroCarga('PAPEL', `O usuário entrou como ${corpo.usuario.papel}; a carga exige o síndico.`);

  const sb = createClient(alvo.url, alvo.chaveAnon, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: comTempo },
  });
  const { error } = await sb.auth.setSession({ access_token: corpo.auth.access_token, refresh_token: corpo.auth.refresh_token });
  if (error) throw new ErroCarga('SESSAO', 'O Supabase Auth não aceitou a sessão devolvida pelo login.');

  let ultima = 0;
  let chamadas = 0;
  const api: Api = {
    get chamadas() { return chamadas; },
    async rpc<T>(nome: string, args: Record<string, unknown> = {}, opc: { leitura?: boolean } = {}): Promise<T> {
      for (let tentativa = 1; ; tentativa++) {
        const falta = ultima + intervaloMs - Date.now();
        if (falta > 0) await esperar(falta);
        ultima = Date.now();
        chamadas++;
        let res: { data: unknown; error: { code?: string; message?: string; details?: unknown } | null; status: number };
        try {
          res = await sb.schema('api').rpc(nome, args);
        } catch {
          res = { data: null, error: { code: 'FALHA_DE_REDE' }, status: 0 };
        }
        if (!res.error) return res.data as T;
        const codigo = res.error.code ?? '';
        // 40001/40P01: a transação inteira foi desfeita (como o adaptador do front). 429 e falha de conexão do
        // PostgREST (PGRST000-003): a chamada não chegou a rodar. Os dois casos se repetem sem risco de duplicar.
        const naoRodou = codigo === '40001' || codigo === '40P01' || res.status === 429 || /^PGRST00[0-3]$/.test(codigo);
        const redeEmLeitura = res.status === 0 && opc.leitura;
        if ((naoRodou || redeEmLeitura) && tentativa < 5) { await esperar(1000 * 2 ** tentativa); continue; }
        if (res.status === 0) {
          throw new ErroCarga('FALHA_DE_REDE', `Sem resposta em ${nome}. Não se sabe se a escrita foi gravada: rode de novo, a carga confere o que já existe e continua.`);
        }
        const nosso = /^[A-Z_]+$/.test(codigo);
        throw new ErroCarga(nosso ? codigo : `HTTP_${res.status}`, `${nome}: ${nosso ? res.error.message ?? '' : 'erro do servidor'}`,
          res.status, nosso ? detalhesDe(res.error.details) : undefined);
      }
    },
    async encerrar() {
      try { await api.rpc('sessao_encerrar'); } catch { /* sessão já inválida no servidor */ }
      sb.auth.stopAutoRefresh();
      await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },
  };
  return { api, usuario: corpo.usuario };
}
