import type { StatusVinculo, TipoComprovante, TipoVinculo, VinculoUnidade } from '@/domain/types'
import type { PosicaoPagina } from './paginacao'

export interface NovoVinculoInput {
  pessoaId: string
  unidadeId: string
  tipo: TipoVinculo
  vigenciaInicio: number
  vigenciaFim: number | null
  /** O comprovante não é anexado: a administração registra a conferência depois (RF-05, `vinculos.registrarConferencia`). */
  solicitadoPor: string
}

/** RF-05: o conferente é o usuário autenticado; `data` (início do dia BRT) é hoje se omitida. Sem arquivo. */
export interface ConferenciaInput {
  tipo: TipoComprovante
  descricao?: string
  observacao?: string
  data?: number
}
export interface VinculoView extends VinculoUnidade {
  pessoaNome: string
  pessoaDocumento: string
  /** Pessoa tem CPF e telefone (pré-requisito para aprovar o vínculo). */
  pessoaCadastroCompleto: boolean
  unidadeCodigo: string
  decididoPorNome: string | null
  registradoPorNome: string | null
  conferidoPorNome: string | null
  /** Legado com prazo de regularização vencido (RN-09). */
  legadoVencido: boolean
}
/** recentes: solicitação mais nova primeiro; decisao: decisão/encerramento mais novo; prazo: prazo de regularização (vencidos primeiro). */
export type OrdemVinculos = 'recentes' | 'decisao' | 'prazo'
export interface FiltroVinculos extends PosicaoPagina {
  status?: StatusVinculo[]
  unidadeId?: string
  pessoaId?: string
  ordem?: OrdemVinculos
}
/** Por status, legados vencidos e, entre os vínculos válidos hoje, por tipo e por pessoa distinta. */
export interface ResumoVinculos {
  porStatus: Record<StatusVinculo, number>
  legadosVencidos: number
  validosPorTipo: Record<TipoVinculo, number>
  pessoasComVinculoValido: number
}
/** RF-07: encerramento manual. `data` (início do dia BRT): padrão hoje, ou o fim da vigência se ele já passou. */
export interface EncerrarVinculoInput {
  motivo: string
  data?: number
}
