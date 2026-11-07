import type { EstadoAutorizacao, MeioComMorador } from '@/domain/rules'
import type {
  AutorizacaoPrevia,
  CategoriaPessoa,
  MeioAutorizacao,
  Restricao,
  TipoEvento,
  TipoVisita,
} from '@/domain/types'
import type { PosicaoTrilha } from './paginacao'

export interface NovoEventoInput {
  pessoaId: string
  /** Destino: unidade OU área comum (área comum só para prestador, RF-36). */
  unidadeDestinoId: string | null
  areaComumId?: string | null
  autorizadoPorTipo?: MeioAutorizacao | null
  autorizadoPorPessoaId?: string | null
  autorizacaoPreviaId?: string | null
  justificativa?: string | null
  retroativo?: boolean
  /** Obrigatório no retroativo: data/hora reais do acesso. O servidor define registradoEm. */
  ocorridoEm?: number | null
  observacao?: string | null
  /** Nº do formulário de papel: obrigatório quando `retroativo`. */
  formularioContingencia?: string | null
  /** Prazo de permanência: só visitante/prestador (padrão no servidor: visita / serviço). */
  tipoVisita?: TipoVisita | null
  /** Veículo com que a pessoa chegou (nulo/ausente = a pé). Placa obrigatória; modelo e cor opcionais. */
  veiculo?: { placa: string; modelo?: string | null; cor?: string | null } | null
}

/** UC02 A4: o morador recusou a visita (interfone, celular ou morador presente). */
export interface NovaRecusaInput {
  pessoaId: string
  unidadeDestinoId: string
  meio: MeioComMorador
  moradorPessoaId: string
  observacao?: string | null
  retroativo?: boolean
  ocorridoEm?: number | null
  formularioContingencia?: string | null
}

export interface OpcoesSaida {
  observacao?: string
  retroativo?: boolean
  /** Retroativo: hora real da saída (≥ entrada e < agora). */
  ocorridoEm?: number | null
  formularioContingencia?: string | null
}
export interface FiltroEventos {
  /** RF-32: restringe a um único evento (exportação isolada). */
  eventoId?: string
  de?: number
  ate?: number
  unidadeId?: string
  /** Texto do nome (sem acento, parcial). Pode identificar alguém: na API real vai no corpo de um POST, nunca na URL. */
  pessoa?: string
  /** Placa parcial (≥3 caracteres; a API ignora menos). Dado pessoal: só no corpo de POST, nunca na URL. */
  placa?: string
  /** Pessoa exata (ficha), pelos valores efetivos (com correção). */
  pessoaId?: string
  operadorId?: string
  tipo?: TipoEvento
  meio?: MeioAutorizacao
  somenteExcecoes?: boolean
  somenteRetroativos?: boolean
  /** Tipos a deixar de fora (painel: sem saídas; unidade: sem correções). */
  excluirTipos?: TipoEvento[]
}
/** Uma página de eventos (mais recentes primeiro, por seq). */
export interface FiltroEventosPagina extends FiltroEventos, PosicaoTrilha {}
export interface NovaAutorizacaoInput {
  /** Destino: unidade OU área comum. Área comum só síndico/administração (autorizacao.area_comum), sem solicitante. */
  unidadeId: string | null
  areaComumId?: string | null
  pessoaId: string
  validaAte: number | null
  validaDe?: number
  diasSemana: number[] | null
  horaInicio: string | null
  horaFim: string | null
  /** Morador que pediu. Sem ele, `justificativa` (≥ 15 caracteres) é obrigatória. */
  solicitadaPorPessoaId: string | null
  justificativa?: string | null
}

export interface NovaRestricaoInput {
  pessoaId: string
  unidadeId: string | null
  motivo: string
  validaAte: number | null
  /** Morador que pediu: obrigatório (com vínculo válido) no escopo unidade; opcional no condomínio. */
  solicitadaPorPessoaId: string | null
  paraTodoCondominio?: boolean
}
export interface AutorizacaoView extends AutorizacaoPrevia {
  pessoaNome: string
  estado: EstadoAutorizacao
  /** Código da unidade ou nome da área comum. */
  unidadeRotulo: string
  utilizadaEm: number | null
  /** "Paula Nogueira (Administração)". */
  cadastradaPorNome: string
  solicitadaPorNome: string | null
  revogadaPorNome: string | null
}
/** Visita prevista (autorização prévia que vale agora ou nas próximas horas, pessoa fora do condomínio). Sem CPF/telefone. */
export interface PrevistoView {
  autorizacaoId: string
  pessoaId: string
  nome: string
  categoria: CategoriaPessoa
  destino: { tipo: 'unidade' | 'area_comum'; id: string; rotulo: string }
  /** Limites da próxima janela (epoch ms). `inicio` no passado = a janela já está em curso. */
  inicio: number
  fim: number
}
export interface RestricaoView extends Restricao {
  pessoaNome: string
  pendente: boolean
  unidadeCodigo: string | null
  cadastradaPorNome: string
  solicitadaPorNome: string | null
  aprovadaPorNome: string | null
  revogadaPorNome: string | null
}
export interface ResumoTurno {
  pessoasDentro: number
  encomendasPendentes: number
  ocorrenciasAbertas: number
  autorizacoesHoje: number
  excecoesHoje: number
  restricoesPendentes: number
}

export interface ResultadoRestricao {
  restrita: boolean
  alertas: RestricaoView[]
}
