export interface AutorizacaoPrevia {
  id: string
  /** Destino: unidade OU área comum (exatamente um). */
  unidadeId: string | null
  areaComumId: string | null
  pessoaId: string
  validaDe: number
  validaAte: number // obrigatória (RN-07)
  diasSemana: number[] | null // 0 = domingo ... 6 = sábado; null = todos
  horaInicio: string | null // "HH:MM"
  horaFim: string | null
  cadastradaPorId: string
  cadastradaEm: number
  /** Morador que pediu (unidade). Nulo na área comum e no "sem solicitante". */
  solicitadaPorPessoaId: string | null
  /** Unidade sem morador solicitante: exige `justificativa` e conta como exceção de quem cadastrou. */
  semSolicitante: boolean
  justificativa: string | null
  revogadaEm: number | null
  revogadaPorId: string | null
}

export interface Restricao {
  id: string
  escopo: 'unidade' | 'condominio'
  unidadeId: string | null // unidade de origem do pedido (obrigatória se escopo = unidade)
  pessoaId: string
  motivo: string
  validaAte: number
  cadastradaPorId: string
  cadastradaEm: number
  /** Morador que pediu: obrigatório no escopo unidade, opcional no condomínio. */
  solicitadaPorPessoaId: string | null
  aprovadaPorId: string | null // escopo condomínio exige síndico (RN-06)
  aprovadaEm: number | null
  revogadaEm: number | null
  revogadaPorId: string | null
}
