// F3: operação pelo navegador contra o Supabase LOCAL (Auth + Edge + RPCs da operação): encomenda recebida e entregue,
// ocorrência aberta e encerrada (os anexos estão no 33-supabase-anexos.spec.ts), vínculo conferido e aprovado, relatório
// com CSV, integridade da trilha verificada no navegador e as telas da F5 ainda escondidas.
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve. Rodar:
//   npx playwright test e2e/32-supabase-operacao.spec.ts
// Dados do seed (supabase/seed/demo.sql, fictícios): moradora Fernanda Costa (B-21) e os usuários de demonstração.
import { expect, test, type Page } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

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

async function entrar(page: Page, login: string, inicial: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(login);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DEMO);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(inicial);
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

async function escolherUnidade(escopo: Page | ReturnType<Page['getByRole']>, bloco: string, numero: string) {
  await escopo.getByRole('radio', { name: bloco, exact: true }).click();
  await escopo.getByLabel('Ou digite o apartamento', { exact: false }).fill(numero);
  await expect(escopo.getByRole('button', { name: 'Alterar', exact: true })).toBeVisible();
}

test('porteiro recebe a encomenda conferindo a unidade e entrega à moradora; a trilha e o banco refletem', async ({ page }) => {
  await entrar(page, 'joao.lima', /\/painel$/);
  await page.goto('/encomendas');
  await page.getByRole('button', { name: 'Receber encomenda' }).click();
  const modal = page.getByRole('dialog', { name: 'Receber encomenda' });
  await escolherUnidade(modal, 'B', '21');
  await modal.getByLabel('Destinatário', { exact: true }).fill('Fernanda Costa');
  await modal.getByRole('radio', { name: 'Correios' }).click();
  await modal.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Sim, registrar' }).click();
  const registrada = toast(page, /Encomenda K\d+ registrada para B-21\./);
  await expect(registrada).toBeVisible();
  const codigo = /Encomenda (K\d+)/.exec((await registrada.textContent()) ?? '')![1]!;

  await page.getByRole('button', { name: `Entregar encomenda ${codigo}` }).click();
  const entregar = page.getByRole('dialog', { name: `Entregar encomenda ${codigo}` });
  await entregar.getByLabel('Quem está retirando?').fill('Fernanda');
  await entregar.getByRole('button', { name: /Fernanda Costa/ }).click();
  await entregar.getByRole('button', { name: /Confirmar entrega/ }).click();
  await expect(toast(page, `Encomenda ${codigo} entregue a Fernanda Costa.`)).toBeVisible();
  await page.getByRole('tab', { name: /Entregues/ }).click();
  await expect(page.getByText(/Fernanda Costa \((morador|dependente|inquilino)\)/).first()).toBeVisible();

  // No banco (pela RPC, com a sessão do porteiro): retirada gravada; tabela não exposta.
  const r = await rpc(page, 'encomendas_listar', { p: { status: 'entregue', limite: 100 } });
  expect(r.status).toBe(200);
  expect(r.corpo.itens.find((e: { codigo: string }) => e.codigo === codigo)).toMatchObject({ retiradaPorNome: expect.stringMatching(/^Fernanda Costa/) });
  const tabela = await page.request.get(`${SUPABASE}/rest/v1/encomenda`, { headers: { apikey: ANON, Authorization: `Bearer ${await tokenNoNavegador(page)}` } });
  expect(tabela.status()).toBe(404);
});

