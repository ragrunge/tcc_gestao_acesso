import type {
  AutorizacaoRetirada,
  Encomenda,
  MudancaStatusOcorrencia,
  Ocorrencia,
  StatusOcorrencia,
  TipoOcorrencia,
} from '@/domain/types'
import type { PosicaoPagina } from './paginacao'

export interface NovaEncomendaInput {
  unidadeId: string
  destinatario: string
  transportadora: string
  codigoRastreio: string
  unidadeConfirmada: boolean
}

export interface NovaOcorrenciaInput {
  tipo: TipoOcorrencia
  descricao: string
  unidadeId: string | null
  envolvidos: string
  anexos?: string[]
  eventoIds?: string[]
}
export interface AutorizarRetiradaInput {
  encomendaId: string
  pessoaId: string
  solicitadaPorPessoaId: string
}
export interface EncomendaView extends Encomenda {
  unidadeCodigo: string
  recebidaPorNome: string
  /** "Lúcia Ribeiro (dependente)" ou "Fulano (autorizado por Ana Ribeiro)". */
  retiradaPorNome: string | null
  retiradaRegistradaPorNome: string | null
  autorizacoes: (AutorizacaoRetirada & { pessoaNome: string; solicitanteNome: string })[]
}

export interface OcorrenciaView extends Ocorrencia {
  abertaPorNome: string
  historicoStatus: (MudancaStatusOcorrencia & { porNome: string })[]
  /**
   * Anexos com conteúdo guardado (API real: cifrado, spec §9.2). Opcional no tipo (`anexos` traz só os nomes).
   * O nome é gerado ("anexo-1a2b3c4d.pdf"): o original não é guardado.
   */
  documentos?: AnexoOcorrencia[]
}
export interface AnexoOcorrencia {
  id: string
  nome: string
  mime: string
  tamanhoBytes: number
  enviadoEm: number
  enviadoPorNome: string
}
/** Conteúdo de um anexo para download (só síndico e administração: `documento.ver`). */
export interface ArquivoBaixado {
  nome: string
  mime: string
  conteudo: Blob
}

/** Filas de encomendas (RF-26), paginadas. `atrasadasDias`: só as aguardando há mais de N dias. */
export interface FiltroEncomendas extends PosicaoPagina {
  status?: 'aguardando' | 'entregue'
  unidadeId?: string
  atrasadasDias?: number
}
/** Contagens das abas e do painel sem carregar as listas. */
export interface ResumoEncomendas {
  aguardando: number
  atrasadas: number
  entregues: number
  diasAtraso: number
}
export interface FiltroOcorrencias extends PosicaoPagina {
  status?: StatusOcorrencia[]
  tipo?: TipoOcorrencia
  unidadeId?: string
}
/** Contagens por status (cartões do topo da tela). */
export interface ResumoOcorrencias {
  total: number
  aberta: number
  emAndamento: number
  encerrada: number
}
