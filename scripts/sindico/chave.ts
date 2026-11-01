// A chave de serviço sai da Management API (com o token de acesso da conta) e fica só em memória: não vai para disco,
// .env nem log. Preferência pela chave secreta nova (sb_secret_), com a service_role legada (JWT) como alternativa.
import { ErroBootstrap } from './nucleo.ts';

interface ChaveApi { name?: string; type?: string | null; api_key?: string | null }

export const REF_PROJETO = /^[a-z0-9]{20}$/;

export async function obterChaveServico(ref: string, tokenConta: string, buscar: typeof fetch = fetch): Promise<string> {
  if (!REF_PROJETO.test(ref)) throw new ErroBootstrap('CONFIGURACAO', 'VITE_SUPABASE_PROJECT_ID não parece um ID de projeto.');
  if (!tokenConta) throw new ErroBootstrap('CONFIGURACAO', 'SUPABASE_ACCESS_TOKEN ausente.');
  const r = await buscar(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${tokenConta}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new ErroBootstrap('MANAGEMENT_API', `A Management API respondeu ${r.status} ao pedir as chaves do projeto.`);
  const lista = (await r.json()) as ChaveApi[];
  if (!Array.isArray(lista)) throw new ErroBootstrap('MANAGEMENT_API', 'Resposta inesperada da Management API.');
  const secreta = lista.find((k) => k.type === 'secret' && /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(k.api_key ?? ''));
  const legada = lista.find((k) => k.name === 'service_role' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(k.api_key ?? ''));
  const chave = (secreta ?? legada)?.api_key;
  if (!chave) throw new ErroBootstrap('MANAGEMENT_API', 'O projeto não devolveu uma chave secreta nem a service_role.');
  return chave;
}
