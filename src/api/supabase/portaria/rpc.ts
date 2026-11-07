import { ApiError, type Pagina, type PosicaoTrilha } from '@/api/types'
import type { Database } from '@/integrations/supabase/type'

type FuncoesApi = Database['api']['Functions']
export type NomeRpc = keyof FuncoesApi
// As chaves dos argumentos vêm do banco (parâmetro renomeado numa migração quebra o tsc); os valores seguem livres: quase toda RPC recebe um jsonb.
export type ArgsRpc<K extends NomeRpc> = { [A in keyof FuncoesApi[K]['Args']]?: unknown }
export type Rpc = <T, K extends NomeRpc = NomeRpc>(nome: K, args?: ArgsRpc<K>) => Promise<T>

export const respostaInvalida = () =>
  new ApiError(502, 'RESPOSTA_INVALIDA', 'Resposta inesperada do servidor.')
export const naoMigrado = (op: string) => () =>
  Promise.reject(
    new ApiError(501, 'NAO_MIGRADO', `Função ainda não disponível nesta versão (${op}).`),
  )

/** Limite de páginas por listagem completa (como o cliente HTTP antigo): só impede laço infinito. */
const MAX_PAGINAS = 20
export const lista = <T>(x: unknown, f: (y: T) => T = (y) => y): T[] => {
  if (!Array.isArray(x)) throw respostaInvalida()
  return (x as T[]).map(f)
}
export function paginaDe<T>(x: unknown, f: (y: T) => T = (y) => y): Pagina<T> {
  const p = x as {
    itens?: unknown
    cursor?: unknown
    temMais?: unknown
    total?: unknown
    ateSeq?: unknown
  } | null
  if (!p || !Array.isArray(p.itens) || typeof p.temMais !== 'boolean') throw respostaInvalida()
  if (p.total !== undefined && p.total !== null && (typeof p.total !== 'number' || p.total < 0))
    throw respostaInvalida()
  return {
    itens: (p.itens as T[]).map(f),
    cursor: typeof p.cursor === 'string' ? p.cursor : null,
    temMais: p.temMais,
    total: typeof p.total === 'number' ? p.total : null,
    ...(typeof p.ateSeq === 'number' ? { ateSeq: p.ateSeq } : {}),
  }
}
/** Corpo da posição da página: cursor OU deslocamento (o banco recusa os dois), e o ateSeq das trilhas. */
export function posicao(f: PosicaoTrilha, padrao = 50): Record<string, unknown> {
  const desl = f.cursor ? undefined : f.deslocamento
  return semIndefinidos({
    limite: f.limite ?? padrao,
    cursor: f.cursor || undefined,
    deslocamento: desl,
    ateSeq: desl !== undefined ? f.ateSeq : undefined,
  })
}
/** Contagem não negativa de um resumo do banco (o resto é recusado como resposta inválida). */
export function contagem(x: unknown): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) throw respostaInvalida()
  return x
}
export const contagens = <K extends string>(
  x: unknown,
  chaves: readonly K[],
): Record<K, number> => {
  if (!x || typeof x !== 'object') throw respostaInvalida()
  return Object.fromEntries(
    chaves.map((k) => [k, contagem((x as Record<string, unknown>)[k])]),
  ) as Record<K, number>
}
/** Corpo sem as chaves `undefined`. */
export const semIndefinidos = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
/** Percorre a listagem por cursor até `temMais` falso (a interface devolve a lista inteira). */
export async function todas<T>(
  pagina: (cursor: string | null) => Promise<Pagina<T>>,
  mensagem: string,
): Promise<T[]> {
  const itens: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const p = await pagina(cursor)
    itens.push(...p.itens)
    if (!p.temMais || !p.cursor) return itens
    cursor = p.cursor
  }
  throw new ApiError(502, 'PAGINACAO_EXCEDIDA', mensagem)
}
