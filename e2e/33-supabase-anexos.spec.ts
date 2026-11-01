// F4: anexos de ocorrência pelo navegador contra o Supabase LOCAL (Auth + Edge anexos + Storage privado + RPCs srv.anexo_*).
// Porteiro abre ocorrência com PDF anexado no formulário e acrescenta uma foto depois; não vê o botão de baixar (RN-10);
// tipo falsificado (GIF com nome .png) é recusado pelo servidor. Administração baixa o original com o nome gerado. O
// token do navegador não alcança o bucket direto.
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve --env-file <PORTARIA_KEK_V1>. Rodar:
//   npx playwright test e2e/33-supabase-anexos.spec.ts
import { expect, test, type Page } from '@playwright/test';

const SUPABASE = process.env.E2E_SUPABASE_URL!;
const ANON = process.env.E2E_SUPABASE_ANON_KEY!;
const SENHA_DEMO = 'Demo-Portaria-2026';

test.beforeAll(() => {
  expect(SUPABASE, 'E2E_SUPABASE_URL').toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(ANON, 'anon key do stack local (supabase status)').toBeTruthy();
});

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
  return '';
});
const toast = (page: Page, texto: string | RegExp) => page.getByRole('region', { name: 'Notificações' }).getByText(texto);

const marca = Math.random().toString(36).slice(2, 8);
const PDF = Buffer.from(`%PDF-1.7\n% boletim ficticio ${marca}\n%%EOF\n`);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const GIF = Buffer.from('GIF89a\u0001\u0000\u0001\u0000');
let codigo = '';

test('porteiro anexa PDF ao abrir e foto depois; GIF disfarçado é recusado; ele não baixa o conteúdo', async ({ page }) => {
  await entrar(page, 'joao.lima', /\/painel$/);
  await page.goto('/ocorrencias');
  await page.getByRole('button', { name: 'Nova ocorrência' }).click();
  const nova = page.getByRole('dialog', { name: 'Nova ocorrência' });
  await nova.getByRole('radio', { name: 'Dano' }).click();
  await nova.getByRole('radio', { name: 'Área comum' }).click();
  await nova.getByLabel('Descrição').fill(`Portão da garagem amassado ${marca}`);
  await nova.getByLabel('Anexos').setInputFiles({ name: 'Boletim de ocorrência de Fulano.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(nova.getByRole('list', { name: 'Arquivos escolhidos' })).toContainText('Boletim de ocorrência de Fulano.pdf');
  await nova.getByRole('button', { name: 'Registrar ocorrência' }).click();
  const ok = toast(page, /Ocorrência OC-\d{4}-\d{3,} registrada\./);
  await expect(ok).toBeVisible();
  codigo = /(OC-\d{4}-\d{3,})/.exec((await ok.textContent()) ?? '')![1]!;

  await page.getByRole('table', { name: 'Ocorrências registradas' }).getByRole('row', { name: `Abrir ocorrência ${codigo}` }).click();
  const modal = page.getByRole('dialog');
  const lista = modal.getByRole('list', { name: 'Anexos da ocorrência' });
  await expect(lista.getByText(/^anexo-[0-9a-f]{8}\.pdf$/)).toBeVisible();
  await expect(modal).not.toContainText('Fulano'); // o nome original não é guardado
  await expect(modal.getByRole('button', { name: /^Baixar / })).toHaveCount(0);
  await expect(modal).toContainText('O conteúdo dos anexos é aberto pela administração ou pelo síndico.');

  await modal.getByLabel('Adicionar anexo').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: GIF });
  await expect(toast(page, /Tipo de arquivo não permitido/)).toBeVisible();
  await modal.getByLabel('Adicionar anexo').setInputFiles({ name: 'foto do portão.png', mimeType: 'image/png', buffer: PNG });
  await expect(toast(page, `Anexo adicionado à ${codigo}.`)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('list', { name: 'Anexos da ocorrência' }).getByRole('listitem')).toHaveCount(2);
});

test('administração baixa o PDF original com o nome gerado; o token do navegador não abre o bucket', async ({ page }) => {
  expect(codigo, 'depende do teste anterior').toBeTruthy();
  await entrar(page, 'paula.nogueira', /\/painel$/);
  await page.goto('/ocorrencias');
  await page.getByRole('table', { name: 'Ocorrências registradas' }).getByRole('row', { name: `Abrir ocorrência ${codigo}` }).click();
  const lista = page.getByRole('dialog').getByRole('list', { name: 'Anexos da ocorrência' });
  const nomePdf = (await lista.getByText(/^anexo-[0-9a-f]{8}\.pdf$/).textContent())!;
  const [download] = await Promise.all([page.waitForEvent('download'), lista.getByRole('button', { name: `Baixar ${nomePdf}` }).click()]);
  expect(download.suggestedFilename()).toBe(nomePdf);
  const caminho = await download.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(caminho!).equals(PDF)).toBe(true);

  // Com o token da administração (quem PODE baixar pela Edge), o Storage direto não entrega nem lista nada.
  const cab = { apikey: ANON, Authorization: `Bearer ${await tokenNoNavegador(page)}` };
  const lidas = await page.request.post(`${SUPABASE}/rest/v1/rpc/ocorrencias_listar`, { headers: { ...cab, 'Content-Profile': 'api' }, data: { p: { limite: 20 } } });
  const oc = (await lidas.json()).itens.find((o: { codigo: string }) => o.codigo === codigo);
  const docId = oc.documentos.find((d: { nome: string }) => d.nome === nomePdf).id as string;
  const lista2 = await page.request.post(`${SUPABASE}/storage/v1/object/list/anexos`, { headers: cab, data: { prefix: '', limit: 100 } });
  expect(await lista2.json()).toEqual([]);
  for (const rota of [`/storage/v1/object/authenticated/anexos/${docId}.bin`, `/storage/v1/object/public/anexos/${docId}.bin`]) {
    const r = await page.request.get(`${SUPABASE}${rota}`, { headers: cab });
    expect(r.status(), rota).toBeGreaterThanOrEqual(400);
  }
  const assinar = await page.request.post(`${SUPABASE}/storage/v1/object/sign/anexos/${docId}.bin`, { headers: cab, data: { expiresIn: 60 } });
  expect(assinar.status()).toBeGreaterThanOrEqual(400);
});
