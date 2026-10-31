// Testes de integração contra o Supabase LOCAL (Edge Functions de auth). Fora do `npm test`: exigem
// `supabase start`, `supabase db reset` e `supabase functions serve` rodando. Ver supabase/tests/functions/edge.test.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['supabase/tests/functions/**/*.test.ts', 'supabase/tests/integracao/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
