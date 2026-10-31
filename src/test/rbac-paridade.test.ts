// Paridade TS <-> SQL da matriz RBAC (desenho §2.3 e §7). O teste pgTAP 04_rbac_matriz é GERADO de rbac.ts e confere
// a tabela do banco e a decisão de app.exigir(); aqui se garante que o arquivo commitado é o gerado de agora. Mudou a
// MATRIZ sem regenerar (e sem migração nova com o bloco de scripts/rbac-sql.mjs migracao)? Este teste fica vermelho.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MATRIZ } from '@portaria/domain/rbac';
// @ts-expect-error módulo .mjs sem tipos (script de geração)
import { pares, sqlTeste } from '../../scripts/rbac-sql.mjs';

const raiz = resolve(__dirname, '../..');

describe('matriz RBAC: TS == SQL', () => {
  it('o teste pgTAP commitado é exatamente o gerado de rbac.ts', () => {
    const commitado = readFileSync(resolve(raiz, 'supabase/tests/database/04_rbac_matriz.test.sql'), 'utf8');
    expect(commitado).toBe(sqlTeste());
  });

  it('as migrações inserem exatamente os pares de MATRIZ (última definição de cada ação)', () => {
    const migracao = readFileSync(resolve(raiz, 'supabase/migrations/20261031001700_0017_rbac_matriz.sql'), 'utf8');
    const inseridos = [...migracao.matchAll(/^\s+\('([a-z_.]+)', '([a-z]+)'\)[,;]$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
    const esperados = (pares() as [string, string][]).map(([a, p]) => `${a}:${p}`).sort();
    expect(inseridos).toEqual(esperados);
    expect(esperados.length).toBe(Object.values(MATRIZ).reduce((n, papeis) => n + papeis.length, 0));
  });
});
