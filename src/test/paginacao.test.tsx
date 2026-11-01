// @vitest-environment jsdom
// Componente de páginas (shadcn Pagination) e hook usePaginacao: acessibilidade (nav rotulada, aria-current, botões
// focáveis e acionáveis pelo teclado), página da URL virando deslocamento, volta à página 1 quando o filtro muda (sem
// buscar a página N do filtro novo), correção de página fora do intervalo, página anterior mantida durante a troca e o
// ateSeq da página 1 repassado às seguintes da trilha.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Paginacao, paginasVisiveis } from '../components/Paginacao';
import { lerPagina, totalDePaginas, usePaginacao, type PosicaoBusca } from '../app/paginacao';
import type { Pagina } from '../api';

describe('Paginacao (componente)', () => {
  it('janela de páginas com reticências', () => {
    expect(paginasVisiveis(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginasVisiveis(1, 12)).toEqual([1, 2, null, 12]);
    expect(paginasVisiveis(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(paginasVisiveis(12, 12)).toEqual([1, null, 11, 12]);
  });

  it('nav rotulada, página atual com aria-current, anterior desabilitada na primeira, teclado aciona', () => {
    const onIr = vi.fn();
    render(<Paginacao pagina={1} totalPaginas={12} onIr={onIr} rotulo="pessoas" />);
    expect(screen.getByRole('navigation', { name: 'Paginação de pessoas' })).toBeTruthy();
    const atual = screen.getByRole('button', { name: 'Página 1, atual' });
    expect(atual.getAttribute('aria-current')).toBe('page');
    expect((screen.getByRole('button', { name: 'Ir para a página anterior' }) as HTMLButtonElement).disabled).toBe(true);
    const prox = screen.getByRole('button', { name: 'Ir para a próxima página' });
    prox.focus();
    expect(document.activeElement).toBe(prox);
    fireEvent.click(prox);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 12' }));
    expect(onIr.mock.calls).toEqual([[2], [12]]);
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('type')).toBe('button');
  });

  it('última página: próxima desabilitada; uma página só: nada', () => {
    const { rerender, container } = render(<Paginacao pagina={3} totalPaginas={3} onIr={() => {}} />);
    expect((screen.getByRole('button', { name: 'Ir para a próxima página' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Paginacao pagina={1} totalPaginas={1} onIr={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('lerPagina / totalDePaginas', () => {
  it('só inteiro positivo; total vazio é uma página; teto do deslocamento', () => {
    expect([lerPagina(null), lerPagina('0'), lerPagina('-2'), lerPagina('abc'), lerPagina('05'), lerPagina('7')]).toEqual([1, 1, 1, 1, 1, 7]);
    expect([totalDePaginas(null, 50), totalDePaginas(0, 50), totalDePaginas(50, 50), totalDePaginas(51, 50)]).toEqual([1, 1, 1, 2]);
    expect(totalDePaginas(10_000_000, 50)).toBe(2001);
  });
});

type Item = { id: string };
type Chamada = PosicaoBusca & { filtro: string };

/** Servidor falso: `total` itens por filtro, páginas pelo deslocamento; ateSeq fixo em 41. */
function servidor(total: (f: string) => number, opcoes: { trilha?: boolean; atraso?: () => Promise<void> } = {}) {
  const chamadas: Chamada[] = [];
  const buscar = (filtro: string) => async (pos: PosicaoBusca): Promise<Pagina<Item>> => {
    chamadas.push({ ...pos, filtro });
    await opcoes.atraso?.();
    const n = total(filtro);
    const itens = Array.from({ length: Math.max(0, Math.min(pos.limite, n - pos.deslocamento)) }, (_, i) => ({ id: `${filtro}-${pos.deslocamento + i + 1}` }));
    return { itens, cursor: null, temMais: pos.deslocamento + itens.length < n, total: n, ...(opcoes.trilha ? { ateSeq: 41 } : {}) };
  };
  return { chamadas, buscar };
}

function Lista({ buscar, trilha }: { buscar: (f: string) => (pos: PosicaoBusca) => Promise<Pagina<Item>>; trilha?: boolean }) {
  const [filtro, setFiltro] = useState('a');
  const p = usePaginacao<Item>({ chave: ['teste', filtro], buscar: buscar(filtro), porPagina: 10, trilha });
  const loc = useLocation();
  return (
    <div>
      <output data-testid="url">{loc.search}</output>
      <output data-testid="itens">{p.itens.map((i) => i.id).join(',')}</output>
      <output data-testid="pagina">{p.pagina}/{p.totalPaginas}</output>
      <button type="button" onClick={() => setFiltro('b')}>filtro b</button>
      <Paginacao pagina={p.pagina} totalPaginas={p.totalPaginas} onIr={p.irPara} ocupado={p.trocando} />
    </div>
  );
}

function montar(url: string, buscar: Parameters<typeof Lista>[0]['buscar'], trilha?: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}><Lista buscar={buscar} trilha={trilha} /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const texto = (id: string) => screen.getByTestId(id).textContent;

describe('usePaginacao', () => {
  it('página da URL vira deslocamento; trocar de página grava ?pagina=N', async () => {
    const s = servidor(() => 35);
    montar('/x?pagina=3', s.buscar);
    await waitFor(() => expect(texto('itens')).toBe('a-21,a-22,a-23,a-24,a-25,a-26,a-27,a-28,a-29,a-30'));
    expect(s.chamadas[0]).toMatchObject({ limite: 10, deslocamento: 20 });
    expect(texto('pagina')).toBe('3/4');
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 4' }));
    await waitFor(() => expect(texto('itens')).toBe('a-31,a-32,a-33,a-34,a-35'));
    expect(texto('url')).toBe('?pagina=4');
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 1' }));
    await waitFor(() => expect(texto('url')).toBe(''));
  });

  it('filtro mudou: volta à página 1 sem buscar a página 3 do filtro novo', async () => {
    const s = servidor(() => 35);
    montar('/x?pagina=3', s.buscar);
    await waitFor(() => expect(texto('pagina')).toBe('3/4'));
    fireEvent.click(screen.getByRole('button', { name: 'filtro b' }));
    await waitFor(() => expect(texto('itens')).toMatch(/^b-1,/));
    expect(s.chamadas.filter((c) => c.filtro === 'b').map((c) => c.deslocamento)).toEqual([0]);
    expect(texto('url')).toBe('');
  });

  it('página fora do intervalo vai para a última; valor inválido na URL é limpo', async () => {
    const s = servidor(() => 25);
    const { unmount } = montar('/x?pagina=9', s.buscar);
    await waitFor(() => expect(texto('url')).toBe('?pagina=3'));
    await waitFor(() => expect(texto('itens')).toBe('a-21,a-22,a-23,a-24,a-25'));
    unmount();
    const s2 = servidor(() => 25);
    montar('/x?pagina=abc', s2.buscar);
    await waitFor(() => expect(texto('url')).toBe(''));
    expect(s2.chamadas[0]).toMatchObject({ deslocamento: 0 });
  });

  it('a página anterior continua na tela enquanto a próxima carrega (placeholderData)', async () => {
    let liberar: () => void = () => {};
    let segurar = false;
    const s = servidor(() => 35, { atraso: () => (segurar ? new Promise<void>((r) => { liberar = r; }) : Promise.resolve()) });
    montar('/x', s.buscar);
    await waitFor(() => expect(texto('itens')).toMatch(/^a-1,/));
    segurar = true;
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 2' }));
    await waitFor(() => expect(texto('url')).toBe('?pagina=2'));
    expect(texto('itens')).toMatch(/^a-1,/);
    expect(screen.getByRole('navigation').getAttribute('aria-busy')).toBe('true');
    await act(async () => { liberar(); });
    await waitFor(() => expect(texto('itens')).toMatch(/^a-11,/));
  });

  it('trilha: a página 2 leva o ateSeq da página 1; a página 1 nunca o manda', async () => {
    const s = servidor(() => 35, { trilha: true });
    montar('/x', s.buscar, true);
    await waitFor(() => expect(texto('itens')).toMatch(/^a-1,/));
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 2' }));
    await waitFor(() => expect(texto('itens')).toMatch(/^a-11,/));
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página 1' }));
    await waitFor(() => expect(s.chamadas.length).toBeGreaterThanOrEqual(3));
    expect(s.chamadas[0]!.ateSeq).toBeUndefined();
    expect(s.chamadas[1]).toMatchObject({ deslocamento: 10, ateSeq: 41 });
    expect(s.chamadas.slice(2).every((c) => c.deslocamento !== 0 || c.ateSeq === undefined)).toBe(true);
  });
});
