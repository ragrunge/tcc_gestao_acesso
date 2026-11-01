// Credenciais do síndico e alvo da carga. A senha só existe em memória: nenhuma mensagem daqui a inclui, nem o arquivo
// lido (só "login:" e "senha:" são interpretados; o resto do arquivo é ignorado e nunca ecoado).
export interface Credenciais { login: string; senha: string }

export class ErroConfiguracao extends Error {}

export function lerCredenciaisTexto(texto: string): Credenciais | null {
  let login = '';
  let senha = '';
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*(login|senha)\s*:\s?(.*?)\s*$/i.exec(linha);
    if (!m) continue;
    if (m[1]!.toLowerCase() === 'login') login = m[2]!;
    else senha = m[2]!;
  }
  return login && senha ? { login, senha } : null;
}

/** POPULAR_LOGIN e POPULAR_SENHA vencem o arquivo (POPULAR_CREDENCIAIS, padrão local.credentials.txt na raiz). */
export function obterCredenciais(env: Record<string, string | undefined>, lerArquivo: (caminho: string) => string | null, caminhoPadrao: string): Credenciais {
  if (env.POPULAR_LOGIN || env.POPULAR_SENHA) {
    if (!env.POPULAR_LOGIN || !env.POPULAR_SENHA) throw new ErroConfiguracao('Defina POPULAR_LOGIN e POPULAR_SENHA juntos (ou nenhum dos dois, para usar o arquivo).');
    return { login: env.POPULAR_LOGIN.trim(), senha: env.POPULAR_SENHA };
  }
  const caminho = env.POPULAR_CREDENCIAIS || caminhoPadrao;
  const texto = lerArquivo(caminho);
  if (texto === null) throw new ErroConfiguracao(`Arquivo de credenciais não encontrado (${caminho}).`);
  const c = lerCredenciaisTexto(texto);
  if (!c) throw new ErroConfiguracao(`O arquivo de credenciais (${caminho}) precisa das linhas "login: ..." e "senha: ...".`);
  return c;
}

export interface Alvo { url: string; chaveAnon: string; host: string; local: boolean }

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
const HOSPEDADO = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

/**
 * POPULAR_SUPABASE_URL/POPULAR_SUPABASE_ANON_KEY vencem as VITE_* do .env (para o ensaio local sem tocar no .env). A
 * carga só sai com POPULAR_CONFIRMAR igual ao host do alvo: apontar para produção nunca acontece por omissão.
 */
export function resolverAlvo(env: Record<string, string | undefined>): Alvo {
  const url = (env.POPULAR_SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const chaveAnon = (env.POPULAR_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !chaveAnon) throw new ErroConfiguracao('Defina a URL e a chave anon (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env, ou POPULAR_SUPABASE_URL e POPULAR_SUPABASE_ANON_KEY).');
  const local = LOCAL.test(url);
  if (!local && !HOSPEDADO.test(url)) throw new ErroConfiguracao('A URL precisa ser o Supabase local (http://127.0.0.1:porta) ou um projeto https://<id>.supabase.co.');
  if (/^(sb_secret_|service_role)/.test(chaveAnon) || /"role"\s*:\s*"service_role"/.test(decodificarPayload(chaveAnon))) {
    throw new ErroConfiguracao('A chave informada é de serviço: o carregador só usa a chave anon/publishable.');
  }
  const host = new URL(url).host;
  if ((env.POPULAR_CONFIRMAR ?? '').trim() !== host) {
    throw new ErroConfiguracao(`Alvo: ${host}${local ? ' (local)' : ' (HOSPEDADO)'}. Para confirmar, rode de novo com POPULAR_CONFIRMAR=${host}.`);
  }
  return { url, chaveAnon, host, local };
}

function decodificarPayload(jwt: string): string {
  const partes = jwt.split('.');
  if (partes.length !== 3) return '';
  try { return Buffer.from(partes[1]!, 'base64url').toString('utf8'); } catch { return ''; }
}

export function intervaloMs(env: Record<string, string | undefined>): number {
  const n = Number(env.POPULAR_INTERVALO_MS ?? 250);
  if (!Number.isFinite(n) || n < 100 || n > 10_000) throw new ErroConfiguracao('POPULAR_INTERVALO_MS deve ficar entre 100 e 10000.');
  return n;
}
