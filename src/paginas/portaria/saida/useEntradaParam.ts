import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EventoView } from '@/domain/types'
import { UUID } from './regras'

// ?entrada=<uuid>: abre a confirmação dessa entrada se ela ainda está entre os presentes. O parâmetro é consumido
// (replace) para um reload não reabrir; inválido é ignorado.
export function useEntradaParam(
  presentes: EventoView[] | undefined,
  onEncontrada: (e: EventoView) => void,
  onAviso: (texto: string) => void,
) {
  const [params, setParams] = useSearchParams()
  const paramFeito = useRef(false)
  useEffect(() => {
    if (paramFeito.current) return
    const id = params.get('entrada')
    if (!id) {
      paramFeito.current = true
      return
    }
    if (!UUID.test(id)) {
      paramFeito.current = true
      limparParam()
      return
    }
    if (!presentes) return
    paramFeito.current = true
    limparParam()
    const e = presentes.find((x) => x.id === id)
    if (e) onEncontrada(e)
    else
      onAviso('Essa entrada não está mais entre os presentes: a saída pode já ter sido registrada.')
    function limparParam() {
      const p = new URLSearchParams(params)
      p.delete('entrada')
      setParams(p, { replace: true })
    }
    // onEncontrada/onAviso são setters de estado estáveis
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams, presentes])
}
