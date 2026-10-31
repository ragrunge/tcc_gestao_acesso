// HTTP comum das Edge Functions: CORS, corpo JSON, erro no formato { code, message, details } (o mesmo das RPCs e do
// ApiError do front), IP do cliente e espera mínima nas falhas. Nada aqui loga corpo, senha ou token.

const ORIGENS_PADRAO = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5180', 'http://127.0.0.1:5180'];

/** Origens do front que podem chamar (PORTARIA_ORIGENS, separadas por vírgula). Sem cookie: CORS não é a defesa, só higiene. */
function origens(): string[] {
  const env = Deno.env.get('PORTARIA_ORIGENS');
  return env ? env.split(',').map((o) => o.trim()).filter(Boolean) : ORIGENS_PADRAO;
}

export function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('origin');
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Retry-After',
    Vary: 'Origin',
  };
  if (origem && origens().includes(origem)) base['Access-Control-Allow-Origin'] = origem;
  return base;
}

export class ErroHttp extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown = null,
              public headers: Record<string, string> = {}) {
    super(message);
  }
}

export function json(req: Request, status: number, corpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

export function respostaDeErro(req: Request, e: unknown): Response {
  if (e instanceof ErroHttp) return json(req, e.status, { code: e.code, message: e.message, details: e.details }, e.headers);
  // Erro de RPC já no nosso formato (RAISE PGRST): repassa status e código.
  const pg = e as { status?: number; code?: string; message?: string; details?: unknown };
  if (pg && typeof pg.code === 'string' && /^[A-Z_]+$/.test(pg.code) && typeof pg.status === 'number') {
    return json(req, pg.status, { code: pg.code, message: pg.message, details: pg.details ?? null });
  }
  // Sem detalhe do erro na resposta nem no log (pode carregar dado da requisição).
  console.error('edge.erro_inesperado', { tipo: (e as Error)?.name ?? typeof e });
  return json(req, 500, { code: 'ERRO_INTERNO', message: 'O servidor não respondeu como esperado. Tente novamente em instantes.', details: null });
}

/** Lê o corpo como objeto JSON com tamanho máximo; qualquer outra coisa é 400. */
export async function lerCorpo(req: Request, max = 4096): Promise<Record<string, unknown>> {
  const texto = await req.text();
  if (texto.length > max) throw new ErroHttp(413, 'CORPO_GRANDE', 'Requisição grande demais.');
  try {
    const v = JSON.parse(texto);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* cai no erro abaixo */ }
  throw new ErroHttp(400, 'VALIDACAO', 'Corpo da requisição inválido.');
}

export const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);

/**
 * IP do cliente. Medido no Supabase local (Kong): o proxy ACRESCENTA o IP que viu ao fim do X-Forwarded-For, e o que o
 * cliente mandou fica à esquerda. Por isso vale a entrada que está PORTARIA_PROXIES_CONFIAVEIS (padrão 1) posições a
 * partir da direita; as da esquerda são forjáveis. No projeto hospedado, conferir quantos saltos o Supabase acrescenta.
 */
export function ipDoCliente(req: Request): string | null {
  const saltos = Math.max(1, Number(Deno.env.get('PORTARIA_PROXIES_CONFIAVEIS') ?? '1') || 1);
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = xff.length >= saltos ? xff[xff.length - saltos] : null;
  return ip && /^[0-9a-fA-F.:]{2,45}$/.test(ip) ? ip : null;
}

/** Garante uma duração mínima (as falhas não revelam, pelo tempo, se o login existe ou se o Auth foi consultado). */
export async function esperarAte(inicio: number, minimoMs: number): Promise<void> {
  const falta = inicio + minimoMs - Date.now();
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
}

export function servir(fn: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecalhosCors(req) });
    if (req.method !== 'POST') return json(req, 405, { code: 'METODO_NAO_PERMITIDO', message: 'Use POST.', details: null });
    try {
      return await fn(req);
    } catch (e) {
      return respostaDeErro(req, e);
    }
  });
}
