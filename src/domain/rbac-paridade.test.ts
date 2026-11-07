// Paridade TS <-> SQL da matriz RBAC (desenho §2.3 e §7). Mudou a MATRIZ sem migração nova com o bloco de
// scripts/rbac-sql.mjs migracao? Este teste fica vermelho.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MATRIZ } from '@/domain/rbac'
// @ts-expect-error módulo .mjs sem tipos (script de geração)
import { pares } from '../../scripts/rbac-sql.mjs'

const raiz = resolve(__dirname, '../..')
const MARCADOR = 'Bloco gerado (scripts/rbac-sql.mjs migracao)'

describe('matriz RBAC: TS == SQL', () => {
  it('a última migração com o bloco gerado insere exatamente os pares de MATRIZ', () => {
    // Cada migração que muda a matriz regrava o bloco inteiro (DELETE + INSERT): vale a mais recente.
    const pasta = resolve(raiz, 'supabase/migrations')
    const ultima = readdirSync(pasta)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => readFileSync(resolve(pasta, f), 'utf8').includes(MARCADOR))
      .at(-1)
    expect(ultima).toBeDefined()
    const migracao = readFileSync(resolve(pasta, ultima!), 'utf8')
    if (ultima !== '20261031001700_0017_rbac_matriz.sql')
      expect(migracao).toMatch(/^DELETE FROM public\.rbac_matriz;$/m)
    const inseridos = [...migracao.matchAll(/^\s+\('([a-z_.]+)', '([a-z_]+)'\)[,;]$/gm)]
      .map((m) => `${m[1]}:${m[2]}`)
      .sort()
    const esperados = (pares() as [string, string][]).map(([a, p]) => `${a}:${p}`).sort()
    expect(inseridos).toEqual(esperados)
    expect(esperados.length).toBe(Object.values(MATRIZ).reduce((n, papeis) => n + papeis.length, 0))
  })
})
