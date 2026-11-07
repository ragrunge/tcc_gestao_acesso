import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/api'
import { CHAVES } from '@/app/consultas'
import { HORAS_PREVISTOS } from '../previstos'

// Registrar entrada, saída ou correção em outra tela invalida estas chaves (APOS_EVENTO)
export function usePainelConsultas() {
  const api = useApi()
  const resumo = useQuery({
    queryKey: CHAVES.turno,
    queryFn: () => api.turno.resumo(),
    staleTime: 0,
  })
  const eventos = useQuery({
    queryKey: CHAVES.eventosUltimos,
    staleTime: 0,
    queryFn: async () =>
      (await api.eventos.listarPagina({ limite: 10, excluirTipos: ['saida'] })).itens,
  })
  const previas = useQuery({
    queryKey: CHAVES.autorizacoesHoje,
    queryFn: () => api.autorizacoes.hoje(),
    staleTime: 0,
  })
  const previstos = useQuery({
    queryKey: CHAVES.autorizacoesPrevistas(HORAS_PREVISTOS),
    queryFn: () => api.autorizacoes.previstas(HORAS_PREVISTOS),
    staleTime: 0,
    refetchInterval: 60000,
  })
  // Atrasadas pela contagem da API (sem carregar a fila)
  const encs = useQuery({
    queryKey: CHAVES.encomendasResumo,
    queryFn: () => api.encomendas.resumo(),
    staleTime: 0,
  })
  const pendentes = useQuery({
    queryKey: CHAVES.restricoesPendentes,
    queryFn: () => api.restricoes.pendentes(),
    staleTime: 0,
  })
  return { resumo, eventos, previas, previstos, encs, pendentes }
}

export type PainelConsultas = ReturnType<typeof usePainelConsultas>
