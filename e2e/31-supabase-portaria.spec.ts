// F2: entrada, saída e negado pelo navegador contra o Supabase LOCAL (Auth + Edge + RPCs da portaria).
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/31-supabase-portaria.spec.ts
// Dados do seed (supabase/seed.sql, fictícios): moradora Fernanda Costa (B-21), Carla Mendes (A-11) e o visitante
// Sérgio Prado com restrição na A-11. Cada execução cria o próprio visitante (CPF de teste válido) pela RPC
// api.pessoa_criar com a sessão do porteiro, para não depender de quem ficou "dentro" numa execução anterior.
import { expect, test, type Page } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

/** CPF com dígito verificador válido a partir de 9 dígitos aleatórios (só teste local). */
function cpfAleatorio(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (d.every((x) => x === d[0])) d[0] = (d[0]! + 1) % 10;
  for (const n of [9, 10]) {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join('');
}

async function entrar(page: Page, login: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DEMO);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
}

const tokenNoNavegador = (page: Page) => page.evaluate(() => {
  for (const s of [sessionStorage, localStorage]) {
    const k = Object.keys(s).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
    if (k) return (JSON.parse(s.getItem(k)!) as { access_token: string }).access_token;
  }
  return null;
});

async function rpc(page: Page, nome: string, corpo: unknown) {
  const token = await tokenNoNavegador(page);
  const r = await page.request.post(`${SUPABASE}/rest/v1/rpc/${nome}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Profile': 'api', 'Content-Type': 'application/json' }, data: corpo,
  });
  return { status: r.status(), corpo: await r.json().catch(() => null) };
}

const toast = (page: Page, texto: string | RegExp) => page.getByRole('region', { name: 'Notificações' }).getByText(texto);

async function escolherPessoa(page: Page, nome: string) {
  await page.getByRole('combobox', { name: /Buscar por nome/ }).fill(nome);
  await page.getByRole('option', { name: new RegExp(nome) }).first().click();
  await expect(page.getByRole('button', { name: 'Trocar', exact: true })).toBeVisible();
}
async function escolherUnidade(page: Page, bloco: string, numero: string) {
  await page.getByRole('radio', { name: bloco, exact: true }).click();
  await page.getByLabel('Ou digite o apartamento', { exact: false }).fill(numero);
  await expect(page.getByRole('button', { name: 'Alterar', exact: true })).toBeVisible();
}

test('porteiro registra entrada por interfone e depois a saída; presentes e histórico refletem o banco', async ({ page }) => {
  await entrar(page, 'joao.lima');
  const nome = `Visitante E2E ${Math.random().toString(36).slice(2, 7)}`;
  const criada = await rpc(page, 'pessoa_criar', { p: { nome, categoria: 'visitante', documento: cpfAleatorio(), telefone: '11900000999' } });
  expect(criada.status, JSON.stringify(criada.corpo)).toBe(200);
  expect(criada.corpo).not.toHaveProperty('telefone');

  // Entrada (F2 no menu leva à tela)
  await page.goto('/entrada');
  await escolherPessoa(page, nome);
  await escolherUnidade(page, 'B', '21');
  await page.getByRole('group', { name: 'Meio de autorização' }).getByText('Interfone', { exact: true }).click();
  await page.getByRole('radiogroup', { name: /Morador que autorizou/ }).getByText('Fernanda Costa', { exact: true }).click();
  await expect(page.getByText('Falta:')).toHaveCount(0);
  await page.getByRole('button', { name: /^Confirmar entrada/ }).click();
  await expect(toast(page, /Entrada registrada às \d\d:\d\d por Porteiro João Lima — autorizada por Fernanda Costa via interfone \(EV-\d+\)/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/painel$/);

  // Presentes agora (RPC eventos_presentes)
  await page.goto('/pessoas');
  const presentes = page.getByRole('table', { name: 'Pessoas atualmente no condomínio' });
  await expect(presentes.getByRole('row').filter({ hasText: nome })).toHaveCount(1);
  await expect(presentes.getByRole('row').filter({ hasText: nome })).toContainText('B-21');

  // Saída pela tela de saída (F8), escolhendo por teclado
  await page.keyboard.press('F8');
  await expect(page).toHaveURL(/\/saida$/);
  const busca = page.getByRole('combobox', { name: 'Buscar quem está dentro' });
  await busca.fill(nome.toLowerCase());
  await expect(page.getByRole('option', { name: new RegExp(nome) })).toHaveCount(1);
  await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog', { name: `Registrar saída · ${nome}` });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Fernanda Costa');
  const codigoEntrada = /\((EV-\d+)\)/.exec((await modal.getByText(/Entrou às/).textContent()) ?? '')?.[1];
  expect(codigoEntrada).toBeTruthy();
  await modal.getByRole('button', { name: 'Confirmar saída' }).click();
  await expect(toast(page, new RegExp(`Saída de ${nome} registrada às \\d\\d:\\d\\d \\(EV-\\d+, ligada à entrada ${codigoEntrada}\\)`))).toBeVisible();

  await page.goto('/pessoas');
  await expect(page.getByRole('table', { name: 'Pessoas atualmente no condomínio' }).getByRole('row').filter({ hasText: nome })).toHaveCount(0);

  // Histórico (RPC eventos_listar com o nome no CORPO): entrada e saída, a saída ligada à entrada
  await page.goto('/historico');
  await page.getByLabel('Pessoa', { exact: true }).fill(nome);
  const linhas = page.getByRole('table', { name: 'Eventos de acesso' }).getByRole('row', { name: /^Abrir evento/ }).filter({ hasText: nome });
  await expect(linhas).toHaveCount(2);
  await linhas.filter({ hasText: 'Saída registrada' }).click();
  await expect(page.getByText(`Vinculado à entrada ${codigoEntrada}`)).toBeVisible();

  // No banco: a entrada e a saída estão na cadeia, com seq consecutivo ao que já havia (sem o porteiro alcançar a tabela)
  const eventos = await rpc(page, 'eventos_listar', { p: { pessoa: nome } });
  expect(eventos.status).toBe(200);
  expect(eventos.corpo.itens.map((e: { tipo: string }) => e.tipo)).toEqual(['saida', 'entrada']);
  expect(eventos.corpo.itens[0].refereEventoId).toBe(eventos.corpo.itens[1].id);
  const tabela = await page.request.get(`${SUPABASE}/rest/v1/evento_acesso`, { headers: { apikey: ANON, Authorization: `Bearer ${await tokenNoNavegador(page)}` } });
  expect(tabela.status()).toBe(404); // tabela não exposta: só as RPCs
});

test('restrição na unidade: o modal avisa e a tentativa negada fica gravada na trilha', async ({ page }) => {
  await entrar(page, 'joao.lima');
  const antes = await rpc(page, 'eventos_listar', { p: { pessoa: 'Sérgio Prado', tipo: 'negado', limite: 100 } });
  await page.goto('/entrada');
  await escolherPessoa(page, 'Sérgio Prado');
  await escolherUnidade(page, 'A', '11');
  const modal = page.getByRole('alertdialog', { name: 'Entrada não permitida para A-11' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Pedido da moradora: não autorizar visitas');
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(toast(page, /Sérgio Prado não entrou na A-11\. Tentativa gravada na trilha \(EV-\d+\)\./).first()).toBeVisible();
  const depois = await rpc(page, 'eventos_listar', { p: { pessoa: 'Sérgio Prado', tipo: 'negado', limite: 100 } });
  expect(depois.corpo.itens.length).toBe(antes.corpo.itens.length + 1);
});

test('telas ainda não migradas (F5: Privacidade; Usuários) somem do menu e mostram o aviso em vez de quebrar', async ({ page }) => {
  await entrar(page, 'roberto.faria');
  const menu = page.getByRole('navigation', { name: 'Portaria' });
  await expect(menu.getByRole('link', { name: 'Registrar entrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
  await page.goto('/usuarios');
  await expect(page.getByRole('status').filter({ hasText: 'ainda não está disponível nesta versão' })).toBeVisible();
});
