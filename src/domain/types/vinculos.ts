export type TipoVinculo = 'proprietario' | 'inquilino' | 'dependente'
export const ROTULO_VINCULO: Record<TipoVinculo, string> = {
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
  dependente: 'Dependente',
}
export type StatusVinculo = 'pendente' | 'aprovado' | 'rejeitado' | 'encerrado' | 'legado'
export const ROTULO_STATUS_VINCULO: Record<StatusVinculo, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  encerrado: 'Encerrado',
  legado: 'Legado',
}

/** Tipo do comprovante de vínculo conferido pela administração (RF-05; enum tipo_comprovante do banco). */
export type TipoComprovante = 'escritura' | 'contrato_compra_venda' | 'contrato_locacao' | 'outro'
export const ROTULO_COMPROVANTE: Record<TipoComprovante, string> = {
  escritura: 'Escritura',
  contrato_compra_venda: 'Contrato de compra e venda',
  contrato_locacao: 'Contrato de locação',
  outro: 'Outro',
}
/**
 * Registro da conferência do comprovante (RF-05). O arquivo NÃO é guardado (LGPD art. 6º, III): só tipo, data e
 * quem conferiu. `observacao` é curta e sem dado pessoal (nada de CPF, telefone ou nome de terceiro).
 * Colunas conferencia_* de vinculo_unidade.
 */
export interface ConferenciaComprovante {
  tipoDocumento: TipoComprovante
  /** Obrigatória se, e somente se, tipoDocumento = 'outro'. */
  descricao?: string
  /** Início do dia (BRT) em que o comprovante foi conferido. */
  data: number
  conferidoPorId: string
  observacao?: string
}

export interface VinculoUnidade {
  id: string
  pessoaId: string
  unidadeId: string
  tipo: TipoVinculo
  status: StatusVinculo
  vigenciaInicio: number | null
  vigenciaFim: number | null // null = indeterminada
  prazoRegularizacao: number | null // obrigatório se legado (RN-09)
  /** Conferência do comprovante (RF-05). Obrigatória para aprovar e para regularizar legado (RN-02, RN-09). */
  conferencia: ConferenciaComprovante | null
  /** Origem do pedido em texto (ex.: "a pedido de Carla Mendes"). Quem registrou é `registradoPorId`. */
  solicitadoPor: string
  solicitadoEm: number
  /** Usuário que registrou o vínculo (no legado, quem executou a importação). */
  registradoPorId: string
  importacaoId?: string
  nota?: string
  decididoPorId?: string
  decididoEm?: number
  justificativa?: string
  /** Preenchido se, e somente se, encerrado (RF-07; marco da retenção do morador). */
  encerradoEm: number | null
}
