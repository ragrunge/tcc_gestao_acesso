// F5 (0039): síndico edita nome, login e papel pela tela de Usuários, contra o Supabase LOCAL (Auth + Edge usuarios-admin).
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/35-supabase-usuarios-editar.spec.ts
// Usuários do seed (supabase/seed/demo.sql), senha de demonstração só local. Cada execução cria o próprio porteiro pela
// Edge (login com sufixo aleatório), para não depender de execuções anteriores.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

async function entrar(page: Page, login: string, senha: string, destino: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(destino);
}

const entrarApi = (request: APIRequestContext, login: string, senha: string) => request.post(`${SUPABASE}/functions/v1/auth-entrar`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, data: { login, senha },
});
const sessaoAtual = (request: APIRequestContext, token: string) => request.post(`${SUPABASE}/rest/v1/rpc/sessao_atual`, {
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Profile': 'api' }, data: {},
});

test('síndico edita nome, login e papel; o login antigo para de valer e a sessão do alvo cai ao mudar o papel', async ({ page, request }) => {
  const sindico = await entrarApi(request, 'roberto.faria', SENHA_DEMO);
  expect(sindico.status()).toBe(200);
  const tokenSindico = (await sindico.json()).auth.access_token as string;
  const login = `e2e.ed.${Date.now().toString(36)}`;
  const criado = await request.post(`${SUPABASE}/functions/v1/usuarios-admin`, {
    headers: { apikey: ANON, Authorization: `Bearer ${tokenSindico}` },
    data: { acao: 'criar', nome: 'Renata Paes', login, papel: 'porteiro' },
  });
  expect(criado.status()).toBe(201);
  const temporaria = (await criado.json()).senhaTemporaria as string;
  const alvo = await entrarApi(request, login, temporaria);
  expect(alvo.status()).toBe(200);
  const tokenAlvo = (await alvo.json()).auth.access_token as string;

  await entrar(page, 'roberto.faria', SENHA_DEMO, /\/painel$/);
  await page.goto('/usuarios');
  await page.getByLabel('Buscar por nome ou login').fill(login);
  await page.getByRole('button', { name: 'Editar Renata Paes' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Editar Renata Paes' });

  // Login de outro usuário: o erro do servidor aparece no campo.
  await dialogo.getByLabel('Login').fill('joao.lima');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialogo.getByText('Já existe um usuário com este login.')).toBeVisible();

  const novoLogin = `${login}.novo`;
  await dialogo.getByLabel('Nome completo').fill('Renata Paes Leme');
  await dialogo.getByLabel('Login').fill(novoLogin);
  await dialogo.getByLabel('Papel').selectOption('auditor');
  await expect(dialogo).toContainText('sessões abertas de Renata Paes são encerradas');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText('Dados de Renata Paes Leme atualizados.')).toBeVisible();

  await page.getByLabel('Buscar por nome ou login').fill(novoLogin);
  const linha = page.getByRole('row').filter({ hasText: novoLogin });
  await expect(linha).toContainText('Renata Paes Leme');
  await expect(linha).toContainText('Auditor');
  await expect(linha).not.toContainText('portaria.invalid');

  // Papel mudou: a sessão aberta do alvo cai na hora. O Auth não mudou: a mesma senha entra pelo login novo.
  expect((await (await sessaoAtual(request, tokenAlvo)).json()).code).toBe('SESSAO_INVALIDA');
  expect((await (await entrarApi(request, login, temporaria)).json()).code).toBe('CREDENCIAIS_INVALIDAS');
  const deNovo = await entrarApi(request, novoLogin, temporaria);
  expect(deNovo.status()).toBe(200);
  expect((await deNovo.json()).usuario).toMatchObject({ login: novoLogin, papel: 'auditor' });
});

test('na própria linha, o papel fica travado', async ({ page }) => {
  await entrar(page, 'roberto.faria', SENHA_DEMO, /\/painel$/);
  await page.goto('/usuarios');
  const minha = page.getByRole('row').filter({ hasText: 'roberto.faria' });
  await minha.getByRole('button', { name: /^Editar / }).click();
  const dialogo = page.getByRole('dialog', { name: /^Editar / });
  await expect(dialogo.getByLabel('Papel')).toBeDisabled();
  await expect(dialogo).toContainText('Ninguém muda o próprio papel');
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
});
