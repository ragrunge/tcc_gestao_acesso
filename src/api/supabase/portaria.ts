// Adaptador da portaria (F2) sobre as RPCs api.* (migrações 0022–0024), com as escritas que a F3 completou (vínculos,
// veículos, correção de pessoa e unidades: migrações 0025 e 0029). O banco já devolve o formato do domínio
// (EventoView, VinculoView, AutorizacaoView...) com instantes e datas de calendário em epoch ms; aqui ficam só as
// conversões que o contrato do cliente HTTP antigo fazia: placa com hífen no veículo da unidade, datas de calendário
// ('AAAA-MM-DD') na ida, o "negado" vindo como sucesso virando o 422 de sempre e a paginação percorrida.
// Texto livre que pode identificar alguém (termo de busca, nome, placa) vai sempre no CORPO do POST da RPC.
import type {
  AutorizacaoPrevia, EventoView, Funcionario, Pessoa, Restricao, Unidade, Veiculo, VinculoUnidade,
} from '@domain/types';
import type { PermanenciaView, VeiculoAcesso } from '@domain/types';
import { AGRUPAMENTOS } from '@domain/units';
import { toInputDate } from '@domain/time';
import { ApiError } from '../types';
import type {
  Api, Autorizador, AutorizacaoView, Catalogo, FichaPessoa, FiltroEventos, FiltroEventosPagina, Pagina, PaginaEventos, PessoaBusca, PessoaLista,
  PosicaoTrilha, PrevistoView, RestricaoView, ResultadoBuscaGlobal, ResultadoRestricao, ResumoPessoas, ResumoTurno, ResumoUnidades, ResumoVinculos,
  UnidadeDetalhe, UnidadeResumo, VinculoView,
} from '../types';

export type Rpc = <T>(nome: string, args?: Record<string, unknown>) => Promise<T>;

export const respostaInvalida = () => new ApiError(502, 'RESPOSTA_INVALIDA', 'Resposta inesperada do servidor.');
export const naoMigrado = (op: string) => () => Promise.reject(new ApiError(501, 'NAO_MIGRADO', `Função ainda não disponível nesta versão (${op}).`));

/** Limite de páginas por listagem completa (como o cliente HTTP antigo): só impede laço infinito. */
const MAX_PAGINAS = 20;

/** 'ABC1D23' -> 'ABC-1D23' (como a tela exibe o veículo da unidade). */
export const formatarPlaca = (p: string) => (/^[A-Z0-9]{7}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p);
/** Início do dia BRT (ms) -> 'AAAA-MM-DD'. */
export const dia = (ms: number | null | undefined) => (ms === null || ms === undefined ? null : toInputDate(ms));

