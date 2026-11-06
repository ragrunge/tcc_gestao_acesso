// RF-39 (0043): a ficha da unidade lista as encomendas aguardando retirada.
// Pré-requisitos: stack local no ar (supabase start, banco com o seed e functions serve). Rodar:
//   npx playwright test e2e/37-supabase-unidade-encomendas.spec.ts
import { expect, test, type Page } from '@playwright/test';

const SENHA_DEMO = 'Demo-Portaria-2026';
const toast = (page: Page, texto: string | RegExp) => page.getByRole('region', { name: 'Notificações' }).getByText(texto);

test('encomenda recebida aparece na ficha da unidade com a contagem; entregue, sai da lista', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('joao.lima');
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DEMO);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);

  const destinatario = `Ficha ${Date.now().toString(36)}`;
  await page.goto('/encomendas');
  await page.getByRole('button', { name: 'Receber encomenda' }).click();
  const modal = page.getByRole('dialog', { name: 'Receber encomenda' });
  await modal.getByRole('radio', { name: 'B', exact: true }).click();
  await modal.getByLabel('Ou digite o apartamento', { exact: false }).fill('21');
  await expect(modal.getByRole('button', { name: 'Alterar', exact: true })).toBeVisible();
  await modal.getByLabel('Destinatário', { exact: true }).fill(destinatario);
  await modal.getByRole('radio', { name: 'Correios' }).click();
  await modal.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Sim, registrar' }).click();
  const registrada = toast(page, /Encomenda K\d+ registrada para B-21\./);
  await expect(registrada).toBeVisible();
  const codigo = /Encomenda (K\d+)/.exec((await registrada.textContent()) ?? '')![1]!;

  await page.goto('/unidades/B-21');
  const secao = page.getByRole('region', { name: /Encomendas aguardando retirada/ });
  await expect(secao).toBeVisible();
  await expect(secao.getByText(destinatario)).toBeVisible();
  await expect(secao.getByText(new RegExp(`${codigo} · Correios`))).toBeVisible();
  await expect(secao.getByRole('link', { name: 'Ver todas da unidade' })).toHaveAttribute('href', '/encomendas?un=B-21');
  await secao.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/37-ficha-unidade-encomendas.png', fullPage: true });

  // Entregue: sai da lista da ficha.
  await page.goto('/encomendas');
  await page.getByRole('button', { name: `Entregar encomenda ${codigo}` }).click();
  const entregar = page.getByRole('dialog', { name: `Entregar encomenda ${codigo}` });
  await entregar.getByLabel('Quem está retirando?').fill('Fernanda');
  await entregar.getByRole('button', { name: /Fernanda Costa/ }).click();
  await entregar.getByRole('button', { name: /Confirmar entrega/ }).click();
  await expect(toast(page, `Encomenda ${codigo} entregue a Fernanda Costa.`)).toBeVisible();
  await page.goto('/unidades/B-21');
  await expect(page.getByText(destinatario)).toHaveCount(0);
});
