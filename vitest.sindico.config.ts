// Banco SEM seed, como o projeto hospedado (`npm run test:supabase:sindico`): bootstrap do primeiro síndico e estrutura
// do condomínio (migração 0035). Separado do `test:supabase` porque exige o banco sem a demonstração, e as outras suítes
// exigem o seed.
import { defineConfig } from 'vitest/config';
import base from './vitest.supabase.config';

export default defineConfig({
  ...base,
  test: { ...base.test, include: ['supabase/tests/sindico/**/*.test.ts', 'supabase/tests/sem-seed/**/*.test.ts'] },
});