/** Pessoa do banco: `telefoneMascarado` nulo some (como o pessoaDe do cliente HTTP antigo); o telefone completo nunca vem. */
export function pessoaDe<T extends object>(p: T): T & Pessoa {
  if (!p || typeof (p as { id?: unknown }).id !== 'string') throw respostaInvalida();
  const { telefoneMascarado, ...resto } = p as T & { telefoneMascarado?: string | null };
  return { ...resto, documentoTipo: 'cpf', ...(telefoneMascarado ? { telefoneMascarado } : {}) } as unknown as T & Pessoa;
}
export function eventoDe(e: EventoView): EventoView {
  if (!e || typeof e.id !== 'string' || typeof e.seq !== 'number' || typeof e.ocorridoEm !== 'number') throw respostaInvalida();
  return e;
}
export const lista = <T>(x: unknown, f: (y: T) => T = (y) => y): T[] => {
  if (!Array.isArray(x)) throw respostaInvalida();
  return (x as T[]).map(f);
};
export function paginaDe<T>(x: unknown, f: (y: T) => T = (y) => y): Pagina<T> {
  const p = x as { itens?: unknown; cursor?: unknown; temMais?: unknown; total?: unknown; ateSeq?: unknown } | null;
  if (!p || !Array.isArray(p.itens) || typeof p.temMais !== 'boolean') throw respostaInvalida();
  if (p.total !== undefined && p.total !== null && (typeof p.total !== 'number' || p.total < 0)) throw respostaInvalida();
  return {
    itens: (p.itens as T[]).map(f), cursor: typeof p.cursor === 'string' ? p.cursor : null, temMais: p.temMais,
    total: typeof p.total === 'number' ? p.total : null, ...(typeof p.ateSeq === 'number' ? { ateSeq: p.ateSeq } : {}),
  };
}
/** Corpo da posição da página: cursor OU deslocamento (o banco recusa os dois), e o ateSeq das trilhas. */
export function posicao(f: PosicaoTrilha, padrao = 50): Record<string, unknown> {
  const desl = f.cursor ? undefined : f.deslocamento;
  return semIndefinidos({
    limite: f.limite ?? padrao, cursor: f.cursor || undefined, deslocamento: desl,
    ateSeq: desl !== undefined ? f.ateSeq : undefined,
  });
}
/** Contagem não negativa de um resumo do banco (o resto é recusado como resposta inválida). */
export function contagem(x: unknown): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) throw respostaInvalida();
  return x;
}
const contagens = <K extends string>(x: unknown, chaves: readonly K[]): Record<K, number> => {
  if (!x || typeof x !== 'object') throw respostaInvalida();
  return Object.fromEntries(chaves.map((k) => [k, contagem((x as Record<string, unknown>)[k])])) as Record<K, number>;
};
const TIPOS_EVENTO = ['entrada', 'saida', 'negado', 'recusado', 'correcao'] as const;
const unidadeDe = (u: Unidade): Unidade => {
  if (!u || typeof u.id !== 'string') throw respostaInvalida();
  return { id: u.id, bloco: u.bloco, numero: u.numero, ativo: u.ativo };
};
function vinculoDe(v: VinculoView): VinculoView {
  if (!v || typeof v.id !== 'string' || typeof v.status !== 'string') throw respostaInvalida();
  return v;
}
const veiculoDe = (v: Veiculo): Veiculo => {
  if (!v || typeof v.id !== 'string' || typeof v.placa !== 'string') throw respostaInvalida();
  return { ...v, placa: formatarPlaca(v.placa) };
};
const funcionarioBase = (f: Funcionario): Funcionario => ({ pessoaId: f.pessoaId, funcao: f.funcao, escala: f.escala, ativo: f.ativo });
/** Corpo sem as chaves `undefined`. */
export const semIndefinidos = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Filtros de evento no corpo (o nome e a placa são dado pessoal: nunca em URL). */
export function filtroEventos(f: FiltroEventos): Record<string, unknown> {
  return semIndefinidos({
    eventoId: f.eventoId, de: f.de !== undefined ? Math.trunc(f.de) : undefined, ate: f.ate !== undefined ? Math.trunc(f.ate) : undefined,
    unidadeId: f.unidadeId, pessoaId: f.pessoaId, pessoa: f.pessoa?.trim() || undefined, placa: f.placa?.trim() || undefined,
    operadorId: f.operadorId, tipo: f.tipo, meio: f.meio, somenteExcecoes: f.somenteExcecoes || undefined,
    somenteRetroativos: f.somenteRetroativos || undefined, excluirTipos: f.excluirTipos?.length ? f.excluirTipos : undefined,
  });
}

/** Percorre a listagem por cursor até `temMais` falso (a interface devolve a lista inteira). */
export async function todas<T>(pagina: (cursor: string | null) => Promise<Pagina<T>>, mensagem: string): Promise<T[]> {
  const itens: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const p = await pagina(cursor);
    itens.push(...p.itens);
    if (!p.temMais || !p.cursor) return itens;
    cursor = p.cursor;
  }
  throw new ApiError(502, 'PAGINACAO_EXCEDIDA', mensagem);
}

/**
 * Rotas (e partes de tela) com backend nesta fase: as demais somem do menu e mostram "não disponível" (desenho §6,
 * `suporta`). F2: a portaria. F3: encomendas, ocorrências, funcionários, relatórios e importação. F4: `anexos` (envio e
 * leitura de anexo de ocorrência pela Edge anexos). Ficam de fora: `usuarios` (listar e alterar papel ainda não migrados)
 * e `privacidade` (LGPD, F5).
 */
export const ROTAS_MIGRADAS = new Set(['painel', 'entrada', 'saida', 'pessoas', 'unidades', 'vinculos', 'cadastro', 'historico',
  'encomendas', 'ocorrencias', 'funcionarios', 'relatorios', 'importar', 'anexos']);

type Portaria = Pick<Api, 'busca' | 'pessoas' | 'catalogo' | 'unidades' | 'veiculos' | 'vinculos' | 'autorizacoes' | 'restricoes' | 'eventos' | 'turno'>;

