// Adaptador da operação (F3) sobre as RPCs api.* das migrações 0026–0032: encomendas, ocorrências (sem anexo: F4),
// funcionários, relatórios, auditoria do histórico e importação. O banco devolve o formato do domínio (instantes em
// epoch ms); aqui ficam as conversões que o createHttpApi fazia e o que o desenho põe no navegador:
//   * o CSV do relatório é montado com csvRelatorio (@portaria/domain/relatorio), a fonte única do formato;
//   * a verificação da cadeia roda aqui, com verificarCadeia (@portaria/domain/hashChain), sobre os lotes que o banco
//     entrega no formato canônico: o verificador (TS) é independente do gerador (o trigger SQL);
//   * a exportação verificável (JSONL, manifesto v3) é montada com montarExportacaoJsonl (@portaria/domain/exportacao);
//   * as linhas da planilha (com CPF em claro) ficam só na memória desta aba entre analisar e confirmar, como no
//     createHttpApi: o banco guarda só a impressão HMAC delas.
// Texto livre que pode identificar alguém (nome, placa, linhas da planilha) vai sempre no CORPO do POST da RPC.
import type { AutorizacaoRetirada, Encomenda, Ocorrencia, RegistroAlteracao } from '@portaria/domain/types';
import { csvRelatorio } from '@portaria/domain/relatorio';
import { montarExportacaoJsonl } from '@portaria/domain/exportacao';
import { hashGenese, verificarCadeia, type Ancora, type EventoExportado, type ResultadoIntegridade } from '@portaria/domain/hashChain';
import { toInputDate } from '@portaria/domain/time';
import { ApiError } from '../types';
import type {
  Api, EncomendaView, FiltroEncomendas, FiltroOcorrencias, FiltroRelatorio, FuncionarioView, LinhaPlanilha, OcorrenciaView, Pagina,
  RelatorioImportacao, RelatorioResumo,
} from '../types';
import { filtroEventos, naoMigrado, paginaDe, pessoaDe, respostaInvalida, semIndefinidos, todas, type Rpc } from './portaria';

const DIA_MS = 86_400_000;
/** Lote da verificação (o banco entrega no máximo 2000 eventos por chamada). */
const LOTE_CADEIA = 2000;

function encomendaDe(e: EncomendaView): EncomendaView {
  if (!e || typeof e.id !== 'string' || typeof e.recebidaEm !== 'number' || !Array.isArray(e.autorizacoes)) throw respostaInvalida();
  return e;
}
function ocorrenciaDe(o: OcorrenciaView): OcorrenciaView {
  if (!o || typeof o.id !== 'string' || typeof o.abertaEm !== 'number' || !Array.isArray(o.historicoStatus) || !Array.isArray(o.eventoIds)) throw respostaInvalida();
  return { ...o, anexos: Array.isArray(o.anexos) ? o.anexos : [], documentos: Array.isArray(o.documentos) ? o.documentos : [] };
}
function funcionarioDe(f: FuncionarioView): FuncionarioView {
  if (!f || typeof f.pessoaId !== 'string' || !f.pessoa || !f.escala) throw respostaInvalida();
  return { pessoaId: f.pessoaId, funcao: f.funcao, escala: f.escala, ativo: f.ativo, pessoa: pessoaDe(f.pessoa), emEscalaAgora: f.emEscalaAgora === true };
}

/** Filtro de relatório: instantes -> dias de calendário BRT (o createHttpApi mandava o mesmo na query). */
export function filtroRelatorio(f?: number | FiltroRelatorio): Record<string, string> {
  if (typeof f === 'number') return { de: toInputDate(Date.now() - (f - 1) * DIA_MS) };
  return semIndefinidos({
    de: f?.de !== undefined ? toInputDate(f.de) : undefined, ate: f?.ate !== undefined ? toInputDate(f.ate) : undefined,
    unidadeId: f?.unidadeId, categoria: f?.categoria, meio: f?.meio,
  }) as Record<string, string>;
}

/**
 * Evento do banco (já no formato canônico) com as chaves na ordem de paraExportacao do legado, para o JSONL sair igual.
 * Conferência de tipo mínima: o resto (formato, veículo num v1) é o verificador que recusa.
 */
