import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { temModalAberto } from '@/componentes/Modal'

/** Enter confirma e Esc limpa a tela (ou volta ao painel, se nada foi preenchido). Devolve o "Cancelar". */
export function useAtalhosEntrada({
  confirmar,
  pronto,
  algoPreenchido,
  limpar,
}: {
  confirmar: () => Promise<void>
  pronto: boolean
  algoPreenchido: boolean
  limpar: () => void
}) {
  const nav = useNavigate()
  // Correção 13: Enter confirma sempre que o registro estiver completo (exceto em campo de texto longo)
  const confirmarRef = useRef(confirmar)
  confirmarRef.current = confirmar
  const prontoRef = useRef(pronto)
  prontoRef.current = pronto
  const algoRef = useRef(algoPreenchido)
  algoRef.current = algoPreenchido
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (temModalAberto()) return
      const alvo = e.target as HTMLElement
      if (e.key === 'Enter') {
        if (!prontoRef.current || alvo.tagName === 'TEXTAREA' || alvo.id === 'busca-pessoa') return
        e.preventDefault()
        e.stopPropagation()
        void confirmarRef.current()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (algoRef.current) limpar()
        else nav('/painel')
      }
    }
    document.addEventListener('keydown', tecla, true)
    return () => document.removeEventListener('keydown', tecla, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return () => (algoPreenchido ? limpar() : nav('/painel'))
}
