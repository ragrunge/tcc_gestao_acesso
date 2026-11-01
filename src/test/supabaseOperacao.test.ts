// Adaptador Supabase da F3 com o supabase-js mockado: nome e corpo de cada RPC (datas de calendário em AAAA-MM-DD, texto
// livre no corpo), o CSV do relatório montado com csvRelatorio do domain, a verificação da cadeia NO NAVEGADOR (lotes do
// banco + verificarCadeia: válida, conteúdo adulterado, selo divergente, cabeça à frente), a exportação JSONL e as linhas
// da importação guardadas só na memória entre analisar e confirmar.
import { calcularHashExportado, hashGenese, type EventoExportado } from '@domain/hashChain';
import { lerExportacaoJsonl } from '@domain/exportacao';
import { createSupabaseApi } from '../api/supabase/createSupabaseApi';
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
const DIA_BRT = (a: number, m: number, d: number) => Date.UTC(a, m - 1, d, 3);

describe('vínculos (escrita)', () => {
  it('criar manda as vigências como dia BRT e devolve a view', async () => {
    const m = mock();
    m.responder({ id: 'v', status: 'pendente' });
    await m.api.vinculos.criar({ pessoaId: 'p', unidadeId: 'u', tipo: 'inquilino', vigenciaInicio: DIA_BRT(2026, 11, 1), vigenciaFim: null, solicitadoPor: 'x' });
    expect(m.rpc).toHaveBeenCalledWith('vinculo_criar', { p: { pessoaId: 'p', unidadeId: 'u', tipo: 'inquilino', vigenciaInicio: '2026-11-01', vigenciaFim: null } });
  });

  it('decidir: aprovar e rejeitar são RPCs distintas; rejeitar leva a justificativa', async () => {
    const m = mock();
    m.responder({ id: 'v', status: 'aprovado' });
    m.responder({ id: 'v', status: 'rejeitado' });
    await m.api.vinculos.decidir({ id: 'v', decisao: 'aprovar' });
    await m.api.vinculos.decidir({ id: 'v', decisao: 'rejeitar' });
    expect(m.rpc.mock.calls).toEqual([['vinculo_aprovar', { p_id: 'v' }], ['vinculo_rejeitar', { p_id: 'v', p: { justificativa: '' } }]]);
  });

  it('conferência, regularização (ausente != null) e encerramento', async () => {
    const m = mock();
    for (let i = 0; i < 4; i++) m.responder({ id: 'v', status: 'x' });
    await m.api.vinculos.registrarConferencia('v', { tipo: 'outro', descricao: 'Declaração', data: DIA_BRT(2026, 10, 30) });
    await m.api.vinculos.regularizar('v');
    await m.api.vinculos.regularizar('v', { vigenciaFim: null });
    await m.api.vinculos.encerrar('v', { motivo: 'Mudou-se do condomínio' });
    expect(m.rpc.mock.calls).toEqual([
      ['vinculo_conferir', { p_id: 'v', p: { tipo: 'outro', descricao: 'Declaração', data: '2026-10-30' } }],
      ['vinculo_regularizar', { p_id: 'v', p: {} }],
      ['vinculo_regularizar', { p_id: 'v', p: { vigenciaFim: null } }],
      ['vinculo_encerrar', { p_id: 'v', p: { motivo: 'Mudou-se do condomínio' } }],
    ]);
  });

  it('resposta fora do contrato: RESPOSTA_INVALIDA', async () => {
    const m = mock();
    m.responder(null);
    expect((await erro(m.api.vinculos.decidir({ id: 'v', decisao: 'aprovar' }))).code).toBe('RESPOSTA_INVALIDA');
  });
});

describe('cadastros: veículo, pessoa e unidade', () => {
  it('veículo volta com a placa formatada; editar manda só o que veio', async () => {
    const m = mock();
    m.responder({ id: 've', unidadeId: 'u', placa: 'ABC1D23', modelo: 'Onix', cor: 'Prata', ativo: true });
    m.responder({ id: 've', unidadeId: 'u', placa: 'ABC1D23', modelo: 'Onix', cor: 'Prata', ativo: false });
    expect((await m.api.veiculos.criar({ unidadeId: 'u', placa: 'abc-1d23', modelo: 'Onix', cor: 'Prata' })).placa).toBe('ABC-1D23');
    await m.api.veiculos.editar({ id: 've', ativo: false });
    expect(m.rpc.mock.calls[1]).toEqual(['veiculo_editar', { p_id: 've', p: { ativo: false } }]);
  });

  it('pessoa.editar: o telefone completo nunca volta; unidades: criar/editar/desativar/reativar', async () => {
    const m = mock();
    m.responder({ id: 'p', nome: 'X', telefoneMascarado: '(**) *****-1234' });
    const p = await m.api.pessoas.editar({ id: 'p', telefone: '11912341234', empresa: null });
    expect(m.rpc).toHaveBeenLastCalledWith('pessoa_editar', { p_id: 'p', p: { telefone: '11912341234', empresa: null } });
    expect(p).toEqual({ id: 'p', nome: 'X', documentoTipo: 'cpf', telefoneMascarado: '(**) *****-1234' });
    const u = { id: 'u', bloco: 'A', numero: '07', ativo: true };
    for (let i = 0; i < 4; i++) m.responder(u);
    await m.api.unidades.criar({ bloco: 'a', numero: '7' });
    await m.api.unidades.editar({ id: 'u', bloco: 'A', numero: '08' });
    await m.api.unidades.desativar('u');
    await m.api.unidades.reativar('u');
    expect(m.rpc.mock.calls.slice(1)).toEqual([['unidade_criar', { p: { bloco: 'a', numero: '7' } }], ['unidade_editar', { p_id: 'u', p: { bloco: 'A', numero: '08' } }],
      ['unidade_desativar', { p_id: 'u' }], ['unidade_reativar', { p_id: 'u' }]]);
  });
});

