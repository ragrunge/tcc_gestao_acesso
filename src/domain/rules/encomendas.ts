import { DIA } from '../time'

export const DIAS_ENCOMENDA_ATRASADA = 7
// Nunca negativo: o relógio da tela pode estar alguns segundos atrás do registro recém-criado.
export const diasDesde = (ts: number, agora: number) => Math.max(0, Math.floor((agora - ts) / DIA))
export const encomendaAtrasada = (recebidaEm: number, agora: number) =>
  diasDesde(recebidaEm, agora) > DIAS_ENCOMENDA_ATRASADA
