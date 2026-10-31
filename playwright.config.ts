import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// E2E do front contra o Supabase LOCAL (`supabase start`, `supabase db reset`, `supabase functions serve`).
// Portado na F1: 30-supabase-auth.spec.ts. As demais specs foram escritas contra a API NestJS (removida) e falham até
// serem adaptadas nas fases seguintes. O Vite sobe em porta própria (5180) para não colidir com o dev na 5173.
const PORTA = 5180;

// URL e anon key do stack local, lidas do CLI na hora (as padrão do CLI, descartáveis): nada fica em arquivo. Vão
// para o Vite por variável de ambiente, que vence o .env (o .env da raiz pode apontar para o projeto hospedado).
function supabaseLocal(): { url: string; anon: string } {
  try {
    const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1], m[2]]));
    if (/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '') && v.ANON_KEY) return { url: v.API_URL!, anon: v.ANON_KEY };
  } catch { /* sem CLI ou sem stack: cai abaixo */ }
  return { url: 'http://127.0.0.1:54321', anon: '' };
}
const SUPABASE = supabaseLocal();
process.env.E2E_SUPABASE_URL = SUPABASE.url;
process.env.E2E_SUPABASE_ANON_KEY = SUPABASE.anon;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    env: { VITE_SUPABASE_URL: SUPABASE.url, VITE_SUPABASE_ANON_KEY: SUPABASE.anon },
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