describe('encomendas, ocorrências e funcionários', () => {
  const ENC = { id: 'e', recebidaEm: 1, autorizacoes: [] };
  const OC = { id: 'o', abertaEm: 1, historicoStatus: [], eventoIds: [] };

  it('encomendas: página com filtros no corpo, resumo com e sem dias, retirada e autorização', async () => {
    const m = mock();
    m.responder({ itens: [ENC], temMais: false, cursor: null });
    m.responder({ aguardando: 1, atrasadas: 0, entregues: 2, diasAtraso: 7 });
    m.responder({ aguardando: 1, atrasadas: 1, entregues: 2, diasAtraso: 3 });
    m.responder(ENC);
    m.responder({ id: 'a' });
    await m.api.encomendas.listarPagina({ status: 'aguardando', atrasadasDias: 7 });
    await m.api.encomendas.resumo();
    await m.api.encomendas.resumo(3);
    await m.api.encomendas.entregar({ id: 'e', pessoaId: 'p' });
    await m.api.encomendas.autorizarRetirada({ encomendaId: 'e', pessoaId: 'p', solicitadaPorPessoaId: 'm' });
    expect(m.rpc.mock.calls).toEqual([
      ['encomendas_listar', { p: { limite: 50, status: 'aguardando', atrasadasDias: 7 } }], ['encomendas_resumo', {}], ['encomendas_resumo', { p_dias: 3 }],
      ['encomenda_entregar', { p_id: 'e', p_pessoa: 'p' }], ['encomenda_autorizar_retirada', { p_id: 'e', p: { pessoaId: 'p', solicitadaPorPessoaId: 'm' } }],
    ]);
  });

  it('ocorrências: criar sem anexos, status e vínculo de eventos; anexos ausentes viram listas vazias', async () => {
    const m = mock();
    for (let i = 0; i < 3; i++) m.responder(OC);
    const o = await m.api.ocorrencias.criar({ tipo: 'dano', descricao: 'x', unidadeId: null, envolvidos: '' });
    await m.api.ocorrencias.alterarStatus('o', 'em_andamento');
    await m.api.ocorrencias.vincularEventos('o', ['e1']);
    expect(o).toMatchObject({ anexos: [], documentos: [] });
    expect(m.rpc.mock.calls).toEqual([
      ['ocorrencia_criar', { p: { tipo: 'dano', descricao: 'x', unidadeId: null, envolvidos: '', eventoIds: [] } }],
      ['ocorrencia_alterar_status', { p_id: 'o', p_status: 'em_andamento' }], ['ocorrencia_vincular_eventos', { p_id: 'o', p: { eventoIds: ['e1'] } }],
    ]);
  });

  it('funcionários: lista percorre as páginas pelo cursor; a pessoa vem sem telefone completo', async () => {
    const m = mock();
    const f = (id: string) => ({ pessoaId: id, funcao: 'Zelador', escala: { diasSemana: [1], horaInicio: '08:00', horaFim: '17:00' }, ativo: true,
      pessoa: { id, nome: id, telefoneMascarado: null }, emEscalaAgora: false });
    m.responder({ itens: [f('a')], temMais: true, cursor: 'a' });
    m.responder({ itens: [f('b')], temMais: false, cursor: null });
    const l = await m.api.funcionarios.listar();
    expect(l.map((x) => x.pessoaId)).toEqual(['a', 'b']);
    expect(l[0]!.pessoa).toEqual({ id: 'a', nome: 'a', documentoTipo: 'cpf' });
    expect(m.rpc.mock.calls[1]).toEqual(['funcionarios_listar', { p: { limite: 100, cursor: 'a' } }]);
  });
});

