// npm run popular:dry (só valida) e npm run popular (carga). Ver README, "Carga fictícia da demonstração".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { executar } from './programa.ts';

process.exitCode = await executar({
  argv: process.argv.slice(2),
  env: process.env,
  escrever: (t) => process.stdout.write(t),
  lerArquivo: (caminho) => { try { return readFileSync(caminho, 'utf8'); } catch { return null; } },
  caminhoCredenciais: fileURLToPath(new URL('../../local.credentials.txt', import.meta.url)),
});