export function exportadoDe(x: unknown): EventoExportado {
  const e = x as Record<string, unknown> | null;
  if (!e || typeof e.seq !== 'number' || typeof e.v !== 'number' || typeof e.hash !== 'string' || typeof e.hash_anterior !== 'string') throw respostaInvalida();
  const t = (k: string) => (e[k] === undefined ? null : (e[k] as string | null));
  return {
    v: e.v, seq: e.seq, id: t('id'), tipo: t('tipo'), categoria_pessoa: t('categoria_pessoa'), pessoa_id: t('pessoa_id'),
    unidade_destino_id: t('unidade_destino_id'), area_comum_id: t('area_comum_id'), ponto_acesso_id: t('ponto_acesso_id'),
    autorizado_por_tipo: t('autorizado_por_tipo'), autorizado_por_pessoa_id: t('autorizado_por_pessoa_id'),
    autorizacao_previa_id: t('autorizacao_previa_id'), justificativa: t('justificativa'), restricao_id: t('restricao_id'),
    operador_id: t('operador_id'), operador_papel: t('operador_papel'), ocorrido_em: t('ocorrido_em'), registrado_em: t('registrado_em'),
    retroativo: e.retroativo === true, formulario_contingencia: t('formulario_contingencia'), refere_evento_id: t('refere_evento_id'),
    corrige_evento_id: t('corrige_evento_id'), correcao_valores: (e.correcao_valores ?? null) as Record<string, string | null> | null,
    empresa: t('empresa'), servico: t('servico'), observacao: t('observacao'),
    ...('veiculo_placa' in e || 'veiculo_modelo' in e || 'veiculo_cor' in e
      ? { veiculo_placa: t('veiculo_placa'), veiculo_modelo: t('veiculo_modelo'), veiculo_cor: t('veiculo_cor') } : {}),
    hash_anterior: e.hash_anterior, hash: e.hash,
  };
}

/** Horário de São Paulo (UTC-3 fixo, como o domain) para o manifesto e o nome do arquivo. */
const isoSP = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00');
const carimboSP = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

interface LoteCadeia {
  cabeca: { ultimoSeq: number; ultimoHash: string } | null; ancora: Ancora | null; ateSeq: number;
  eventos: unknown[]; selos: { ultimoSeq: number; ultimoHash: string }[];
}

type Operacao = Pick<Api, 'encomendas' | 'ocorrencias' | 'funcionarios' | 'relatorios' | 'auditoria' | 'importacao'>;

