// npm run popular:sindico-local — SÓ para o ensaio local da carga: cria o primeiro síndico no Supabase LOCAL sem seed
// (o mesmo estado do hospedado depois do db push), pelo núcleo do sb:sindico. A chave secreta vem do `supabase status`
// e fica só em memória; login e senha vêm de POPULAR_LOGIN/POPULAR_SENHA ou do arquivo de credenciais.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarPrimeiroSindico, ErroBootstrap } from '../sindico/nucleo.ts';
import { dependenciasSupabase } from '../sindico/supabase.ts';
import { ErroConfiguracao, obterCredenciais } from './configuracao.ts';

function local(): { url: string; secreta: string } {
  const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter((m) => m !== null).map((m) => [m[1], m[2]]));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '')) throw new ErroConfiguracao('supabase status não aponta para o Supabase local: recusado.');
  if (!/^sb_secret_/.test(v.SECRET_KEY ?? '')) throw new ErroConfiguracao('supabase status não devolveu a SECRET_KEY local.');
  return { url: v.API_URL!, secreta: v.SECRET_KEY! };
}

try {
  const cred = obterCredenciais(process.env, (c) => { try { return readFileSync(c, 'utf8'); } catch { return null; } },
    fileURLToPath(new URL('../../local.credentials.txt', import.meta.url)));
  const { url, secreta } = local();
  const u = await criarPrimeiroSindico({ nome: process.env.POPULAR_NOME_SINDICO || 'Síndico do Ensaio', login: cred.login, senha: cred.senha },
    dependenciasSupabase(url, secreta));
  process.stdout.write(`Síndico local "${u.login}" criado em ${url}.\n`);
} catch (e) {
  const m = e instanceof ErroBootstrap ? `${e.codigo}: ${e.message}` : e instanceof ErroConfiguracao ? e.message : `erro inesperado (${(e as Error)?.name})`;
  process.stdout.write(`Falhou: ${m}\n`);
  process.exitCode = 1;
}
