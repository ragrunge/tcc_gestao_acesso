// Adaptador Supabase da portaria (F2) com o supabase-js mockado: nome e corpo de cada RPC, o "negado" (sucesso no banco)
// virando o 422 PESSOA_EM_RESTRICAO que a tela de entrada espera, o retry de 40001/40P01, a paginação, as conversões de
// formato (placa, datas de calendário) e o `suporta` das rotas ainda não migradas.
import { createSupabaseApi } from '../api/supabase/createSupabaseApi';
import { ApiError } from '../api/types';

type Resp = { data: unknown; error: unknown; status: number };

function mock() {
  const rpc = vi.fn(async (_nome: string, _args?: unknown): Promise<Resp> => ({ data: null, error: null, status: 200 }));
  const schema = vi.fn(() => ({ rpc }));
  const cliente = {
    schema, functions: { invoke: vi.fn() },
    auth: { setSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn(async () => ({ error: null })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = createSupabaseApi(cliente as any, { chaveAnon: 'chave-anon' });
  const responder = (data: unknown) => rpc.mockResolvedValueOnce({ data, error: null, status: 200 });
  return { api, rpc, schema, responder };
}

async function erro(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('esperava ApiError');
}

const EVENTO = { id: 'e-1', seq: 12, codigo: 'EV-000012', ocorridoEm: 1, tipo: 'entrada' };

describe('eventos.criar', () => {
  it('chama api.evento_entrada com o corpo sem chaves vazias e devolve o evento', async () => {
    const m = mock();
    m.responder({ resultado: 'entrada', evento: EVENTO });
    const v = await m.api.eventos.criar({ pessoaId: 'p-1', unidadeDestinoId: 'u-1', autorizadoPorTipo: 'interfone', autorizadoPorPessoaId: 'm-1',
      veiculo: { placa: 'abc-1d23', modelo: ' ', cor: 'Prata' } });
    expect(m.schema).toHaveBeenCalledWith('api');
    expect(m.rpc).toHaveBeenCalledWith('evento_entrada', { p: { pessoaId: 'p-1', unidadeDestinoId: 'u-1', autorizadoPorTipo: 'interfone',
      autorizadoPorPessoaId: 'm-1', veiculo: { placa: 'abc-1d23', modelo: undefined, cor: 'Prata' } } });
    expect(v).toEqual(EVENTO);
  });

  it('negado (gravado e com sucesso no banco) vira 422 PESSOA_EM_RESTRICAO com o evento e as restrições', async () => {
    const m = mock();
    const restricoes = [{ id: 'r-1', motivo: 'Pedido da moradora' }];
    m.responder({ resultado: 'negado', evento: { ...EVENTO, tipo: 'negado' }, restricoes, mensagem: 'Entrada não permitida para BLOCO A · AP 11: Pedido da moradora.' });
    const e = await erro(m.api.eventos.criar({ pessoaId: 'p-1', unidadeDestinoId: 'u-1' }));
    expect([e.status, e.code, e.message]).toEqual([422, 'PESSOA_EM_RESTRICAO', 'Entrada não permitida para BLOCO A · AP 11: Pedido da moradora.']);
    expect(e.detalhes).toEqual({ eventoId: 'e-1', codigo: 'EV-000012', restricoes });
    expect(m.rpc).toHaveBeenCalledTimes(1); // nunca repete: o negado já está gravado
  });

  it('resposta fora do contrato: RESPOSTA_INVALIDA', async () => {
    const m = mock();
    m.responder({ resultado: 'outro', evento: EVENTO });
    expect((await erro(m.api.eventos.criar({ pessoaId: 'p-1', unidadeDestinoId: 'u-1' }))).code).toBe('RESPOSTA_INVALIDA');
  });
});

describe('retry de serialização', () => {
  it('40001 e 40P01 repetem a RPC (até 3 tentativas)', async () => {
    const m = mock();
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'could not serialize' }, status: 500 })
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock' }, status: 500 })
      .mockResolvedValueOnce({ data: EVENTO, error: null, status: 200 });
    expect(await m.api.eventos.registrarSaida('e-0')).toEqual(EVENTO);
    expect(m.rpc).toHaveBeenCalledTimes(3);
  });

  it('na terceira falha desiste e responde o erro (sem a mensagem crua do banco)', async () => {
    const m = mock();
    m.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'could not serialize access' }, status: 500 });
    const e = await erro(m.api.eventos.registrarSaida('e-0'));
    expect(m.rpc).toHaveBeenCalledTimes(3);
    expect(e.status).toBe(500);
    expect(e.message).not.toContain('serialize');
  });

  it('erro de regra (código nosso) não é repetido', async () => {
    const m = mock();
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'SAIDA_JA_REGISTRADA', message: 'A saída desta entrada já foi registrada.' }, status: 409 });
    expect((await erro(m.api.eventos.registrarSaida('e-0'))).code).toBe('SAIDA_JA_REGISTRADA');
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('pessoas e busca', () => {
  it('o termo (pode ser CPF) vai no corpo da RPC, e o telefoneMascarado nulo some', async () => {
    const m = mock();
    m.responder({ pessoas: [{ id: 'p-1', nome: 'Ana', telefoneMascarado: null, documentoMascarado: '529.98*.***-**' }], temMais: false });
    const r = await m.api.pessoas.buscar('529.982.247-25', { limite: 9 });
    expect(m.rpc).toHaveBeenCalledWith('pessoas_buscar', { p: { q: '529.982.247-25', limite: 9, semMoradores: false } });
    expect(r).toEqual([{ id: 'p-1', nome: 'Ana', documentoMascarado: '529.98*.***-**', documentoTipo: 'cpf' }]);
  });

  it('listar percorre as páginas pelo cursor', async () => {
    const m = mock();
    m.responder({ itens: [{ id: 'a' }], cursor: 'a', temMais: true });
    m.responder({ itens: [{ id: 'b' }], cursor: null, temMais: false });
    expect((await m.api.pessoas.listar()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(m.rpc.mock.calls.map((c) => c[1])).toEqual([{ p: { limite: 100 } }, { p: { limite: 100, cursor: 'a' } }]);
  });

  it('funcionario: null quando não é funcionário', async () => {
    const m = mock();
    m.responder(null);
    expect(await m.api.pessoas.funcionario('p-1')).toBeNull();
    expect(m.rpc).toHaveBeenCalledWith('pessoa_funcionario', { p_id: 'p-1' });
  });

  it('busca global mapeia as pessoas e mantém as unidades', async () => {
    const m = mock();
    m.responder({ pessoas: [{ id: 'p', telefoneMascarado: null }], unidades: [{ id: 'u', motivo: 'Unidade' }], temMaisPessoas: false });
    const r = await m.api.busca.global('A-32');
    expect(r.unidades).toEqual([{ id: 'u', motivo: 'Unidade' }]);
    expect(r.pessoas[0]).toEqual({ id: 'p', documentoTipo: 'cpf' });
  });
});

describe('unidades, autorizações e restrições', () => {
  it('detalhe formata a placa do veículo da unidade como a tela exibe', async () => {
    const m = mock();
    m.responder({ unidade: { id: 'u', bloco: 'A', numero: '11', ativo: true }, veiculos: [{ id: 'v', placa: 'ABC1D23', modelo: 'Onix', cor: 'Prata', unidadeId: 'u' }],
      vinculos: [], autorizacoes: [], restricoes: [], eventos: [] });
    const d = await m.api.unidades.detalhe('A-11');
    expect(m.rpc).toHaveBeenCalledWith('unidade_detalhe', { p_ref: 'A-11' });
    expect(d.veiculos[0]!.placa).toBe('ABC-1D23');
  });

  it('autorização prévia: datas de calendário em AAAA-MM-DD (dia BRT)', async () => {
    const m = mock();
    m.responder({ id: 'ap' });
    await m.api.autorizacoes.criar({ unidadeId: 'u', pessoaId: 'p', validaAte: Date.UTC(2026, 10, 30, 3), validaDe: Date.UTC(2026, 9, 31, 3),
      diasSemana: null, horaInicio: null, horaFim: null, solicitadaPorPessoaId: 'm' });
    expect(m.rpc).toHaveBeenCalledWith('autorizacao_criar', { p: { unidadeId: 'u', pessoaId: 'p', validaDe: '2026-10-31', validaAte: '2026-11-30',
      diasSemana: null, horaInicio: null, horaFim: null, solicitadaPorPessoaId: 'm' } });
  });

  it('restrição: verificar sem unidade manda null; revogar não devolve nada', async () => {
    const m = mock();
    m.responder({ restrita: false, alertas: [] });
    await m.api.restricoes.verificar('p', null);
    expect(m.rpc).toHaveBeenCalledWith('restricao_verificar', { p_pessoa: 'p', p_unidade: null });
    m.responder(null);
    await expect(m.api.restricoes.revogar('r')).resolves.toBeUndefined();
  });
});

describe('migração por fases', () => {
  it('suporta: portaria (F2) e operação (F3) sim; usuários, LGPD e o envio de anexo (F4) não', () => {
    const m = mock();
    for (const r of ['painel', 'entrada', 'saida', 'pessoas', 'unidades', 'cadastro', 'historico', 'vinculos',
      'encomendas', 'ocorrencias', 'funcionarios', 'importar', 'relatorios']) expect(m.api.suporta!(r)).toBe(true);
    for (const r of ['privacidade', 'usuarios', 'anexos']) expect(m.api.suporta!(r)).toBe(false);
  });

  it('anexos (F4), selo (F5) e LGPD (F5) respondem NAO_MIGRADO sem chamar o banco', async () => {
    const m = mock();
    for (const p of [m.api.ocorrencias.anexar('o', new File(['x'], 'a.pdf')), m.api.ocorrencias.baixarAnexo('o', 'd'), m.api.auditoria.selos(),
      m.api.auditoria.selar(), m.api.lgpd.exportarPessoa('p')]) {
      expect((await erro(p)).code).toBe('NAO_MIGRADO');
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