describe('relatórios', () => {
  const RESUMO = {
    periodo: { de: DIA_BRT(2026, 10, 1), ate: DIA_BRT(2026, 10, 2) - 1 + 86_400_000 }, acessosPorDia: [{ dia: DIA_BRT(2026, 10, 1), entradas: 2 }],
    acessosPorMeio: [{ meio: 'interfone', total: 2 }], excecoesPorPorteiro: [], encomendasPorIdade: [{ faixa: '0 a 2 dias', total: 1 }],
    cadastroCompleto: { unidadesCompletas: 1, total: 2 }, totais: { entradas: 2, negados: 0, recusados: 0, retroativos: 0, excecoes: 0 },
  };

  it('resumo: filtros em dia BRT; o código da unidade só serve ao CSV e não vaza para a tela', async () => {
    const m = mock();
    m.responder({ ...RESUMO, filtroUnidadeCodigo: 'A-11' });
    const r = await m.api.relatorios.resumo({ de: DIA_BRT(2026, 10, 1), ate: DIA_BRT(2026, 10, 2), unidadeId: 'u' });
    expect(m.rpc).toHaveBeenCalledWith('relatorio_resumo', { p: { de: '2026-10-01', ate: '2026-10-02', unidadeId: 'u' } });
    expect(r).toEqual(RESUMO);
  });

  it('CSV montado no front pelo csvRelatorio (BOM, ";", filtro com o código da unidade)', async () => {
    const m = mock();
    m.responder({ ...RESUMO, filtroUnidadeCodigo: 'A-11' });
    const p = await m.api.relatorios.exportarCsv({ unidadeId: 'u', meio: 'interfone' });
    expect(p.nomeArquivo).toMatch(/^relatorio-gestao-acesso-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(p.conteudo.startsWith('﻿Seção;Item;Total\r\n')).toBe(true);
    expect(p.conteudo).toContain('Filtro;Unidade;A-11');
    expect(p.quantidade).toBe(2);
  });
});

/** Cadeia de N eventos válida (hash calculado pelo domain, como o trigger faria). */
async function cadeia(n: number): Promise<EventoExportado[]> {
  const evs: EventoExportado[] = [];
  let anterior = await hashGenese();
  for (let seq = 1; seq <= n; seq++) {
    const e: EventoExportado = {
      v: 1, seq, id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, tipo: 'entrada', categoria_pessoa: 'visitante',
      pessoa_id: 'p', unidade_destino_id: 'u', area_comum_id: null, ponto_acesso_id: 'pa', autorizado_por_tipo: 'interfone',
      autorizado_por_pessoa_id: 'm', autorizacao_previa_id: null, justificativa: null, restricao_id: null, operador_id: 'o', operador_papel: 'porteiro',
      ocorrido_em: '2026-10-31T13:00:00.000Z', registrado_em: '2026-10-31T13:00:00.000Z', retroativo: false, formulario_contingencia: null,
      refere_evento_id: null, corrige_evento_id: null, correcao_valores: null, empresa: null, servico: null, observacao: null,
      hash_anterior: anterior, hash: '',
    };
    e.hash = await calcularHashExportado(e);
    anterior = e.hash;
    evs.push(e);
  }
  return evs;
}

describe('auditoria: verificação da cadeia no navegador', () => {
  it('cadeia íntegra: válida, com a cabeça e o selo do trecho conferidos', async () => {
    const m = mock();
    const evs = await cadeia(3);
    m.responder({ cabeca: { ultimoSeq: 3, ultimoHash: evs[2]!.hash }, ancora: null, ateSeq: 3, eventos: evs, selos: [{ ultimoSeq: 2, ultimoHash: evs[1]!.hash }] });
    expect(await m.api.auditoria.verificarIntegridade()).toEqual({ valido: true, verificados: 3, ultimoSeq: 3, ultimoHash: evs[2]!.hash });
    expect(m.rpc).toHaveBeenCalledWith('auditoria_cadeia', { p: { limite: 2000 } });
  });

  it('conteúdo adulterado no banco: hash_divergente no evento certo', async () => {
    const m = mock();
    const evs = await cadeia(3);
    evs[1] = { ...evs[1]!, observacao: 'alterado depois' };
    m.responder({ cabeca: { ultimoSeq: 3, ultimoHash: evs[2]!.hash }, ancora: null, ateSeq: 3, eventos: evs, selos: [] });
    expect(await m.api.auditoria.verificarIntegridade()).toMatchObject({ valido: false, primeiroSeqInvalido: 2, motivo: 'hash_divergente' });
  });

  it('cadeia recalculada inteira não bate com o selo; evento removido do fim não bate com a cabeça', async () => {
    const m = mock();
    const evs = await cadeia(3);
    m.responder({ cabeca: { ultimoSeq: 3, ultimoHash: evs[2]!.hash }, ancora: null, ateSeq: 3, eventos: evs, selos: [{ ultimoSeq: 2, ultimoHash: 'f'.repeat(64) }] });
    expect(await m.api.auditoria.verificarIntegridade()).toMatchObject({ valido: false, primeiroSeqInvalido: 2, motivo: 'selo_divergente' });
    m.responder({ cabeca: { ultimoSeq: 3, ultimoHash: evs[2]!.hash }, ancora: null, ateSeq: 3, eventos: evs.slice(0, 2), selos: [] });
    expect(await m.api.auditoria.verificarIntegridade()).toMatchObject({ valido: false, primeiroSeqInvalido: 3, motivo: 'lacuna_de_seq' });
  });

  it('lotes cheios pedem o próximo a partir do último verificado, até a cabeça lida no início', async () => {
    const m = mock();
    const evs = await cadeia(2001);
    m.responder({ cabeca: { ultimoSeq: 2001, ultimoHash: evs[2000]!.hash }, ancora: null, ateSeq: 2001, eventos: evs.slice(0, 2000), selos: [] });
    m.responder({ cabeca: null, ancora: null, ateSeq: 2001, eventos: evs.slice(2000), selos: [] });
    expect(await m.api.auditoria.verificarIntegridade()).toMatchObject({ valido: true, verificados: 2001 });
    expect(m.rpc.mock.calls[1]).toEqual(['auditoria_cadeia', { p: { limite: 2000, aposSeq: 2000, ateSeq: 2001 } }]);
  });
});

describe('auditoria: exportação e trilha', () => {
  it('JSONL verificável montado no front; nome do filtro só como marcação no manifesto', async () => {
    const m = mock();
    const evs = await cadeia(2);
    m.responder({ eventos: evs.map((e) => ({ ...e })), exibicao: { [evs[0]!.id!]: { pessoa: 'Vânia', unidade: 'A-11', areaComum: null, operador: 'Paulo' } },
      geradoPor: 'Abel Auditor', isolado: false });
    const p = await m.api.auditoria.exportar({ pessoa: 'Vânia', unidadeId: 'u' });
    expect(m.rpc).toHaveBeenCalledWith('auditoria_exportar', { p: { unidadeId: 'u', pessoa: 'Vânia' } });
    const lido = lerExportacaoJsonl(p.conteudo);
    expect(lido.eventos).toEqual(evs);
    expect(lido.manifesto).toMatchObject({ versao: 3, quantidade: 2, consecutivos: true, geradoPor: 'Abel Auditor', filtros: { pessoa: '(nome)', unidadeId: 'u' } });
    expect(p.conteudo).toContain('"pessoa":"Vânia"'); // na exibição do evento (fora do hash), não no manifesto
    expect(JSON.stringify(lido.manifesto)).not.toContain('Vânia');
    expect(p.nomeArquivo).toMatch(/^trilha-gestao-acesso-\d{8}-\d{4}\.jsonl$/);
  });

  it('alterações: filtros e cursor no corpo', async () => {
    const m = mock();
    m.responder({ itens: [], temMais: false, cursor: null });
    await m.api.auditoria.alteracoesPagina({ acao: 'pessoa.editar', de: 1.7, cursor: '9' });
    expect(m.rpc).toHaveBeenCalledWith('auditoria_alteracoes', { p: { limite: 50, de: 1, acao: 'pessoa.editar', cursor: '9' } });
  });
});

describe('importação', () => {
  const LINHAS = [{ linha: 2, bloco: 'A', unidade: '11', nome: 'Iara', documento: '52998224725', telefone: '' }];

  it('as linhas ficam só na memória entre analisar e confirmar, e voltam no confirmar', async () => {
    const m = mock();
    m.responder({ id: 'imp', arquivo: 'x.xlsx', status: 'analisada', lidas: 1, importaveis: 1, rejeitadas: 0, avisos: 0, inconsistencias: [], amostra: [], prazoRegularizacao: 5 });
    m.responder({ importados: 1, reaproveitados: 0, prazoRegularizacao: 5 });
    await m.api.importacao.analisar({ arquivo: 'x.xlsx', linhas: LINHAS });
    expect(await m.api.importacao.confirmar('imp')).toEqual({ importados: 1, reaproveitados: 0, prazoRegularizacao: 5 });
    expect(m.rpc.mock.calls).toEqual([['importacao_analisar', { p: { arquivo: 'x.xlsx', linhas: LINHAS } }], ['importacao_confirmar', { p_id: 'imp', p: { linhas: LINHAS } }]]);
    // Confirmada: as linhas (com CPF) saem da memória; confirmar de novo nem chama o banco.
    expect((await erro(m.api.importacao.confirmar('imp'))).code).toBe('IMPORTACAO_NAO_ENCONTRADA');
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });
});
