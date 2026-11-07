import { DIA, DIAS_SEMANA_ABREV, hhmmParaMin, inicioDoDia, minutosDoDia, partes } from '../time'
import type { AutorizacaoPrevia, Restricao } from '../types'

// ----- Restrição ------------------------------------------------------------------------------

/** Restrições vigentes (RF-16): não revogadas, não expiradas; as de escopo condomínio só depois de aprovadas. */
export function restricoesVigentes(
  rs: readonly Restricao[],
  pessoaId: string,
  unidadeId: string | null,
  agora: number,
): Restricao[] {
  // Restrição de condomínio vale mesmo sem unidade de destino (ex.: funcionário em escala).
  return rs.filter((r) => {
    if (r.pessoaId !== pessoaId || r.revogadaEm !== null || agora > r.validaAte) return false
    if (r.escopo === 'condominio') return r.aprovadaEm !== null
    return unidadeId !== null && r.unidadeId === unidadeId
  })
}

// ----- Autorização prévia ---------------------------------------------------------------------

export type EstadoAutorizacao =
  'valida' | 'fora_da_janela' | 'expirada' | 'ainda_nao_vale' | 'revogada'

/** Considera validade (data) e janela (dias da semana + horário) usando o relógio informado. */
export function estadoAutorizacaoPrevia(ap: AutorizacaoPrevia, agora: number): EstadoAutorizacao {
  if (ap.revogadaEm !== null) return 'revogada'
  if (agora > ap.validaAte) return 'expirada'
  if (agora < ap.validaDe) return 'ainda_nao_vale'
  const p = partes(agora)
  if (ap.diasSemana && !ap.diasSemana.includes(p.dow)) return 'fora_da_janela'
  if (ap.horaInicio && ap.horaFim) {
    const m = minutosDoDia(agora)
    if (m < hhmmParaMin(ap.horaInicio) || m > hhmmParaMin(ap.horaFim)) return 'fora_da_janela'
  }
  return 'valida'
}

export interface JanelaAutorizacao {
  inicio: number
  fim: number
}

/**
 * Primeira janela da autorização que intersecta [agora, agora + horizonteMs], no fuso de São Paulo (o mesmo de
 * `estadoAutorizacaoPrevia`). `inicio`/`fim` são os limites reais da janela (já recortados por validaDe/validaAte), sem
 * recorte em `agora`: janela em curso devolve `inicio <= agora`. O fim do horário é inclusivo até o fim do minuto, como
 * em `estadoAutorizacaoPrevia`. Sem horário, a janela é o dia inteiro. Revogada, expirada ou sem dia que case: null.
 * Janela que vira a meia-noite (horaFim < horaInicio) não existe (a API a recusa): devolve null.
 */
export function proximaJanelaAutorizacao(
  ap: AutorizacaoPrevia,
  agora: number,
  horizonteMs: number,
): JanelaAutorizacao | null {
  if (ap.revogadaEm !== null || horizonteMs < 0) return null
  const limite = agora + horizonteMs
  const comHora = !!(ap.horaInicio && ap.horaFim)
  const hIni = comHora ? hhmmParaMin(ap.horaInicio!) : 0
  const hFim = comHora ? hhmmParaMin(ap.horaFim!) : 0
  if (comHora && hFim < hIni) return null
  for (let dia = inicioDoDia(agora); dia <= limite; dia += DIA) {
    if (ap.diasSemana && !ap.diasSemana.includes(partes(dia).dow)) continue
    const ini = Math.max(comHora ? dia + hIni * 60_000 : dia, ap.validaDe)
    const fim = Math.min(comHora ? dia + hFim * 60_000 + 59_999 : dia + DIA - 1, ap.validaAte)
    if (ini <= fim && ini <= limite && fim >= agora) return { inicio: ini, fim }
  }
  return null
}

const hAbrev = (s: string) => {
  const [h, m] = s.split(':')
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`
}

/** "seg a sex, 8h–18h" */
export function descreverJanela(
  ap: Pick<AutorizacaoPrevia, 'diasSemana' | 'horaInicio' | 'horaFim'>,
): string {
  let dias = 'todos os dias'
  const d = ap.diasSemana
  if (d && d.length > 0 && d.length < 7) {
    const ord = [...d].sort((a, b) => a - b)
    const contiguo = ord.every((x, i) => i === 0 || x === ord[i - 1]! + 1)
    dias =
      contiguo && ord.length > 2
        ? `${DIAS_SEMANA_ABREV[ord[0]!]} a ${DIAS_SEMANA_ABREV[ord[ord.length - 1]!]}`
        : ord.map((x) => DIAS_SEMANA_ABREV[x]).join(', ')
  }
  const horas =
    ap.horaInicio && ap.horaFim ? `, ${hAbrev(ap.horaInicio)}–${hAbrev(ap.horaFim)}` : ''
  return dias + horas
}

/** "15h–17h" (para a mensagem de fora do horário). */
export const descreverHorario = (ap: Pick<AutorizacaoPrevia, 'horaInicio' | 'horaFim'>) =>
  ap.horaInicio && ap.horaFim
    ? `${hAbrev(ap.horaInicio)}–${hAbrev(ap.horaFim)}`
    : 'sem horário definido'
