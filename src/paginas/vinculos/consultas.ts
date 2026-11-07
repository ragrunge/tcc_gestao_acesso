import { useQuery } from '@tanstack/react-query'
import { useApi, type Api, type VinculoView } from '@/api'
import { CHAVES } from '@/app/consultas'
import { usePaginacao } from '@/app/paginacao'
import { FILAS, type Aba } from './regras'

type ApiVinculos = Api['vinculos']

export function useFilaVinculos(aba: Aba) {
  const api = useApi()
  return usePaginacao<VinculoView>({
    chave: CHAVES.vinculosFila(aba),
    buscar: (pos) => api.vinculos.listarPagina({ ...FILAS[aba], ...pos }),
  })
}

/** Contagens do servidor (nunca da página carregada): legados, vencidos e vínculos válidos por tipo. */
export function useResumoVinculos() {
  const api = useApi()
  return useQuery({
    queryKey: CHAVES.vinculosResumo,
    queryFn: () => api.vinculos.resumo(),
    staleTime: 0,
  })
}

export function useAcoesVinculo() {
  const api = useApi()
  return {
    regularizar: (...a: Parameters<ApiVinculos['regularizar']>) => api.vinculos.regularizar(...a),
    decidir: (dados: Parameters<ApiVinculos['decidir']>[0]) => api.vinculos.decidir(dados),
    encerrar: (...a: Parameters<ApiVinculos['encerrar']>) => api.vinculos.encerrar(...a),
    registrarConferencia: (...a: Parameters<ApiVinculos['registrarConferencia']>) =>
      api.vinculos.registrarConferencia(...a),
    criar: (dados: Parameters<ApiVinculos['criar']>[0]) => api.vinculos.criar(dados),
  }
}
