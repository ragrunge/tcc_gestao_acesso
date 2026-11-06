// Banco SEM seed, como o projeto hospedado (`npm run test:integracao:sem-seed`): bootstrap do primeiro síndico e estrutura
// do condomínio (migração 0035). Separado do `test:integracao` porque exige o banco sem a demonstração, e as outras suítes
// exigem o seed.
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  test: { ...base.test, include: ['scripts/integracao/sem-seed/*.test.ts'] },
});
