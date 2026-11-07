export interface Encomenda {
  id: string
  codigo: string
  unidadeId: string
  destinatario: string
  transportadora: string
  codigoRastreio: string
  recebidaPorId: string
  recebidaEm: number
  unidadeConfirmada: boolean
  retiradaEm: number | null
  retiradaPorPessoaId: string | null
  retiradaRegistradaPorId: string | null
  /** Preenchido quando quem retirou não tem vínculo e foi autorizado por morador (RN-08). */
  retiradaAutorizacaoId: string | null
}

/** Autorização de retirada dada por morador com vínculo válido (RN-08: "ou a pessoa autorizada por ela"). */
export interface AutorizacaoRetirada {
  id: string
  encomendaId: string
  pessoaAutorizadaId: string
  solicitantePessoaId: string
  registradaPorId: string
  registradaEm: number
}

export type TipoOcorrencia =
  'conflito' | 'tentativa_acesso_indevido' | 'dano' | 'encomenda' | 'outro'
export const ROTULO_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  conflito: 'Conflito',
  tentativa_acesso_indevido: 'Tentativa de acesso indevido',
  dano: 'Dano',
  encomenda: 'Encomenda',
  outro: 'Outro',
}
export type StatusOcorrencia = 'aberta' | 'em_andamento' | 'encerrada'
export const ROTULO_STATUS_OCORRENCIA: Record<StatusOcorrencia, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  encerrada: 'Encerrada',
}

export interface MudancaStatusOcorrencia {
  de: StatusOcorrencia
  para: StatusOcorrencia
  porId: string
  em: number
}

export interface Ocorrencia {
  id: string
  codigo: string // OC-2026-047
  tipo: TipoOcorrencia
  descricao: string
  unidadeId: string | null // null = área comum
  envolvidos: string
  abertaPorId: string
  abertaEm: number
  status: StatusOcorrencia
  /** Quem e quando de cada mudança de status. */
  historicoStatus: MudancaStatusOcorrencia[]
  anexos: string[]
  eventoIds: string[]
}
