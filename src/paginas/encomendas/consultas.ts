import { useQuery } from '@tanstack/react-query'
import { useApi, type Api, type EncomendaView } from '@/api'
import { CHAVES } from '@/app/consultas'
import { usePaginacao } from '@/app/paginacao'

type ApiEncomendas = Api['encomendas']

export function useEncomendasLista(
  aba: 'aguardando' | 'entregue',
  unidadeId: string | undefined,
  habilitado: boolean,
) {
  const api = useApi()
  return usePaginacao<EncomendaView>({
    chave: CHAVES.encomendasLista(aba, unidadeId),
    buscar: (pos) => api.encomendas.listarPagina({ status: aba, unidadeId, ...pos }),
    habilitado,
  })
}

export function useResumoEncomendas() {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.encomendasResumo,
    queryFn: () => api.encomendas.resumo(),
    staleTime: 0,
  })
}

/** Relida ao abrir a entrega: a linha da lista pode ser anterior a uma autorização recém-registrada. */
export function useEncomendaAtual(id: string) {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.encomenda(id),
    queryFn: () => api.encomendas.obter(id),
    staleTime: 0,
  })
}

export function useAcoesEncomenda() {
  const api = useApi()
  return {
    receber: (dados: Parameters<ApiEncomendas['receber']>[0]) => api.encomendas.receber(dados),
    entregar: (dados: Parameters<ApiEncomendas['entregar']>[0]) => api.encomendas.entregar(dados),
    autorizarRetirada: (dados: Parameters<ApiEncomendas['autorizarRetirada']>[0]) =>
      api.encomendas.autorizarRetirada(dados),
  }
}
