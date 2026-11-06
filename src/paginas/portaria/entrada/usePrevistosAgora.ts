import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/api'
import { CHAVES } from '@/app/consultas'
import { ANTECEDENCIA_ENTRADA_MS, HORAS_PREVISTOS } from '../previstos'

export function usePrevistosAgora({ retroativo, agora }: { retroativo: boolean; agora: number }) {
  const api = useApi()
  // Os mesmos do Painel: com a busca vazia, escolhe-se com um clique ou com as setas e Enter
  const previstos = useQuery({
    queryKey: CHAVES.autorizacoesPrevistas(HORAS_PREVISTOS),
    queryFn: () => api.autorizacoes.previstas(HORAS_PREVISTOS),
    staleTime: 0,
    enabled: !retroativo,
  })
  const previstosAgora = (previstos.data ?? [])
    .filter((p) => p.inicio - agora <= ANTECEDENCIA_ENTRADA_MS)
    .slice(0, 5)
  const [idxPrevisto, setIdxPrevisto] = useState(0)
  return { previstosAgora, idxPrevisto, setIdxPrevisto }
}
