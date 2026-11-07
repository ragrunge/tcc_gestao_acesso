import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi, type PessoaBusca } from '@/api'
import { useCatalogo } from '@/app/catalogo'
import { UUID } from './constantes'

type DestinoPreenchido = { unidade: { bloco: string; numero: string } } | { areaId: string }

export function usePreenchimento({
  escolherPessoaRef,
  aplicarDestino,
}: {
  escolherPessoaRef: MutableRefObject<(p: PessoaBusca) => Promise<void>>
  aplicarDestino: (d: DestinoPreenchido) => void
}) {
  const api = useApi()
  const catalogo = useCatalogo()
  const [params, setParams] = useSearchParams()

  // Pré-preenchimento vindo do painel ("Registrar entrada" em Previstos): ?pessoa=<uuid>&unidade=<uuid> ou &area=<uuid>.
  // Usa os mesmos caminhos da seleção manual (escolherPessoa + bloco/número ou área); qualquer falha é ignorada e a
  // tela fica vazia. Os parâmetros são consumidos (replace, mantendo `retroativo`) para um reload não repetir.
  const prefillFeito = useRef(false)
  useEffect(() => {
    if (prefillFeito.current || !catalogo.pronto) return
    const pid = params.get('pessoa'),
      uid = params.get('unidade'),
      aid = params.get('area')
    if (!pid && !uid && !aid) return
    prefillFeito.current = true
    const prox = new URLSearchParams(params)
    ;['pessoa', 'unidade', 'area'].forEach((k) => prox.delete(k))
    setParams(prox, { replace: true })
    void preencherRef.current(pid, uid, aid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo.pronto, params])

  /** Pessoa + unidade (ou área comum) de um previsto: vem do painel (URL) ou da lista de previstos desta tela. */
  const preencherRef = useRef<
    (pid: string | null, uid: string | null, aid: string | null) => Promise<void>
  >(async () => undefined)
  preencherRef.current = async (pid, uid, aid) => {
    if (
      !pid ||
      !UUID.test(pid) ||
      (uid ? !UUID.test(uid) : false) ||
      (aid ? !UUID.test(aid) : false) ||
      !!uid === !!aid
    )
      return
    {
      try {
        const ficha = await api.pessoas.ficha(pid)
        if (ficha.pessoa.desativadaEm) return
        // A busca devolve o PessoaBusca completo (vínculos, último acesso) que a seleção manual usa; ela já exclui desativadas
        const achada = (await api.pessoas.buscar(ficha.pessoa.nome, { limite: 50 })).find(
          (x) => x.id === pid,
        )
        if (!achada) return
        const un = uid ? catalogo.porId(uid) : undefined
        const area = aid ? catalogo.areasComuns.find((a) => a.id === aid) : undefined
        if (uid && !un?.ativo) return
        if (aid && (!area?.ativo || achada.categoria !== 'prestador')) return // área comum é só do prestador (RF-36)
        await escolherPessoaRef.current(achada)
        if (un) {
          aplicarDestino({ unidade: { bloco: un.bloco, numero: un.numero } })
        } else if (area) {
          aplicarDestino({ areaId: area.id })
        }
      } catch {
        /* pré-preenchimento é conveniência: falha vira tela vazia */
      }
    }
  }

  return useCallback(
    (pid: string | null, uid: string | null, aid: string | null) =>
      preencherRef.current(pid, uid, aid),
    [],
  )
}
