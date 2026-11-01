// Bootstrap do primeiro síndico contra o Supabase LOCAL sem seed (`npm run test:supabase:sindico`). Separado do
// `test:supabase` porque exige o banco vazio, e as outras suítes exigem o seed.
import { defineConfig } from 'vitest/config';
import base from './vitest.supabase.config';

export default defineConfig({ ...base, test: { ...base.test, include: ['supabase/tests/sindico/**/*.test.ts'] } });
