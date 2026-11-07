// Confere as migrations antes do merge (roda no CI, sem banco e sem dependências).
//  - falha se os nomes em supabase/migrations não tiverem versão única e estritamente crescente;
//  - em PR (BASE_REF definido), falha se uma migration NOVA tiver versão <= a maior já existente na
//    base, porque o `db push` não aplica migration mais antiga que a última já aplicada;
//    Exceção: migration cuja 1ª linha é RECUPERADA (aplicada no remoto fora do git e trazida do
//    histórico do banco depois) — já está aplicada, então a versão menor não é problema;
//  - só avisa (não falha) quando falta o par supabase/reversao/<versão>_<nome>.down.sql.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const RECUPERADA =
  '-- Recuperada do histórico do banco remoto (supabase_migrations.schema_migrations)'

const PASTA = 'supabase/migrations'
// Par de reversão só a partir da 0047: as anteriores são anteriores à convenção (e a trilha append-only não tem reversão segura).
const PRIMEIRA_COM_REVERSAO = '20261031004700'
const versao = (arq) => arq.match(/^(\d+)_/)?.[1]
const erros = []

const arquivos = readdirSync(PASTA)
  .filter((a) => a.endsWith('.sql'))
  .sort()

const vistas = new Set()
let anterior = ''
for (const a of arquivos) {
  const v = versao(a)
  if (!v) {
    erros.push(`${a}: nome sem prefixo de versão numérico`)
    continue
  }
  if (vistas.has(v)) erros.push(`${a}: versão ${v} duplicada`)
  else if (anterior && v <= anterior) erros.push(`${a}: versão fora de ordem (após ${anterior})`)
  vistas.add(v)
  anterior = v
  const down = `supabase/reversao/${a.replace(/\.sql$/, '.down.sql')}`
  if (v >= PRIMEIRA_COM_REVERSAO && !existsSync(down)) console.warn(`aviso: ${a} sem ${down}`)
}

const base = process.env.BASE_REF
if (base) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const ref = `origin/${base}`
  const maxBase = git('ls-tree', '--name-only', ref, `${PASTA}/`)
    .split('\n')
    .map((l) => versao(l.split('/').pop()))
    .filter(Boolean)
    .sort()
    .at(-1)
  const novas = git('diff', '--name-only', '--diff-filter=A', `${ref}...HEAD`, '--', PASTA)
    .split('\n')
    .filter((l) => l.endsWith('.sql'))
  for (const n of novas) {
    const v = versao(n.split('/').pop())
    // migration recuperada do histórico do remoto: já está aplicada lá, o `db push` não a reaplica
    if (readFileSync(n, 'utf8').startsWith(RECUPERADA)) continue
    if (maxBase && v && v <= maxBase) {
      erros.push(`${n}: versão ${v} <= ${maxBase} (maior em ${ref}); renomeie com versão maior`)
    }
  }
}

if (erros.length) {
  console.error(erros.map((e) => `erro: ${e}`).join('\n'))
  process.exit(1)
}
console.log(`migrations ok (${arquivos.length})`)
