import { Ban } from 'lucide-react'
import type { Tom } from '@/componentes/Badge'
import { ROTULO_MEIO, type EventoView, type MeioAutorizacao } from '@/domain/types'

export const TIPOS = ['', 'entrada', 'saida', 'negado', 'recusado', 'correcao'] as const
export const ROTULO_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  negado: 'Negado',
  recusado: 'Recusado',
  correcao: 'Correção',
}
export const MEIOS = ['', ...Object.keys(ROTULO_MEIO)] as ('' | MeioAutorizacao)[]
export const COLUNAS = '136px 104px minmax(0,1fr) 64px minmax(0,1.3fr) 120px 124px'

/** Selo da coluna Evento: o tipo do registro (a autorização vai na coluna ao lado, em texto). */
export const EVENTO: Record<EventoView['tipo'], { texto: string; tom: Tom; icone?: typeof Ban }> = {
  entrada: { texto: 'Entrada', tom: 'verde' },
  saida: { texto: 'Saída', tom: 'neutro' },
  negado: { texto: 'Negado', tom: 'vermelho', icone: Ban },
  recusado: { texto: 'Recusado', tom: 'ambar', icone: Ban },
  correcao: { texto: 'Correção', tom: 'petroleo' },
}