export function criarOperacao(rpc: Rpc): Operacao {
  // As linhas da planilha (com CPF) só nesta aba, entre analisar e confirmar (o banco guarda só a impressão HMAC).
  const linhasImportacao = new Map<string, LinhaPlanilha[]>();

  const encomendasPagina = async (f: FiltroEncomendas = {}) =>
    paginaDe<EncomendaView>(await rpc('encomendas_listar', { p: semIndefinidos({
      limite: f.limite ?? 50, status: f.status, unidadeId: f.unidadeId, atrasadasDias: f.atrasadasDias, cursor: f.cursor ?? undefined,
    }) }), encomendaDe);
  const ocorrenciasPagina = async (f: FiltroOcorrencias = {}) =>
    paginaDe<OcorrenciaView>(await rpc('ocorrencias_listar', { p: semIndefinidos({
      limite: f.limite ?? 50, status: f.status?.length ? f.status : undefined, tipo: f.tipo, unidadeId: f.unidadeId, cursor: f.cursor ?? undefined,
    }) }), ocorrenciaDe);
  const alteracoesPagina = async (f: Parameters<Api['auditoria']['alteracoesPagina']>[0] = {}): Promise<Pagina<RegistroAlteracao>> =>
    paginaDe<RegistroAlteracao>(await rpc('auditoria_alteracoes', { p: semIndefinidos({
      limite: f.limite ?? 50, de: f.de !== undefined ? Math.trunc(f.de) : undefined, ate: f.ate !== undefined ? Math.trunc(f.ate) : undefined,
      usuarioId: f.usuarioId, acao: f.acao, entidade: f.entidade, cursor: f.cursor ?? undefined,
    }) }));
  const resumoRelatorio = async (f?: number | FiltroRelatorio) => {
    const r = await rpc<RelatorioResumo & { filtroUnidadeCodigo?: string | null }>('relatorio_resumo', { p: filtroRelatorio(f) });
    if (!r?.periodo || !Array.isArray(r.acessosPorDia) || !r.totais) throw respostaInvalida();
    const { filtroUnidadeCodigo, ...resumo } = r;
    return { resumo: resumo as RelatorioResumo, codigoUnidade: filtroUnidadeCodigo ?? undefined };
  };
  const lote = async (p: Record<string, unknown>): Promise<LoteCadeia> => {
    const r = await rpc<LoteCadeia>('auditoria_cadeia', { p: { limite: LOTE_CADEIA, ...p } });
    if (!r || !Array.isArray(r.eventos) || !Array.isArray(r.selos) || typeof r.ateSeq !== 'number') throw respostaInvalida();
    return r;
  };

  return {
    encomendas: {
      async listar(f) {
        return todas((cursor) => encomendasPagina({ status: f?.status, limite: 100, cursor }), 'A lista de encomendas tem mais páginas do que esta tela consegue mostrar.');
      },
      listarPagina: encomendasPagina,
      async resumo(dias) {
        const r = await rpc<{ aguardando: number; atrasadas: number; entregues: number; diasAtraso: number }>('encomendas_resumo', dias !== undefined ? { p_dias: dias } : {});
        if (typeof r?.aguardando !== 'number' || typeof r.atrasadas !== 'number') throw respostaInvalida();
        return r;
      },
      async obter(id) { return encomendaDe(await rpc<EncomendaView>('encomenda_obter', { p_id: id })); },
      async receber(i) {
        return encomendaDe(await rpc<EncomendaView>('encomenda_receber', { p: {
          unidadeId: i.unidadeId, destinatario: i.destinatario, transportadora: i.transportadora, codigoRastreio: i.codigoRastreio,
          unidadeConfirmada: i.unidadeConfirmada,
        } })) as Encomenda;
      },
      async entregar(i) { return encomendaDe(await rpc<EncomendaView>('encomenda_entregar', { p_id: i.id, p_pessoa: i.pessoaId })) as Encomenda; },
      async autorizarRetirada(i) {
        const a = await rpc<AutorizacaoRetirada>('encomenda_autorizar_retirada', { p_id: i.encomendaId, p: { pessoaId: i.pessoaId, solicitadaPorPessoaId: i.solicitadaPorPessoaId } });
        if (!a || typeof a.id !== 'string') throw respostaInvalida();
        return a;
      },
    },
    ocorrencias: {
      async listar() { return todas((cursor) => ocorrenciasPagina({ limite: 100, cursor }), 'A lista de ocorrências tem mais páginas do que esta tela consegue mostrar.'); },
      listarPagina: ocorrenciasPagina,
      async obter(id) { return ocorrenciaDe(await rpc<OcorrenciaView>('ocorrencia_obter', { p_id: id })); },
      // Os anexos não vão aqui: a tela envia cada arquivo por `anexar` depois de criar (F4).
      async criar(i) {
        return ocorrenciaDe(await rpc<OcorrenciaView>('ocorrencia_criar', { p: {
          tipo: i.tipo, descricao: i.descricao, unidadeId: i.unidadeId, envolvidos: i.envolvidos ?? '', eventoIds: i.eventoIds ?? [],
        } })) as Ocorrencia;
      },
      async alterarStatus(id, status) { return ocorrenciaDe(await rpc<OcorrenciaView>('ocorrencia_alterar_status', { p_id: id, p_status: status })) as Ocorrencia; },
      async vincularEventos(id, eventoIds) { return ocorrenciaDe(await rpc<OcorrenciaView>('ocorrencia_vincular_eventos', { p_id: id, p: { eventoIds } })); },
      anexar: naoMigrado('ocorrencias.anexar'),
      baixarAnexo: naoMigrado('ocorrencias.baixarAnexo'),
    },
    funcionarios: {
      async listar() {
        return todas(async (cursor) => paginaDe<FuncionarioView>(await rpc('funcionarios_listar', { p: semIndefinidos({ limite: 100, cursor: cursor ?? undefined }) }), funcionarioDe),
          'A lista de funcionários tem mais páginas do que esta tela consegue mostrar.');
      },
      async criar(i) {
        return funcionarioDe(await rpc<FuncionarioView>('funcionario_criar', { p: semIndefinidos({
          nome: i.nome, documento: i.documento, telefone: i.telefone, funcao: i.funcao, escala: i.escala, ativo: i.ativo,
        }) }));
      },
      async editar({ pessoaId, ...resto }) { return funcionarioDe(await rpc<FuncionarioView>('funcionario_editar', { p_id: pessoaId, p: semIndefinidos(resto) })); },
    },
    relatorios: {
      async resumo(f) { return (await resumoRelatorio(f)).resumo; },
      async exportarCsv(f) {
        const { resumo, codigoUnidade } = await resumoRelatorio(f);
        return csvRelatorio(resumo, { unidade: codigoUnidade, categoria: f?.categoria, meio: f?.meio }, toInputDate(Date.now()));
      },
    },
    auditoria: {
      alteracoesPagina,
      async alteracoes(f = {}) {
        return todas((cursor) => alteracoesPagina({ ...f, limite: 100, cursor }), 'A trilha tem mais páginas do que esta tela consegue mostrar. Use filtros.');
      },
      /**
       * RF-37: recalcula a cadeia NO NAVEGADOR, em lotes, a partir da gênese (ou do selo no seq de corte, depois de um
       * descarte por retenção). Confere cada selo do trecho e, no fim, a cabeça da cadeia (pega remoção no FIM).
       */
      async verificarIntegridade(): Promise<ResultadoIntegridade> {
        let r = await lote({});
        let ancora: Ancora = r.ancora ?? { seq: 0, hash: await hashGenese() };
        const cabeca = r.cabeca;
        let verificados = 0;
        for (;;) {
          const evs = r.eventos.map(exportadoDe);
          if (!evs.length) break;
          const v = await verificarCadeia(evs, ancora);
          if (!v.valido) return { ...v, verificados: verificados + v.verificados };
          for (const s of r.selos) {
            const e = evs.find((x) => x.seq === s.ultimoSeq);
            if (!e || e.hash !== s.ultimoHash) {
              return { valido: false, verificados: verificados + v.verificados, ultimoSeq: v.ultimoSeq, ultimoHash: v.ultimoHash,
                primeiroSeqInvalido: s.ultimoSeq, primeiroEventoIdInvalido: e?.id ?? undefined, motivo: 'selo_divergente' };
            }
          }
          verificados += v.verificados;
          ancora = { seq: v.ultimoSeq, hash: v.ultimoHash };
          if (evs.length < LOTE_CADEIA) break;
          r = await lote({ aposSeq: ancora.seq, ateSeq: r.ateSeq });
        }
        if (cabeca && (cabeca.ultimoSeq !== ancora.seq || cabeca.ultimoHash !== ancora.hash)) {
          return { valido: false, verificados, ultimoSeq: ancora.seq, ultimoHash: ancora.hash, primeiroSeqInvalido: ancora.seq + 1, motivo: 'lacuna_de_seq' };
        }
        return { valido: true, verificados, ultimoSeq: ancora.seq, ultimoHash: ancora.hash };
      },
      /** RF-32: o banco devolve os eventos dos filtros (e grava auditoria.exportar); o JSONL é montado aqui. */
      async exportar(f = {}) {
        const filtros = filtroEventos(f);
        const r = await rpc<{ eventos: unknown[]; exibicao: Record<string, { pessoa: string | null; unidade: string | null; areaComum: string | null; operador: string | null }>;
          geradoPor: string; isolado: boolean }>('auditoria_exportar', { p: filtros });
        if (!r || !Array.isArray(r.eventos) || typeof r.exibicao !== 'object' || typeof r.geradoPor !== 'string') throw respostaInvalida();
        const agora = Date.now();
        return montarExportacaoJsonl({
          eventos: r.eventos.map(exportadoDe), isolado: r.isolado === true,
          // No manifesto, os filtros de texto que podem identificar alguém saem só como marcação (como na trilha).
          filtros: { ...filtros, ...(filtros.pessoa ? { pessoa: '(nome)' } : {}), ...(filtros.placa ? { placa: '(placa)' } : {}) },
          exibicao: (e) => r.exibicao[e.id ?? ''] ?? { pessoa: null, unidade: null, areaComum: null, operador: null },
          geradoPor: r.geradoPor, condominio: null, geradoEm: isoSP(agora), carimbo: carimboSP(agora),
          observacao: 'Arquivo de hashes para verificação, montado no navegador a partir do banco. Não há assinatura digital nem âncora externa neste arquivo.',
        });
      },
      selos: naoMigrado('auditoria.selos'),
      selar: naoMigrado('auditoria.selar'),
      conferirAncora: naoMigrado('auditoria.conferirAncora'),
    },
    importacao: {
      async analisar({ arquivo, linhas }) {
        const r = await rpc<RelatorioImportacao>('importacao_analisar', { p: { arquivo, linhas } });
        if (!r || typeof r.id !== 'string' || !Array.isArray(r.inconsistencias) || typeof r.prazoRegularizacao !== 'number') throw respostaInvalida();
        linhasImportacao.set(r.id, linhas);
        return { ...r, amostra: Array.isArray(r.amostra) ? r.amostra : [] };
      },
      async confirmar(id) {
        const linhas = linhasImportacao.get(id);
        if (!linhas) throw new ApiError(404, 'IMPORTACAO_NAO_ENCONTRADA', 'Análise de importação não encontrada. Envie o arquivo novamente.');
        const r = await rpc<{ importados: number; reaproveitados: number; prazoRegularizacao: number }>('importacao_confirmar', { p_id: id, p: { linhas } });
        if (typeof r?.importados !== 'number' || typeof r.prazoRegularizacao !== 'number') throw respostaInvalida();
        linhasImportacao.delete(id);
        return r;
      },
    },
  };
}
