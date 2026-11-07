import { useEffect, useState } from 'react'
import type { VinculoView } from '@/api'
import { useToast } from '@/componentes/Toast'
import { MIN_JUSTIFICATIVA } from '@/domain/rules'
import { fromInput } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'
import { useAcoesVinculo } from './consultas'

/** Estado e ações do painel de decisão (aprovar, rejeitar, regularizar, encerrar) do vínculo em foco. */
export function useDecisaoVinculo(
  atual: VinculoView | undefined,
  recarregar: () => Promise<unknown>,
  aoConcluir: () => void,
) {
  const acoes = useAcoesVinculo()
  const { avisar } = useToast()
  const [fimInquilino, setFimInquilino] = useState('')
  const [rejeitando, setRejeitando] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [just, setJust] = useState('')
  const [motivo, setMotivo] = useState('')
  const [dataEnc, setDataEnc] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setRejeitando(false)
    setEncerrando(false)
    setJust('')
    setMotivo('')
    setDataEnc('')
    setErro('')
    setFimInquilino('')
  }, [atual?.id])

  async function executar(fn: () => Promise<unknown>, texto: string, tom?: 'verde' | 'ambar') {
    setSalvando(true)
    setErro('')
    try {
      await fn()
      avisar({ ...(tom ? { tom } : {}), texto })
      setRejeitando(false)
      setEncerrando(false)
      setJust('')
      setMotivo('')
      aoConcluir()
      await recarregar()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  const regularizar = () =>
    atual &&
    executar(
      () =>
        acoes.regularizar(
          atual.id,
          fimInquilino ? { vigenciaFim: fromInput(fimInquilino) } : undefined,
        ),
      `Vínculo legado de ${atual.pessoaNome} (${atual.unidadeCodigo}) regularizado: agora está aprovado.`,
    )
  const decidir = (decisao: 'aprovar' | 'rejeitar') =>
    atual &&
    executar(
      () => acoes.decidir({ id: atual.id, decisao, justificativa: just }),
      `Vínculo de ${atual.pessoaNome} (${atual.unidadeCodigo}) ${decisao === 'aprovar' ? 'aprovado' : 'rejeitado'}. A decisão e a justificativa ficam registradas.`,
      decisao === 'aprovar' ? 'verde' : 'ambar',
    )
  const encerrar = () =>
    atual &&
    executar(
      () =>
        acoes.encerrar(atual.id, {
          motivo,
          ...(dataEnc ? { data: fromInput(dataEnc)! } : {}),
        }),
      `Vínculo de ${atual.pessoaNome} (${atual.unidadeCodigo}) encerrado. Deixa de valer para acesso; o histórico é mantido.`,
      'ambar',
    )

  return {
    fimInquilino,
    setFimInquilino,
    rejeitando,
    setRejeitando,
    encerrando,
    setEncerrando,
    just,
    setJust,
    motivo,
    setMotivo,
    dataEnc,
    setDataEnc,
    erro,
    setErro,
    salvando,
    regularizar,
    decidir,
    encerrar,
    conferido: !!atual?.conferencia,
    justOk: just.trim().length > 0,
    motivoOk: motivo.trim().length >= MIN_JUSTIFICATIVA,
  }
}

export type DecisaoVinculo = ReturnType<typeof useDecisaoVinculo>
