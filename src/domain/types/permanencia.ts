// ----- Tempo de permanência (prazo por tipo de visita, spec §14 2026-10-23) ----------------------------------------
// Fica FORA da cadeia de hash: tabela `permanencia` (append-only, à parte do evento_acesso). Só visitante e prestador.

export type TipoVisita = 'visita' | 'entrega' | 'transporte_app' | 'servico'
export const TIPOS_VISITA: readonly TipoVisita[] = [
  'visita',
  'entrega',
  'transporte_app',
  'servico',
]
export const ROTULO_TIPO_VISITA: Record<TipoVisita, string> = {
  visita: 'Visita',
  entrega: 'Entregador',
  transporte_app: 'Motorista de app',
  servico: 'Serviço',
}

/** Prazo vigente de uma entrada (a linha mais recente da `permanencia`). */
export interface PermanenciaView {
  tipoVisita: TipoVisita
  /** Epoch ms. */
  prazoAte: number
  /** Quantas prorrogações já foram feitas (0 = só o prazo da entrada). */
  prorrogacoes: number
}
