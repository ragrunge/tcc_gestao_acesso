import type { EventoView, TipoEvento } from '@/domain/types'

/**
 * Posição da página: `cursor` (seguir da última linha) ou `deslocamento` (página numerada), nunca os dois. Teto de 100
 * por página no servidor.
 */
export interface PosicaoPagina {
  cursor?: string | null
  limite?: number
  deslocamento?: number
}
/** Nas trilhas (só de inclusão), `ateSeq` da primeira página segura as seguintes contra registro novo. */
export interface PosicaoTrilha extends PosicaoPagina {
  ateSeq?: number
}
/**
 * Página de uma listagem. `total`: linhas que atendem ao filtro (null na trilha de acessos percorrida por cursor).
 * `ateSeq`: só nas trilhas, sem cursor.
 */
export interface Pagina<T> {
  itens: T[]
  cursor: string | null
  temMais: boolean
  total: number | null
  ateSeq?: number
}
/** Página da trilha de acessos: também as contagens por tipo do mesmo filtro (sem cursor). */
export interface PaginaEventos extends Pagina<EventoView> {
  porTipo?: Record<TipoEvento, number>
}
