// F5: tela de Usuários pelo navegador contra o Supabase LOCAL (Auth + Edge usuarios-admin + api.usuarios_listar/resumo).
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/34-supabase-usuarios.spec.ts
// Usuários do seed (supabase/seed/demo.sql), senha de demonstração só local. Cada execução cria o próprio porteiro
// (login com sufixo aleatório), para não depender de execuções anteriores.
import { expect, test, type Page } from '@playwright/test';

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

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

const tokenNoNavegador = (page: Page) => page.evaluate(() => {
  for (const s of [sessionStorage, localStorage]) {
    const k = Object.keys(s).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
    if (k) return (JSON.parse(s.getItem(k)!) as { access_token: string }).access_token;
  }
  return null;
});

test('síndico cria um porteiro pela tela; ele entra com a temporária, troca a senha e cai no painel', async ({ page }) => {
  await entrar(page, 'roberto.faria', SENHA_DEMO, /\/painel$/);
  await page.getByRole('navigation', { name: 'Sistema' }).getByRole('link', { name: 'Usuários' }).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  const totais = page.getByLabel('Usuários por situação e papel');
  await expect(totais).toContainText('Porteiro (ativos)');

  const login = `e2e.po.${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const novo = page.getByRole('dialog', { name: 'Novo usuário' });
  await novo.getByLabel('Nome completo').fill('Marcelo Prates');
  await novo.getByLabel('Login').fill(login);
  await novo.getByRole('radio', { name: 'Porteiro' }).click();
  await page.getByRole('button', { name: 'Criar usuário' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Usuário Marcelo Prates criado' });
  await expect(dialogo).toBeVisible();
  const temporaria = (await dialogo.locator('output').textContent())!.trim();
  expect(temporaria).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  await dialogo.getByRole('button', { name: 'Já copiei, fechar' }).click();
  await expect(page.getByText(temporaria)).toHaveCount(0);
  // Nada da senha ficou no navegador.
  const guardado = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(guardado).not.toContain(temporaria);

  await page.getByLabel('Buscar por nome ou login').fill(login);
  const linha = page.getByRole('row').filter({ hasText: login });
  await expect(linha).toContainText('Senha temporária');
  await expect(linha).not.toContainText('portaria.invalid');

  await sair(page);
  await entrar(page, login, temporaria, /\/trocar-senha$/);
  await expect(page.getByText('Troca obrigatória')).toBeVisible();
  const nova = `Senha-Pessoal-${Date.now().toString(36)}`;
  await page.getByLabel('Senha atual').fill(temporaria);
  await page.getByLabel('Nova senha', { exact: true }).fill(nova);
  await page.getByLabel('Confirmar nova senha').fill(nova);
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByText('Marcelo Prates', { exact: true }).first()).toBeVisible();
  // Porteiro não gerencia usuários: sem item no menu e a rota recusa.
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
  await sair(page);
  await entrar(page, login, temporaria, /\/login$/);
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.');
});

test('administração: sem a opção Síndico na tela, linha do síndico sem ação, e o servidor recusa criar síndico', async ({ page }) => {
  await entrar(page, 'paula.nogueira', SENHA_DEMO, /\/vinculos$/);
  await page.goto('/usuarios');
  const sindico = page.getByRole('row').filter({ hasText: 'roberto.faria' });
  await expect(sindico).toContainText('Só o síndico gerencia');
  await expect(sindico.getByRole('button')).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const novo = page.getByRole('dialog', { name: 'Novo usuário' });
  await expect(novo.getByRole('radio', { name: 'Porteiro' })).toBeVisible();
  await expect(novo.getByRole('radio', { name: 'Síndico' })).toHaveCount(0);
  await novo.getByRole('button', { name: 'Cancelar' }).click();

  // A tela só esconde: quem decide é o banco. Pedido forjado com o token da administração é recusado.
  const token = await tokenNoNavegador(page);
  const r = await page.request.post(`${SUPABASE}/functions/v1/usuarios-admin`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    data: { acao: 'criar', nome: 'Sindico Forjado', login: `e2e.si.${Date.now().toString(36)}`, papel: 'sindico' },
  });
  expect(r.status()).toBe(403);
  const corpo = await r.json();
  expect(corpo.code).toBe('SEM_PERMISSAO');
  expect(JSON.stringify(corpo)).not.toContain('senhaTemporaria');
});