test('porteiro abre ocorrência na área comum, anda o status até encerrar; encerrada não muda nem recebe anexo', async ({ page }) => {
  await entrar(page, 'joao.lima', /\/painel$/);
  await page.goto('/ocorrencias');
  await page.getByRole('button', { name: 'Nova ocorrência' }).click();
  const nova = page.getByRole('dialog', { name: 'Nova ocorrência' });
  await nova.getByRole('radio', { name: 'Dano' }).click();
  await nova.getByRole('radio', { name: 'Área comum' }).click();
  await expect(nova.getByLabel('Anexos')).toHaveCount(1); // F4: o envio aparece (suporta('anexos'))
  const descricao = `Lâmpada queimada no hall ${Math.random().toString(36).slice(2, 7)}`;
  await nova.getByLabel('Descrição').fill(descricao);
  await nova.getByRole('button', { name: 'Registrar ocorrência' }).click();
  const ok = toast(page, /Ocorrência OC-\d{4}-\d{3,} registrada\./);
  await expect(ok).toBeVisible();
  const codigo = /(OC-\d{4}-\d{3,})/.exec((await ok.textContent()) ?? '')![1]!;

  await page.getByRole('table', { name: 'Ocorrências registradas' }).getByRole('row', { name: `Abrir ocorrência ${codigo}` }).click();
  let modal = page.getByRole('dialog');
  await expect(modal).toContainText(descricao);
  await expect(modal.getByLabel('Adicionar anexo')).toHaveCount(1);
  await modal.getByRole('button', { name: 'Marcar em andamento' }).click();
  await expect(toast(page, `${codigo} agora está “Em andamento”`)).toBeVisible();
  modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Encerrar ocorrência' }).click();
  await expect(toast(page, `${codigo} agora está “Encerrada”`)).toBeVisible();
  modal = page.getByRole('dialog');
  await expect(modal.getByText('Mudanças de status')).toBeVisible();
  await expect(modal.getByRole('button', { name: /Marcar em andamento|Encerrar ocorrência/ })).toHaveCount(0);
  await expect(modal.getByLabel('Adicionar anexo')).toHaveCount(0); // encerrada não recebe anexo
});

test('administração confere o comprovante e aprova o vínculo pedido; a pessoa vira moradora', async ({ page }) => {
  await entrar(page, 'paula.nogueira', /\/vinculos$/);
  const nome = `Moradora E2E ${Math.random().toString(36).slice(2, 7)}`;
  const p = await rpc(page, 'pessoa_criar', { p: { nome, categoria: 'visitante', documento: cpfAleatorio(), telefone: '11900000777' } });
  expect(p.status, JSON.stringify(p.corpo)).toBe(200);
  const unidade = await rpc(page, 'unidade_detalhe', { p_ref: 'C-14' });
  const v = await rpc(page, 'vinculo_criar', { p: { pessoaId: p.corpo.id, unidadeId: unidade.corpo.unidade.id, tipo: 'proprietario' } });
  expect(v.status, JSON.stringify(v.corpo)).toBe(200);

  await page.goto('/vinculos');
  await page.getByRole('list', { name: 'Fila' }).getByRole('button', { name: new RegExp(nome) }).click();
  await expect(page.getByRole('heading', { name: new RegExp(nome) })).toBeVisible();
  const aprovar = page.getByRole('button', { name: 'Aprovar', exact: true });
  await expect(aprovar).toBeDisabled(); // RF-05: sem conferência
  await page.getByLabel('Tipo do documento conferido').selectOption({ label: 'Escritura' });
  await page.getByLabel('Conferi o comprovante apresentado').check();
  await page.getByRole('button', { name: 'Registrar conferência' }).click();
  await expect(toast(page, new RegExp(`Conferência do comprovante de ${nome} registrada`))).toBeVisible();
  await aprovar.click();
  await expect(toast(page, new RegExp(`Vínculo de ${nome} \\(C-14\\) aprovado`))).toBeVisible();

  const ficha = await rpc(page, 'pessoa_ficha', { p_id: p.corpo.id });
  expect(ficha.corpo.pessoa.categoria).toBe('morador');
  expect(ficha.corpo.vinculos[0]).toMatchObject({ status: 'aprovado', decididoPorNome: 'Paula Nogueira' });
});

test('auditora: relatório com CSV, verificação da trilha no navegador e exportação verificável', async ({ page }) => {
  await entrar(page, 'luiza.campos', /\/historico$/);
  await page.getByRole('button', { name: 'Verificar integridade da trilha' }).click();
  await expect(toast(page, /\d+ registros verificados; a cadeia de hashes está consistente\./)).toBeVisible();

  const [arquivo] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar trilha (arquivo verificável)' }).click()]);
  expect(arquivo.suggestedFilename()).toMatch(/^trilha-gestao-acesso-\d{8}-\d{4}\.jsonl$/);
  await expect(toast(page, /eventos com hashes em trilha-gestao-acesso-/)).toBeVisible();

  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { name: 'Acessos por dia' })).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^relatorio-gestao-acesso-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('menu: telas da F3 aparecem; Privacidade (F5) e Usuários continuam escondidas e mostram o aviso', async ({ page }) => {
  await entrar(page, 'roberto.faria', /\/painel$/);
  await expect(page.getByRole('link', { name: 'Encomendas' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ocorrências' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Relatórios' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Privacidade/ })).toHaveCount(0);
  await page.goto('/privacidade');
  await expect(page.getByRole('status').filter({ hasText: 'ainda não está disponível nesta versão' })).toBeVisible();
});
