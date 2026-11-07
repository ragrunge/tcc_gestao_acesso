import { useState } from 'react'
import type { VinculoView } from '@/api'
import { useToast } from '@/componentes/Toast'
import type { TipoComprovante } from '@/domain/types'
import { temNumeroDePessoa } from '@/domain/rules'
import { mensagemErro } from '@/app/useAsync'
import { useAcoesVinculo } from './consultas'

// O rascunho fica aqui, e não no formulário, para sobreviver ao Cancelar/Refazer conferência.
export function useConferenciaComprovante(
  vinculo: VinculoView,
  onRegistrado: () => Promise<unknown>,
) {
  const acoes = useAcoesVinculo()
  const { avisar } = useToast()
  const [editando, setEditando] = useState(!vinculo.conferencia)
  const [tipo, setTipo] = useState<TipoComprovante | ''>('')
  const [descricao, setDescricao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const numeroPessoal = temNumeroDePessoa(`${tipo === 'outro' ? descricao : ''} ${observacao}`)
  const ok =
    !!tipo && confirmado && (tipo !== 'outro' || descricao.trim().length > 0) && !numeroPessoal

  async function registrar() {
    if (!tipo) return
    setSalvando(true)
    setErro('')
    try {
      await acoes.registrarConferencia(vinculo.id, {
        tipo,
        ...(tipo === 'outro' ? { descricao } : {}),
        ...(observacao.trim() ? { observacao } : {}),
      })
      avisar({
        tom: 'verde',
        texto: `Conferência do comprovante de ${vinculo.pessoaNome} registrada. O arquivo não é guardado no sistema.`,
      })
      setEditando(false)
      setConfirmado(false)
      await onRegistrado()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return {
    editando,
    setEditando,
    tipo,
    setTipo,
    descricao,
    setDescricao,
    observacao,
    setObservacao,
    confirmado,
    setConfirmado,
    erro,
    setErro,
    salvando,
    numeroPessoal,
    ok,
    registrar,
  }
}

export type ConferenciaComprovante = ReturnType<typeof useConferenciaComprovante>