export function criarPortaria(rpc: Rpc): Portaria {
  const eventosPagina = async (f: FiltroEventosPagina = {}): Promise<PaginaEventos> => {
    const r = await rpc<{ porTipo?: unknown }>('eventos_listar', { p: { ...filtroEventos(f), ...posicao(f) } });
    const pagina = paginaDe<EventoView>(r, eventoDe);
    return r?.porTipo ? { ...pagina, porTipo: contagens(r.porTipo, TIPOS_EVENTO) } : pagina;
  };
  const unidadesPagina = async (f: { bloco?: string; cursor?: string | null; limite?: number } = {}) =>
    paginaDe<UnidadeResumo>(await rpc('unidades_listar', { p: semIndefinidos({ limite: f.limite ?? 50, bloco: f.bloco, cursor: f.cursor ?? undefined }) }));
  const pessoasPagina = async (f: { categoria?: string; cursor?: string | null; limite?: number; deslocamento?: number; incluirDesativadas?: boolean } = {}) =>
    paginaDe<PessoaLista>(await rpc('pessoas_listar', { p: semIndefinidos({
      ...posicao(f), categoria: f.categoria, incluirDesativadas: f.incluirDesativadas || undefined,
    }) }), pessoaDe);
  const vinculosPagina = async (f: { status?: string[]; unidadeId?: string; pessoaId?: string; ordem?: string; cursor?: string | null; limite?: number; deslocamento?: number } = {}) =>
    paginaDe<VinculoView>(await rpc('vinculos_listar', { p: semIndefinidos({
      ...posicao(f), status: f.status?.length ? f.status : undefined, unidadeId: f.unidadeId, pessoaId: f.pessoaId, ordem: f.ordem,
    }) }));

  return {
    busca: {
      async global(q) {
        const r = await rpc<ResultadoBuscaGlobal>('busca_global', { p: { q } });
        if (!r || !Array.isArray(r.pessoas) || !Array.isArray(r.unidades)) throw respostaInvalida();
        return { ...r, pessoas: r.pessoas.map(pessoaDe) };
      },
    },
    pessoas: {
      async buscar(q, o) {
        const r = await rpc<{ pessoas: PessoaBusca[] }>('pessoas_buscar', { p: {
          q, limite: o?.limite ?? 8, semMoradores: !!o?.semMoradores, ...(o?.incluirDesativadas ? { incluirDesativadas: true } : {}) } });
        return lista(r?.pessoas, pessoaDe);
      },
      async listar() { return todas((cursor) => pessoasPagina({ limite: 100, cursor }), 'A lista de pessoas tem mais páginas do que esta tela consegue mostrar.'); },
      listarPagina: (f = {}) => pessoasPagina(f),
      async resumo(): Promise<ResumoPessoas> {
        const r = await rpc<Record<string, unknown>>('pessoas_resumo');
        if (!r) throw respostaInvalida();
        return { ativas: contagem(r.ativas), desativadas: contagem(r.desativadas),
          porCategoria: contagens(r.porCategoria, ['morador', 'visitante', 'prestador', 'funcionario'] as const) };
      },
      async ficha(id) {
        const f = await rpc<{ pessoa: Pessoa; funcionario: Funcionario | null; vinculos: VinculoView[]; eventos: EventoView[] }>('pessoa_ficha', { p_id: id });
        if (!f?.pessoa || !Array.isArray(f.vinculos)) throw respostaInvalida();
        const ficha: FichaPessoa = {
          pessoa: pessoaDe(f.pessoa), vinculos: f.vinculos, ...(f.funcionario ? { funcionario: funcionarioBase(f.funcionario) } : {}),
          eventos: lista(f.eventos, eventoDe),
        };
        return ficha;
      },
      async criar(i) {
        return pessoaDe(await rpc<Pessoa>('pessoa_criar', { p: semIndefinidos({
          nome: i.nome, telefone: i.menorIdade && !i.telefone?.trim() ? undefined : i.telefone, categoria: i.categoria,
          documento: !i.semCpf && i.documento?.trim() ? i.documento : undefined, empresa: i.empresa?.trim() || undefined,
          servico: i.servico?.trim() || undefined, semCpf: i.semCpf ? true : undefined, menorIdade: i.menorIdade ? true : undefined,
        }) }));
      },
      async editar({ id, ...resto }) { return pessoaDe(await rpc<Pessoa>('pessoa_editar', { p_id: id, p: semIndefinidos(resto) })); },
      async funcionario(id) {
        const f = await rpc<Funcionario | null>('pessoa_funcionario', { p_id: id });
        return f ? funcionarioBase(f) : null;
      },
      async desativar(id, motivo) { return pessoaDe(await rpc<Pessoa & { autorizacoesRevogadas: number }>('pessoa_desativar', { p_id: id, p_motivo: motivo })); },
      async reativar(id) { return pessoaDe(await rpc<Pessoa>('pessoa_reativar', { p_id: id })); },
    },
    catalogo: {
      async obter() {
        const c = await rpc<Catalogo>('catalogo');
        if (!c || !Array.isArray(c.unidades) || !Array.isArray(c.areasComuns) || !AGRUPAMENTOS.includes(c.agrupamento)) throw respostaInvalida();
        return { agrupamento: c.agrupamento, unidades: c.unidades.map(unidadeDe), areasComuns: c.areasComuns };
      },
    },
    unidades: {
      async listar() { return todas((cursor) => unidadesPagina({ limite: 100, cursor }), 'A lista de unidades tem mais páginas do que esta tela consegue mostrar.'); },
      listarPagina: (f = {}) => unidadesPagina(f),
      async resumo(): Promise<ResumoUnidades> {
        return contagens(await rpc('unidades_resumo'),
          ['total', 'ativas', 'inativas', 'ocupadas', 'alugadas', 'vazias', 'cadastroCompleto', 'veiculosAtivos'] as const);
      },
      async detalhe(ref) {
        const d = await rpc<UnidadeDetalhe>('unidade_detalhe', { p_ref: ref });
        if (!d?.unidade || !Array.isArray(d.veiculos)) throw respostaInvalida();
        return {
          unidade: unidadeDe(d.unidade), veiculos: d.veiculos.map(veiculoDe), vinculos: lista(d.vinculos),
          autorizacoes: lista(d.autorizacoes), restricoes: lista(d.restricoes), eventos: lista(d.eventos, eventoDe),
        };
      },
      async criar(i) { return unidadeDe(await rpc<Unidade>('unidade_criar', { p: { bloco: i.bloco, numero: i.numero } })); },
      async editar(i) { return unidadeDe(await rpc<Unidade>('unidade_editar', { p_id: i.id, p: { bloco: i.bloco, numero: i.numero } })); },
      async desativar(id) { return unidadeDe(await rpc<Unidade>('unidade_desativar', { p_id: id })); },
      async reativar(id) { return unidadeDe(await rpc<Unidade>('unidade_reativar', { p_id: id })); },
    },
    veiculos: {
      async criar(i) { return veiculoDe(await rpc<Veiculo>('veiculo_criar', { p: { unidadeId: i.unidadeId, placa: i.placa, modelo: i.modelo, cor: i.cor } })); },
      async editar({ id, ...resto }) { return veiculoDe(await rpc<Veiculo>('veiculo_editar', { p_id: id, p: semIndefinidos(resto) })); },
    },
    vinculos: {
      async listar(f) { return todas((cursor) => vinculosPagina({ limite: 100, cursor, status: f?.status ? [f.status] : undefined }), 'A lista de vínculos tem mais páginas do que esta tela consegue mostrar.'); },
      listarPagina: (f = {}) => vinculosPagina(f),
      async contar(status) {
        const n = await rpc<number>('vinculos_contar', { p_status: status });
        if (typeof n !== 'number') throw respostaInvalida();
        return n;
      },
      async resumo(): Promise<ResumoVinculos> {
        const r = await rpc<Record<string, unknown>>('vinculos_resumo');
        if (!r) throw respostaInvalida();
        return {
          porStatus: contagens(r.porStatus, ['pendente', 'aprovado', 'legado', 'rejeitado', 'encerrado'] as const),
          legadosVencidos: contagem(r.legadosVencidos),
          validosPorTipo: contagens(r.validosPorTipo, ['proprietario', 'inquilino', 'dependente'] as const),
          pessoasComVinculoValido: contagem(r.pessoasComVinculoValido),
        };
      },
      async autorizadores(unidadeId) {
        const r = await rpc<{ pessoa: Pessoa; vinculo: VinculoUnidade }[]>('vinculos_autorizadores', { p_unidade: unidadeId });
        return lista<{ pessoa: Pessoa; vinculo: VinculoUnidade }>(r).map((a): Autorizador => ({ pessoa: pessoaDe(a.pessoa), vinculo: a.vinculo }));
      },
      // Escrita (F3, 0025). Datas de calendário vão como 'AAAA-MM-DD' (dia BRT); o banco devolve a VinculoView em ms.
      async criar(i) {
        return vinculoDe(await rpc<VinculoView>('vinculo_criar', { p: {
          pessoaId: i.pessoaId, unidadeId: i.unidadeId, tipo: i.tipo, vigenciaInicio: dia(i.vigenciaInicio), vigenciaFim: dia(i.vigenciaFim),
        } }));
      },
      async registrarConferencia(id, i) {
        return vinculoDe(await rpc<VinculoView>('vinculo_conferir', { p_id: id, p: semIndefinidos({
          tipo: i.tipo, descricao: i.descricao, observacao: i.observacao, data: i.data !== undefined ? dia(i.data) : undefined,
        }) }));
      },
      async decidir({ id, decisao, justificativa }) {
        return vinculoDe(decisao === 'aprovar'
          ? await rpc<VinculoView>('vinculo_aprovar', { p_id: id })
          : await rpc<VinculoView>('vinculo_rejeitar', { p_id: id, p: { justificativa: justificativa ?? '' } }));
      },
      async regularizar(id, opcoes) {
        return vinculoDe(await rpc<VinculoView>('vinculo_regularizar', { p_id: id,
          p: opcoes?.vigenciaFim !== undefined ? { vigenciaFim: dia(opcoes.vigenciaFim) } : {} }));
      },
      async encerrar(id, i) {
        return vinculoDe(await rpc<VinculoView>('vinculo_encerrar', { p_id: id, p: semIndefinidos({
          motivo: i.motivo, data: i.data !== undefined ? dia(i.data) : undefined,
        }) }));
      },
    },
    autorizacoes: {
      async criar(i) {
        return rpc<AutorizacaoPrevia>('autorizacao_criar', { p: semIndefinidos({
          unidadeId: i.unidadeId, areaComumId: i.areaComumId ?? undefined, pessoaId: i.pessoaId,
          validaDe: i.validaDe !== undefined ? dia(i.validaDe) : undefined, validaAte: dia(i.validaAte), diasSemana: i.diasSemana,
          horaInicio: i.horaInicio, horaFim: i.horaFim, solicitadaPorPessoaId: i.solicitadaPorPessoaId, justificativa: i.justificativa ?? undefined,
        }) });
      },
      async revogar(id) { await rpc('autorizacao_revogar', { p_id: id }); },
      async vigentes(pessoaId, destinoId, o) {
        return lista(await rpc<AutorizacaoView[]>('autorizacoes_vigentes', { p_pessoa: pessoaId, p_destino: destinoId, p_area_comum: !!o?.areaComum }));
      },
      async hoje() { return lista(await rpc<AutorizacaoView[]>('autorizacoes_hoje')); },
      async previstas(horas) { return lista(await rpc<PrevistoView[]>('autorizacoes_previstas', { p_horas: horas })); },
    },
    restricoes: {
      async verificar(pessoaId, unidadeId) {
        const r = await rpc<ResultadoRestricao>('restricao_verificar', { p_pessoa: pessoaId, p_unidade: unidadeId });
        if (!r || typeof r.restrita !== 'boolean' || !Array.isArray(r.alertas)) throw respostaInvalida();
        return r;
      },
      async criar(i) {
        return rpc<Restricao>('restricao_criar', { p: semIndefinidos({
          pessoaId: i.pessoaId, unidadeId: i.unidadeId, motivo: i.motivo, validaAte: dia(i.validaAte),
          solicitadaPorPessoaId: i.solicitadaPorPessoaId, paraTodoCondominio: i.paraTodoCondominio || undefined,
        }) });
      },
      async aprovar(id) { return rpc<Restricao>('restricao_aprovar', { p_id: id }); },
      async revogar(id) { await rpc('restricao_revogar', { p_id: id }); },
      async pendentes() { return lista(await rpc<RestricaoView[]>('restricoes_pendentes')); },
    },
    eventos: {
      async criar(i) {
        const r = await rpc<{ resultado: string; evento: EventoView; restricoes?: RestricaoView[]; mensagem?: string }>('evento_entrada', { p: semIndefinidos({
          pessoaId: i.pessoaId, unidadeDestinoId: i.unidadeDestinoId, areaComumId: i.areaComumId ?? undefined,
          autorizadoPorTipo: i.autorizadoPorTipo ?? null, autorizadoPorPessoaId: i.autorizadoPorPessoaId ?? undefined,
          autorizacaoPreviaId: i.autorizacaoPreviaId ?? undefined, justificativa: i.justificativa ?? undefined, retroativo: i.retroativo || undefined,
          ocorridoEm: i.retroativo && i.ocorridoEm ? Math.trunc(i.ocorridoEm) : undefined, observacao: i.observacao ?? undefined,
          formularioContingencia: i.retroativo ? i.formularioContingencia ?? undefined : undefined, tipoVisita: i.tipoVisita ?? undefined,
          veiculo: i.veiculo ? { placa: i.veiculo.placa, modelo: i.veiculo.modelo?.trim() || undefined, cor: i.veiculo.cor?.trim() || undefined } : undefined,
        }) });
        if (!r || !r.evento) throw respostaInvalida();
        // O negado é GRAVADO e a RPC responde sucesso (um RAISE o desfaria); a tela espera o 422 de sempre.
        if (r.resultado === 'negado') {
          const v = eventoDe(r.evento);
          throw new ApiError(422, 'PESSOA_EM_RESTRICAO', r.mensagem ?? 'Entrada não permitida: pessoa com restrição.', {
            eventoId: v.id, codigo: v.codigo, restricoes: r.restricoes ?? [],
          });
        }
        if (r.resultado !== 'entrada') throw respostaInvalida();
        return eventoDe(r.evento);
      },
      async registrarRecusa(i) {
        return eventoDe(await rpc<EventoView>('evento_recusa', { p: semIndefinidos({
          pessoaId: i.pessoaId, unidadeDestinoId: i.unidadeDestinoId, meio: i.meio, moradorPessoaId: i.moradorPessoaId,
          observacao: i.observacao ?? undefined, retroativo: i.retroativo || undefined,
          ocorridoEm: i.retroativo && i.ocorridoEm ? Math.trunc(i.ocorridoEm) : undefined,
          formularioContingencia: i.retroativo ? i.formularioContingencia ?? undefined : undefined,
        }) }));
      },
      async registrarSaida(entradaId, o = {}) {
        return eventoDe(await rpc<EventoView>('evento_saida', { p_entrada: entradaId, p: semIndefinidos({
          observacao: o.observacao?.trim() || undefined, retroativo: o.retroativo || undefined,
          ocorridoEm: o.retroativo && o.ocorridoEm ? Math.trunc(o.ocorridoEm) : undefined,
          formularioContingencia: o.retroativo ? o.formularioContingencia ?? undefined : undefined,
        }) }));
      },
      async corrigir(id, i) {
        const v = i.valores;
        const valores = v ? semIndefinidos({
          unidadeDestinoId: v.unidadeDestinoId, ocorridoEm: v.ocorridoEm !== undefined ? Math.trunc(v.ocorridoEm) : undefined,
          pessoaId: v.pessoaId, autorizadoPorPessoaId: v.autorizadoPorPessoaId,
        }) : undefined;
        return eventoDe(await rpc<EventoView>('evento_corrigir', { p_evento: id, p: semIndefinidos({
          justificativa: i.justificativa, observacao: i.observacao?.trim() || undefined, valores: valores && Object.keys(valores).length ? valores : undefined,
        }) }));
      },
      listarPagina: eventosPagina,
      async listar(f = {}) {
        return todas((cursor) => eventosPagina({ ...f, limite: 100, cursor }), 'A listagem tem mais páginas do que esta tela consegue mostrar. Use filtros.');
      },
      async correcoesDe(id) { return lista(await rpc<EventoView[]>('evento_correcoes', { p_id: id }), eventoDe); },
      async obter(id) { return eventoDe(await rpc<EventoView>('evento_obter', { p_id: id })); },
      async presentes() { return lista(await rpc<EventoView[]>('eventos_presentes'), eventoDe); },
      async prorrogarPermanencia(entradaId) {
        const p = await rpc<PermanenciaView & { eventoId: string }>('evento_prorrogar', { p_entrada: entradaId });
        if (!p || typeof p.prazoAte !== 'number' || typeof p.prorrogacoes !== 'number') throw respostaInvalida();
        return p;
      },
      async ultimoVeiculo(pessoaId) {
        const v = await rpc<VeiculoAcesso | null>('evento_ultimo_veiculo', { p_pessoa: pessoaId });
        return v && typeof v.placa === 'string' ? v : null;
      },
    },
    turno: {
      async resumo() {
        const r = await rpc<ResumoTurno>('turno_resumo');
        if (typeof r?.pessoasDentro !== 'number') throw respostaInvalida();
        return r;
      },
    },
  };
}
