// F5 (0040, 0041): administrador do sistema pela tela, contra o Supabase LOCAL (Auth + Edge usuarios-admin).
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/36-supabase-admin-sistema.spec.ts
// O síndico do seed (senha de demonstração só local) cria o técnico pela Edge; a troca obrigatória sai pela API, e o
// resto é na tela: entra direto em Usuários, só vê Usuários no menu, não atribui síndico nem admin_sistema.
import { expect, test, type APIRequestContext } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

const edge = (request: APIRequestContext, fn: string, token: string, data: unknown) => request.post(`${SUPABASE}/functions/v1/${fn}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${token}` }, data,
});
const tokenDe = async (request: APIRequestContext, login: string, senha: string) => {
  const r = await edge(request, 'auth-entrar', ANON, { login, senha });
  expect(r.status()).toBe(200);
  return (await r.json()).auth.access_token as string;
};

test('admin_sistema: entra em Usuários, só vê Usuários, gerencia porteiro e não atribui síndico nem admin_sistema', async ({ page, request }) => {
  const tokenSindico = await tokenDe(request, 'roberto.faria', SENHA_DEMO);
  const sufixo = Date.now().toString(36);
  const login = `e2e.tec.${sufixo}`;
  const criado = await edge(request, 'usuarios-admin', tokenSindico, { acao: 'criar', nome: 'Técnico E2E', login, papel: 'admin_sistema' });
  expect(criado.status()).toBe(201);
  const temporaria = (await criado.json()).senhaTemporaria as string;
  const senha = `Senha-Tecnica-${Math.random().toString(36).slice(2, 10)}`;
  const troca = await edge(request, 'auth-trocar-senha', await tokenDe(request, login, temporaria), { senhaAtual: temporaria, novaSenha: senha });
  expect(troca.status()).toBe(200);
  const alvo = `e2e.pt.${sufixo}`;
  expect((await edge(request, 'usuarios-admin', tokenSindico, { acao: 'criar', nome: 'Porteiro do Técnico', login: alvo, papel: 'porteiro' })).status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Usuário').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(page.getByText('Administrador do sistema').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usuários' }).first()).toBeVisible();
  for (const item of ['Painel', 'Registrar entrada', 'Unidades', 'Cadastro de pessoas', 'Histórico de acessos', 'Relatórios', 'Privacidade (LGPD)']) {
    await expect(page.getByRole('link', { name: item })).toHaveCount(0);
  }
  await expect(page.getByLabel('Buscar por nome, documento, unidade ou placa')).toHaveCount(0);
  // Rota de dado pessoal digitada à mão: volta para Usuários.
  await page.goto('/pessoas');
  await expect(page).toHaveURL(/\/usuarios$/);

  // A própria linha: só "Trocar minha senha".
  await page.getByLabel('Buscar por nome ou login').fill(login);
  const minha = page.getByRole('row').filter({ hasText: login });
  await expect(minha.getByRole('link', { name: 'Trocar minha senha' })).toBeVisible();
  await expect(minha.getByRole('button')).toHaveCount(0);

  // Síndico: sem ações.
  await page.getByLabel('Buscar por nome ou login').fill('roberto.faria');
  const sindico = page.getByRole('row').filter({ hasText: 'roberto.faria' });
  await expect(sindico).toContainText('Só o síndico gerencia');
  await expect(sindico.getByRole('button')).toHaveCount(0);

  // Porteiro: edita, e o select de papel não oferece síndico nem administrador do sistema.
  await page.getByLabel('Buscar por nome ou login').fill(alvo);
  await page.getByRole('button', { name: 'Editar Porteiro do Técnico' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Editar Porteiro do Técnico' });
  const opcoes = await dialogo.getByLabel('Papel').locator('option').allTextContents();
  expect(opcoes).not.toContain('Síndico');
  expect(opcoes).not.toContain('Administrador do sistema');
  await dialogo.getByLabel('Nome completo').fill('Porteiro Renomeado');
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText('Dados de Porteiro Renomeado atualizados.')).toBeVisible();

  // Novo usuário: só os papéis não protegidos.
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const novo = page.getByRole('dialog', { name: 'Novo usuário' });
  await expect(novo.getByRole('radio', { name: 'Porteiro' })).toBeVisible();
  await expect(novo.getByRole('radio', { name: 'Síndico' })).toHaveCount(0);
  await expect(novo.getByRole('radio', { name: 'Administrador do sistema' })).toHaveCount(0);
});
