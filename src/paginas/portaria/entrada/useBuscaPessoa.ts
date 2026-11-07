import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useApi, type PessoaBusca } from '@/api'
import { dicaBuscaCpf } from '@/domain/cpf'
import { mensagemErro } from '@/app/useAsync'
import { LIMITE_SUGESTOES } from './constantes'

export function useBuscaPessoa({
  ativa,
  escolherPessoaRef,
  setErro,
}: {
  ativa: boolean
  escolherPessoaRef: MutableRefObject<(p: PessoaBusca) => Promise<void>>
  setErro: (msg: string) => void
}) {
  const api = useApi()
  const [query, setQuery] = useState('')
  const [sugestoes, setSugestoes] = useState<PessoaBusca[]>([])
  const [idx, setIdx] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [mais, setMais] = useState(false) // havia mais resultados que o limite da lista
  const enterPendente = useRef(false)
  const dicaCpf = dicaBuscaCpf(query)

  // Busca incremental
  useEffect(() => {
    if (!ativa || query.trim().length < 1) {
      setSugestoes([])
      setMais(false)
      return
    }
    let vivo = true
    setBuscando(true)
    const t = setTimeout(() => {
      api.pessoas
        .buscar(query, { limite: LIMITE_SUGESTOES + 1 })
        .then((r) => {
          if (!vivo) return
          setMais(r.length > LIMITE_SUGESTOES)
          setSugestoes(r.slice(0, LIMITE_SUGESTOES))
          setIdx(0)
          // Enter digitado antes de a lista chegar: escolhe o primeiro resultado
          if (enterPendente.current && r[0]) {
            enterPendente.current = false
            void escolherPessoaRef.current(r[0])
          }
        })
        .catch((e) => vivo && setErro(mensagemErro(e)))
        .finally(() => vivo && setBuscando(false))
    }, 120)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [query, ativa, api, escolherPessoaRef, setErro])

  return {
    query,
    setQuery,
    sugestoes,
    setSugestoes,
    idx,
    setIdx,
    buscando,
    mais,
    enterPendente,
    dicaCpf,
  }
}
