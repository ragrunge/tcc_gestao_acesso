// Contrato da paginação numerada (0037) no adaptador: cursor OU deslocamento no corpo (nunca os dois), ateSeq só com
// deslocamento, total e ateSeq lidos da resposta (total inválido é recusado), resumos com contagens validadas e a
// exportação verificável sem nenhum parâmetro de página (ela é sempre do conjunto inteiro).
import { createSupabaseApi } from '../api/supabase/createSupabaseApi';
import { posicao } from '../api/supabase/portaria';
import { ApiError } from '../api/types';

type Resp = { data: unknown; error: unknown; status: number };

function mock() {
  const rpc = vi.fn(async (_nome: string, _args?: unknown): Promise<Resp> => ({ data: null, error: null, status: 200 }));
  const cliente = {
    schema: vi.fn(() => ({ rpc })), functions: { invoke: vi.fn() },
    auth: { setSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn(async () => ({ error: null })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = createSupabaseApi(cliente as any, { chaveAnon: 'chave-anon' });
  const responder = (data: unknown) => rpc.mockResolvedValueOnce({ data, error: null, status: 200 });
  return { api, rpc, responder };
}
async function erro(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('esperava ApiError');
}

describe('posição da página no corpo', () => {
  it('deslocamento só sem cursor; ateSeq só com deslocamento; limite padrão 50', () => {
    expect(posicao({ deslocamento: 100, limite: 50 })).toEqual({ limite: 50, deslocamento: 100 });
    expect(posicao({ cursor: 'c', deslocamento: 100, ateSeq: 9 })).toEqual({ limite: 50, cursor: 'c' });
    expect(posicao({ deslocamento: 0, ateSeq: 9 })).toEqual({ limite: 50, deslocamento: 0, ateSeq: 9 });
    expect(posicao({ ateSeq: 9 })).toEqual({ limite: 50 });
    expect(posicao({ cursor: '' })).toEqual({ limite: 50 });
  });

  it('pessoas, vínculos, encomendas, ocorrências e alterações mandam o deslocamento e leem o total', async () => {
    const m = mock();
    for (let i = 0; i < 5; i++) m.responder({ itens: [], temMais: false, cursor: null, total: 120 + i, ...(i === 4 ? { ateSeq: 77 } : {}) });
    const r = [
      await m.api.pessoas.listarPagina({ categoria: 'morador', limite: 50, deslocamento: 50 }),
      await m.api.vinculos.listarPagina({ status: ['legado'], ordem: 'prazo', limite: 50, deslocamento: 100 }),
      await m.api.encomendas.listarPagina({ status: 'entregue', limite: 50, deslocamento: 0 }),
      await m.api.ocorrencias.listarPagina({ status: ['aberta'], limite: 50, deslocamento: 150 }),
      await m.api.auditoria.alteracoesPagina({ acao: 'pessoa.editar', limite: 50, deslocamento: 50, ateSeq: 77 }),
    ];
    expect(m.rpc.mock.calls).toEqual([
      ['pessoas_listar', { p: { limite: 50, deslocamento: 50, categoria: 'morador' } }],
      ['vinculos_listar', { p: { limite: 50, deslocamento: 100, status: ['legado'], ordem: 'prazo' } }],
      ['encomendas_listar', { p: { limite: 50, deslocamento: 0, status: 'entregue' } }],
      ['ocorrencias_listar', { p: { limite: 50, deslocamento: 150, status: ['aberta'] } }],
      ['auditoria_alteracoes', { p: { limite: 50, deslocamento: 50, ateSeq: 77, acao: 'pessoa.editar' } }],
    ]);
    expect(r.map((x) => x.total)).toEqual([120, 121, 122, 123, 124]);
    expect(r[4]!.ateSeq).toBe(77);
  });

  it('resposta do formato antigo (sem total) continua aceita: total null', async () => {
    const m = mock();
    m.responder({ itens: [], temMais: false, cursor: null });
    expect((await m.api.pessoas.listarPagina({ cursor: 'x' })).total).toBeNull();
  });

  it('total negativo ou em texto: resposta inválida', async () => {
    const m = mock();
    m.responder({ itens: [], temMais: false, cursor: null, total: -1 });
    expect((await erro(m.api.pessoas.listarPagina())).code).toBe('RESPOSTA_INVALIDA');
    m.responder({ itens: [], temMais: false, cursor: null, total: '3' });
    expect((await erro(m.api.pessoas.listarPagina())).code).toBe('RESPOSTA_INVALIDA');
  });

  it('trilha de acessos: filtros + deslocamento + ateSeq no corpo; porTipo e ateSeq na volta', async () => {
    const m = mock();
    m.responder({ itens: [], temMais: false, cursor: null, total: 8, ateSeq: 41, porTipo: { entrada: 6, saida: 2, negado: 0, recusado: 0, correcao: 0 } });
    const p = await m.api.eventos.listarPagina({ unidadeId: 'u', pessoa: 'Ana', limite: 50, deslocamento: 50, ateSeq: 41 });
    expect(m.rpc).toHaveBeenCalledWith('eventos_listar', { p: { unidadeId: 'u', pessoa: 'Ana', limite: 50, deslocamento: 50, ateSeq: 41 } });
    expect(p).toMatchObject({ total: 8, ateSeq: 41, porTipo: { entrada: 6, saida: 2, negado: 0, recusado: 0, correcao: 0 } });
  });
});

describe('resumos', () => {
  it('pessoas, vínculos, unidades e ocorrências: RPC sem argumento e contagens conferidas', async () => {
    const m = mock();
    m.responder({ ativas: 573, desativadas: 2, porCategoria: { morador: 543, visitante: 20, prestador: 6, funcionario: 4 } });
    m.responder({ porStatus: { pendente: 1, aprovado: 499, legado: 44, rejeitado: 0, encerrado: 0 }, legadosVencidos: 3,
      validosPorTipo: { proprietario: 300, inquilino: 100, dependente: 143 }, pessoasComVinculoValido: 543 });
    m.responder({ total: 165, ativas: 165, inativas: 0, ocupadas: 160, alugadas: 40, vazias: 5, cadastroCompleto: 150, veiculosAtivos: 175 });
    m.responder({ total: 4, aberta: 2, emAndamento: 1, encerrada: 1 });
    expect((await m.api.pessoas.resumo()).porCategoria.morador).toBe(543);
    expect((await m.api.vinculos.resumo()).legadosVencidos).toBe(3);
    expect((await m.api.unidades.resumo()).alugadas).toBe(40);
    expect(await m.api.ocorrencias.resumo()).toEqual({ total: 4, aberta: 2, emAndamento: 1, encerrada: 1 });
    expect(m.rpc.mock.calls.map((c) => c[0])).toEqual(['pessoas_resumo', 'vinculos_resumo', 'unidades_resumo', 'ocorrencias_resumo']);
  });

  it('contagem ausente, negativa ou fracionária: resposta inválida', async () => {
    const m = mock();
    m.responder({ ativas: 1, desativadas: 0, porCategoria: { morador: 1, visitante: 0, prestador: 0 } });
    expect((await erro(m.api.pessoas.resumo())).code).toBe('RESPOSTA_INVALIDA');
    m.responder({ total: 4, aberta: -1, emAndamento: 1, encerrada: 1 });
    expect((await erro(m.api.ocorrencias.resumo())).code).toBe('RESPOSTA_INVALIDA');
    m.responder({ total: 1.5, ativas: 1, inativas: 0, ocupadas: 1, alugadas: 0, vazias: 0, cadastroCompleto: 0, veiculosAtivos: 0 });
    expect((await erro(m.api.unidades.resumo())).code).toBe('RESPOSTA_INVALIDA');
  });
});

describe('o que percorre o conjunto inteiro não leva página', () => {
  it('a exportação verificável não manda limite, deslocamento, ateSeq nem cursor, mesmo se o filtro da tela os tiver', async () => {
    const m = mock();
    m.responder({ eventos: [], exibicao: {}, geradoPor: 'Abel', isolado: false });
    const daTela = { unidadeId: 'u', tipo: 'entrada' as const, limite: 50, deslocamento: 100, ateSeq: 9, cursor: '7' };
    await m.api.auditoria.exportar(daTela);
    expect(m.rpc).toHaveBeenCalledWith('auditoria_exportar', { p: { unidadeId: 'u', tipo: 'entrada' } });
  });

  it('a lista inteira (listar) segue pelo cursor até o fim, sem deslocamento', async () => {
    const m = mock();
    m.responder({ itens: [{ id: 'a' }], cursor: 'a', temMais: true, total: 2 });
    m.responder({ itens: [{ id: 'b' }], cursor: null, temMais: false, total: 2 });
    expect((await m.api.pessoas.listar()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(m.rpc.mock.calls).toEqual([['pessoas_listar', { p: { limite: 100 } }], ['pessoas_listar', { p: { limite: 100, cursor: 'a' } }]]);
  });
});
