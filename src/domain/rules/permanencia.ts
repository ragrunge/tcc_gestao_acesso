import { HORA, fmtDuracao, fmtHora, hhmmParaMin, inicioDoDia } from '../time'
import type { CategoriaPessoa, PermanenciaView, TipoVisita } from '../types'
import type { ErroRegra } from './comum'
import { e422 } from './interno'

export const HORAS_PERMANENCIA_ALERTA = 8
export const permanenciaExcedida = (entradaEm: number, agora: number) =>
  agora - entradaEm > HORAS_PERMANENCIA_ALERTA * 3600 * 1000
// ----- Tempo de permanência por tipo de visita (tabela `permanencia`, FORA da cadeia de hash) -------------------------
// Decisão de 2026-10-23 (spec §14): o prazo é definido na entrada pelo tipo de visita e prorrogado em "+1h" pela
// portaria. Fica numa tabela append-only à parte (migração 0011): o evento_acesso, a canonização e o hash não mudam.
// Só visitante e prestador têm prazo; morador e funcionário não. `permanenciaExcedida` (8 h fixas) continua valendo
// para quem não tem prazo gravado (entradas de antes da migração), para a tela não perder o alerta.

/** Prazo padrão por tipo de visita, em minutos. */
export const PRAZO_PADRAO_MIN: Record<TipoVisita, number> = {
  visita: 240,
  entrega: 30,
  transporte_app: 15,
  servico: 480,
}
/** "+1h": cada prorrogação. */
export const PRORROGACAO_MIN = 60
/** Máximo de prorrogações por entrada (espelhado no CHECK `permanencia_ordem_ck` da migração 0011). */
export const MAX_PRORROGACOES = 4
/** Teto do prazo contado da hora da entrada (espelhado no trigger `permanencia_antes_inserir` da migração 0011). */
export const PERMANENCIA_MAXIMA_MS = 12 * HORA
/** A partir de quantos minutos antes do prazo a tela avisa "Vence em X min". */
export const AVISO_VENCIMENTO_MIN = 15

export const temPrazoPermanencia = (c: CategoriaPessoa) => c === 'visitante' || c === 'prestador'
export const tipoVisitaPadrao = (c: CategoriaPessoa): TipoVisita =>
  c === 'prestador' ? 'servico' : 'visita'

/**
 * Prazo da entrada. Serviço com janela de horário (autorização prévia com hora fim): até a hora fim no dia da entrada,
 * se ainda não passou; senão o padrão do tipo. Sempre limitado a PERMANENCIA_MAXIMA_MS desde a entrada.
 */
export function prazoInicial(
  tipo: TipoVisita,
  entradaEm: number,
  horaFimJanela?: string | null,
): number {
  let prazo = entradaEm + PRAZO_PADRAO_MIN[tipo] * 60_000
  if (tipo === 'servico' && horaFimJanela) {
    const fim = inicioDoDia(entradaEm) + hhmmParaMin(horaFimJanela) * 60_000
    if (fim > entradaEm) prazo = fim
  }
  return Math.min(prazo, entradaEm + PERMANENCIA_MAXIMA_MS)
}

export type EstadoPermanencia = 'no_prazo' | 'vence_em_breve' | 'expirado'

export function estadoPermanencia(prazoAte: number, agora: number): EstadoPermanencia {
  if (agora > prazoAte) return 'expirado'
  return prazoAte - agora <= AVISO_VENCIMENTO_MIN * 60_000 ? 'vence_em_breve' : 'no_prazo'
}

/** Texto para a tela: "Vence em 12min", "Expirado há 1h 05min" ou "Até 15:30". Minutos arredondados para cima no aviso. */
export function descreverPermanencia(prazoAte: number, agora: number): string {
  const estado = estadoPermanencia(prazoAte, agora)
  if (estado === 'expirado') return `Expirado há ${fmtDuracao(agora - prazoAte)}`
  if (estado === 'vence_em_breve')
    return `Vence em ${fmtDuracao(Math.ceil((prazoAte - agora) / 60_000) * 60_000)}`
  return `Até ${fmtHora(prazoAte)}`
}

/**
 * Próximo prazo de uma prorrogação "+1h": a partir do prazo vigente, ou de agora se ele já venceu (o porteiro dá mais
 * uma hora a quem está lá dentro), limitado ao teto de 12 h desde a entrada. Recusa a partir da 4ª prorrogação ou
 * quando o teto já foi alcançado. "Ainda está dentro" é conferido pela API e pelo banco, não aqui.
 */
export function proximaProrrogacao(
  p: { entradaEm: number } & Pick<PermanenciaView, 'prazoAte' | 'prorrogacoes'>,
  agora: number,
): { ok: true; prazoAte: number } | { ok: false; erro: ErroRegra } {
  if (p.prorrogacoes >= MAX_PRORROGACOES) {
    return {
      ok: false,
      erro: e422(
        'PRORROGACAO_LIMITE',
        `Limite de ${MAX_PRORROGACOES} prorrogações atingido para esta entrada.`,
      ),
    }
  }
  const teto = p.entradaEm + PERMANENCIA_MAXIMA_MS
  const novo = Math.min(Math.max(p.prazoAte, agora) + PRORROGACAO_MIN * 60_000, teto)
  if (novo <= p.prazoAte || novo <= agora) {
    return {
      ok: false,
      erro: e422(
        'PRORROGACAO_LIMITE',
        `A permanência já chegou ao máximo de ${PERMANENCIA_MAXIMA_MS / HORA} h desde a entrada.`,
      ),
    }
  }
  return { ok: true, prazoAte: novo }
}
