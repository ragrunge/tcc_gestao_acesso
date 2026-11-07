import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  useApi,
  type Autorizador,
  type AutorizacaoView,
  type PessoaBusca,
  type RestricaoView,
} from '@/api'
import { estadoAutorizacaoPrevia } from '@/domain/rules'
import type { MeioAutorizacao } from '@/domain/types'
import { mensagemErro } from '@/app/useAsync'

type Setter<T> = Dispatch<SetStateAction<T>>

export function useConsultaDestino({
  pessoa,
  unidadeAtual,
  areaAtual,
  emArea,
  agoraRef,
  grupoMeioRef,
  carregandoUnidade,
  setCarregandoUnidade,
  setMeio,
  setResidenteId,
  setErro,
  setNegadoGravado,
  setRestricao,
  setPrevias,
  setAutorizadores,
}: {
  pessoa: PessoaBusca | null
  unidadeAtual: string | null
  areaAtual: string | null
  emArea: boolean
  agoraRef: MutableRefObject<number>
  grupoMeioRef: RefObject<HTMLFieldSetElement>
  carregandoUnidade: boolean
  setCarregandoUnidade: Setter<boolean>
  setMeio: Setter<MeioAutorizacao | null>
  setResidenteId: Setter<string | null>
  setErro: Setter<string>
  setNegadoGravado: Setter<{ eventoId: string; codigo: string } | null>
  setRestricao: Setter<RestricaoView[] | null>
  setPrevias: Setter<AutorizacaoView[]>
  setAutorizadores: Setter<Autorizador[]>
}) {
  const api = useApi()
  const focarMeio = useRef(false)
  /** Onde estava o foco quando a consulta da unidade começou: se o operador já foi para outro campo, não roubamos o foco. */
  const focoAntesDaConsulta = useRef<Element | null>(null)

  // RF-36: prestador em área comum — só restrição de condomínio e autorizações prévias da área (sem morador para autorizar)
  useEffect(() => {
    if (!pessoa || !areaAtual) return
    let vivo = true
    setCarregandoUnidade(true)
    setMeio(null)
    setResidenteId(null)
    setErro('')
    focoAntesDaConsulta.current = document.activeElement
    ;(async () => {
      try {
        const rest = await api.restricoes.verificar(pessoa.id, null)
        if (!vivo) return
        if (rest.restrita) {
          setNegadoGravado(null)
          setRestricao(rest.alertas)
          setCarregandoUnidade(false)
          return
        }
        const aps = await api.autorizacoes.vigentes(pessoa.id, areaAtual, { areaComum: true })
        if (!vivo) return
        setPrevias(aps)
        setAutorizadores([])
        if (
          aps.some((a) => estadoAutorizacaoPrevia(a, agoraRef.current) === 'valida') &&
          !pessoa.semCpf
        )
          setMeio('autorizacao_previa')
        focarMeio.current = true
      } catch (e) {
        if (vivo) setErro(mensagemErro(e))
      } finally {
        if (vivo) setCarregandoUnidade(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoa?.id, areaAtual, api])

  useEffect(() => {
    if (!pessoa || emArea) return
    // Funcionário sem unidade (entrada por escala): só vale restrição do condomínio, verificada logo ao escolher a pessoa
    if (!unidadeAtual) {
      if (pessoa.categoria !== 'funcionario') return
      let vivo = true
      api.restricoes
        .verificar(pessoa.id, null)
        .then((rest) => {
          if (vivo && rest.restrita) {
            setNegadoGravado(null)
            setRestricao(rest.alertas)
          }
        })
        .catch((e) => vivo && setErro(mensagemErro(e)))
      return () => {
        vivo = false
      }
    }
    let vivo = true
    setCarregandoUnidade(true)
    setMeio(null)
    setResidenteId(null)
    setErro('')
    focoAntesDaConsulta.current = document.activeElement
    ;(async () => {
      try {
        const rest = await api.restricoes.verificar(pessoa.id, unidadeAtual)
        if (!vivo) return
        if (rest.restrita) {
          setNegadoGravado(null)
          setRestricao(rest.alertas)
          setCarregandoUnidade(false)
          return
        }
        const [aps, auts] = await Promise.all([
          api.autorizacoes.vigentes(pessoa.id, unidadeAtual),
          api.vinculos.autorizadores(unidadeAtual),
        ])
        if (!vivo) return
        setPrevias(aps)
        setAutorizadores(auts)
        const valida = aps.find((a) => estadoAutorizacaoPrevia(a, agoraRef.current) === 'valida')
        if (valida && !pessoa.semCpf) setMeio('autorizacao_previa')
        focarMeio.current = true
      } catch (e) {
        if (vivo) setErro(mensagemErro(e))
      } finally {
        if (vivo) setCarregandoUnidade(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoa?.id, unidadeAtual, api])

  // Correção 12: após a unidade, o foco vai para "Quem autorizou?"
  useEffect(() => {
    if (!carregandoUnidade && focarMeio.current && (unidadeAtual || areaAtual)) {
      focarMeio.current = false
      const atual = document.activeElement
      const antes = focoAntesDaConsulta.current
      focoAntesDaConsulta.current = null
      // O operador mexeu em outro campo enquanto a unidade carregava (ex.: tipo de visita): não roubar o foco.
      if (antes && atual && atual !== antes && atual !== document.body) return
      const alvo =
        grupoMeioRef.current?.querySelector<HTMLInputElement>(
          'input[type=radio]:checked:not(:disabled)',
        ) ??
        grupoMeioRef.current?.querySelector<HTMLInputElement>('input[type=radio]:not(:disabled)')
      alvo?.focus()
    }
  }, [carregandoUnidade, unidadeAtual, areaAtual, grupoMeioRef])
}
