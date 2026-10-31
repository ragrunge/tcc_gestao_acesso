// F1: login, troca obrigatória e logout no navegador contra o Supabase LOCAL (Auth + Edge Functions + RPC).
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/30-supabase-auth.spec.ts
// Usuários do seed (supabase/seed.sql), senha de demonstração só local. Sem o reset de banco do helpers.ts (rota da
// API NestJS antiga): cada teste usa logins próprios ou cria o seu pela Edge usuarios-admin.
import { expect, test, type Page } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

async function preencherLogin(page: Page, login: string, senha: string, manter = false) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  if (manter) await page.getByLabel(/Manter conectado/).check();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** Onde o supabase-js guardou a sessão: [chaves no sessionStorage, chaves no localStorage]. */
const ondeEstaASessao = (page: Page) => page.evaluate(() => {
  const chaves = (s: Storage) => Object.keys(s).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return [chaves(sessionStorage).length, chaves(localStorage).length];
});

const tokenNoNavegador = (page: Page) => page.evaluate(() => {
  for (const s of [sessionStorage, localStorage]) {
    const k = Object.keys(s).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
    if (k) return (JSON.parse(s.getItem(k)!) as { access_token: string }).access_token;
  }
  return null;
});

async function sessaoAtual(page: Page, token: string) {
  return page.request.post(`${SUPABASE}/rest/v1/rpc/sessao_atual`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Profile': 'api', 'Content-Type': 'application/json' }, data: {},
  });
}

test('porteiro entra, a sessão sobrevive ao recarregar e "Sair" encerra no servidor', async ({ page }) => {
  await preencherLogin(page, 'joao.lima', SENHA_DEMO);
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByText('João Lima', { exact: true }).first()).toBeVisible();
  expect(await ondeEstaASessao(page)).toEqual([1, 0]); // sem "manter conectado": sessionStorage

  await page.reload();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByText('João Lima', { exact: true }).first()).toBeVisible();

  const token = await tokenNoNavegador(page);
  expect(token).toBeTruthy();
  expect((await sessaoAtual(page, token!)).status()).toBe(200);

  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await ondeEstaASessao(page)).toEqual([0, 0]);
  // O access token antigo ainda está dentro do prazo do JWT, mas o banco já revogou a sessão.
  const depois = await sessaoAtual(page, token!);
  expect(depois.status()).toBe(401);
  expect((await depois.json()).code).toBe('SESSAO_INVALIDA');
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test('senha errada e usuário inexistente mostram a mesma mensagem e ficam no login', async ({ page }) => {
  await preencherLogin(page, 'paula.nogueira', 'senha-errada-123');
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.');
  await expect(page).toHaveURL(/\/login$/);
  await preencherLogin(page, 'fulano.inexistente', 'senha-errada-123');
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.');
  await expect(page).toHaveURL(/\/login$/);
});

test('"manter conectado": síndico vai para o localStorage; porteiro não (o servidor recusa sessão longa)', async ({ page }) => {
  await preencherLogin(page, 'roberto.faria', SENHA_DEMO, true);
  await expect(page).toHaveURL(/\/painel$/);
  expect(await ondeEstaASessao(page)).toEqual([0, 1]);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await ondeEstaASessao(page)).toEqual([0, 0]);

  await preencherLogin(page, 'joao.lima', SENHA_DEMO, true);
  await expect(page).toHaveURL(/\/painel$/);
  expect(await ondeEstaASessao(page)).toEqual([1, 0]);
});

test('troca obrigatória: senha temporária -> /trocar-senha -> senha pessoal -> sair -> entrar com a nova', async ({ page, request }) => {
  // Síndico cria a conta pela Edge (o mesmo caminho da tela de usuários).
  const entrar = await request.post(`${SUPABASE}/functions/v1/auth-entrar`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, data: { login: 'roberto.faria', senha: SENHA_DEMO },
  });
  expect(entrar.status()).toBe(200);
  const tokenSindico = (await entrar.json()).auth.access_token as string;
  const login = `e2e.${Date.now().toString(36)}`;
  const criado = await request.post(`${SUPABASE}/functions/v1/usuarios-admin`, {
    headers: { apikey: ANON, Authorization: `Bearer ${tokenSindico}` },
    data: { acao: 'criar', nome: 'Marcos Teixeira', login, papel: 'porteiro' },
  });
  expect(criado.status()).toBe(201);
  const temporaria = (await criado.json()).senhaTemporaria as string;

  await preencherLogin(page, login, temporaria);
  await expect(page).toHaveURL(/\/trocar-senha$/);
  await expect(page.getByText('Troca obrigatória')).toBeVisible();
  // Rota protegida com troca pendente volta para a troca.
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/trocar-senha$/);

  // Senha fraca: a política do servidor responde e a tela mostra.
  await page.getByLabel('Senha atual').fill(temporaria);
  await page.getByLabel('Nova senha', { exact: true }).fill('portaria1234');
  await page.getByLabel('Confirmar nova senha').fill('portaria1234');
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(page.getByRole('alert')).toContainText('muito comum');

  const nova = `Senha-Pessoal-${Date.now().toString(36)}`;
  await page.getByLabel('Nova senha', { exact: true }).fill(nova);
  await page.getByLabel('Confirmar nova senha').fill(nova);
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByText('Marcos Teixeira', { exact: true }).first()).toBeVisible();
  // A troca derruba a sessão antiga no Auth; a tela já está na sessão nova, que vale no banco e sobrevive ao recarregar.
  expect((await sessaoAtual(page, (await tokenNoNavegador(page))!)).status()).toBe(200);
  await page.reload();
  await expect(page.getByText('Marcos Teixeira', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await preencherLogin(page, login, temporaria);
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.');
  await preencherLogin(page, login, nova);
  await expect(page).toHaveURL(/\/painel$/);
});

test('sessão revogada no servidor (outra aba, desativação): ao recarregar volta ao login e o navegador esquece o token', async ({ page }) => {
  await preencherLogin(page, 'luiza.campos', SENHA_DEMO);
  await expect(page).toHaveURL(/\/historico$/);
  const token = (await tokenNoNavegador(page))!;
  const encerrar = await page.request.post(`${SUPABASE}/rest/v1/rpc/sessao_encerrar`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Profile': 'api', 'Content-Type': 'application/json' }, data: {},
  });
  expect(encerrar.status()).toBe(204);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(await ondeEstaASessao(page)).toEqual([0, 0]);
});
