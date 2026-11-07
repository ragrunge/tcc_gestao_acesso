import { useQuery } from '@tanstack/react-query'
import { useApi, type FiltroEventos, type PaginaEventos } from '@/api'
import { CHAVES } from '@/app/consultas'
import { usePaginacao } from '@/app/paginacao'
import { DIA, agora, inicioDoDia } from '@/domain/time'
import type { EventoView } from '@/domain/types'

/** Porteiros para o filtro: quem registrou nos últimos 40 dias (uma página de até 100 eventos basta para a lista). */
export function useOperadores() {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.operadores,
    queryFn: async () => {
      const p = await api.eventos.listarPagina({ de: inicioDoDia(agora()) - 40 * DIA, limite: 100 })
      return [...new Map(p.itens.map((e) => [e.operadorId, e.operadorNome])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      )
    },
  })
}

/**
 * Páginas numeradas, presas ao ateSeq da página 1 (evento novo não empurra a página 2); a exportação e a verificação
 * não usam a página: percorrem a trilha inteira.
 */
export function useEventosLista(filtro: FiltroEventos) {
  const api = useApi()
  return usePaginacao<EventoView, PaginaEventos>({
    chave: CHAVES.eventosLista(JSON.stringify(filtro)),
    buscar: (pos) => api.eventos.listarPagina({ ...filtro, ...pos }),
    trilha: true,
  })
}

/** A verificação percorre a cadeia inteira: na API real, o resultado vale por 30 s para as próximas gavetas. */
export function useIntegridadeTrilha() {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.integridade,
    queryFn: () => api.auditoria.verificarIntegridade().catch(() => null),
    staleTime: 30_000,
  })
}

export function useCorrecoesDe(ev: EventoView) {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.correcoes(ev.id),
    queryFn: () => api.eventos.correcoesDe(ev.id),
    enabled: ev.tipo !== 'correcao',
  })
}
