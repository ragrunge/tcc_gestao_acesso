// Gera o SQL da matriz RBAC a partir de src/domain/rbac.ts (fonte única; desenho §2.3).
//   node scripts/rbac-sql.mjs migracao   -> bloco INSERT para uma migração NOVA (nunca editar migração aplicada)
// O teste de paridade (src/domain/rbac-paridade.test.ts) confere que a migração mais recente com o bloco gerado
// insere exatamente os pares de rbac.ts.
import { pathToFileURL } from 'node:url'
import { MATRIZ } from '../src/domain/rbac.ts'

export const PAPEIS = ['sindico', 'administracao', 'porteiro', 'auditor', 'admin_sistema']

const q = (s) => `'${String(s).replaceAll("'", "''")}'`

export function acoes() {
  return Object.keys(MATRIZ).sort()
}

/** Pares (acao, papel) permitidos, em ordem estável. */
export function pares() {
  return acoes().flatMap((a) => PAPEIS.filter((p) => MATRIZ[a].includes(p)).map((p) => [a, p]))
}

// A matriz inteira, de novo, a cada migração que a muda: apaga os pares e regrava (a 0017 tem a primeira versão).
// rbac_acao só cresce (ON CONFLICT): ação fora do TS continua conhecida e sem papel, nunca "digitada errada".
export function sqlMigracao() {
  return [
    'DELETE FROM public.rbac_matriz;',
    '',
    'INSERT INTO public.rbac_acao (acao) VALUES',
    acoes()
      .map((a) => `  (${q(a)})`)
      .join(',\n') + '\nON CONFLICT (acao) DO NOTHING;',
    '',
    'INSERT INTO public.rbac_matriz (acao, papel) VALUES',
    pares()
      .map(([a, p]) => `  (${q(a)}, ${q(p)})`)
      .join(',\n') + ';',
    '',
  ].join('\n')
}

const direto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
const modo = direto ? process.argv[2] : undefined
if (modo === 'migracao') process.stdout.write(sqlMigracao())
else if (direto) {
  process.stderr.write('uso: node scripts/rbac-sql.mjs migracao\n')
  process.exit(1)
}
