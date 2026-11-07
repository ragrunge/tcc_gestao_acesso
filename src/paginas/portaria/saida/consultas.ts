import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/api'
import { CHAVES, useDebounce } from '@/app/consultas'
import { digitosCpf } from './regras'

// CPF parcial ou completo: a busca de pessoas existente, com o termo no corpo (a chave fica só na memória).
export function useBuscaPorCpf(q: string) {
  const api = useApi()
  const cpf = digitosCpf(q)
  const cpfDebounce = useDebounce(cpf, 200)
  const porCpf = useQuery({
    queryKey: CHAVES.pessoasSaida(cpfDebounce ?? ''),
    queryFn: () => api.pessoas.buscar(cpfDebounce!, { limite: 50 }),
    enabled: !!cpfDebounce && cpfDebounce === cpf,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })
  const docPorPessoa = useMemo(
    () => new Map((cpf && porCpf.data ? porCpf.data : []).map((p) => [p.id, p.documentoMascarado])),
    [cpf, porCpf.data],
  )
  const buscandoCpf = !!cpf && (cpfDebounce !== cpf || porCpf.isFetching)
  return { cpf, porCpf, docPorPessoa, buscandoCpf }
}
