import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fromInput } from '@/domain/time'

// Escritas na URL no mesmo instante (ex.: "Limpar filtros" chama período, unidade e selects): o setParams funcional do
// react-router não enfileira, a segunda sobrescreveria a primeira. Este módulo junta as escritas até o fim do tick.
let emEscrita: URLSearchParams | null = null

/**
 * Parâmetros da URL como estado dos filtros. `gravar` troca só as chaves passadas (as demais, como `novo=1`, ficam),
 * com replace (não polui o histórico). `undefined` remove a chave: valor padrão não vai para a URL.
 */
export function useFiltrosUrl() {
  const [params, setParams] = useSearchParams()
  const gravar = useCallback(
    (parte: Record<string, string | undefined>) => {
      const novo = new URLSearchParams(emEscrita ?? window.location.search)
      for (const [k, v] of Object.entries(parte)) {
        if (v === undefined) novo.delete(k)
        else novo.set(k, v)
      }
      emEscrita = novo
      queueMicrotask(() => {
        emEscrita = null
      })
      setParams(novo, { replace: true })
    },
    [setParams],
  )
  return { params, gravar }
}

/** Valor da URL só se for um dos válidos; senão o padrão. */
export const lerOpcao = <T extends string>(
  v: string | null,
  validos: readonly T[],
  padrao: T,
): T => (v !== null && (validos as readonly string[]).includes(v) ? (v as T) : padrao)
/** Valor para a URL: o padrão não vai (URL limpa). */
export const naUrl = (v: string, padrao: string) => (v === padrao ? undefined : v)
export const dataOk = (v: string | null): v is string =>
  v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && fromInput(v) !== null
