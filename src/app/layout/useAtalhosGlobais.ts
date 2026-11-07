import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { pode } from '@/domain/rbac'
import type { Papel } from '@/domain/types'
import { temModalAberto } from '@/componentes/Modal'

// Atalhos globais (RNF-07): F2 nova entrada, F3 encomenda, F4 ocorrência, F8 saída. F8 e não F6: no navegador o F6
// leva o foco para a barra de endereço (F5 recarrega, F7 navegação por cursor), e o preventDefault não o segura sempre.
export function useAtalhosGlobais(papel: Papel, nav: NavigateFunction) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (temModalAberto()) return
      if (e.key === 'F2' && pode(papel, 'evento.registrar')) {
        e.preventDefault()
        nav('/entrada')
      } else if (e.key === 'F8' && pode(papel, 'evento.registrar')) {
        e.preventDefault()
        nav('/saida')
      } else if (e.key === 'F3' && pode(papel, 'encomenda.operar')) {
        e.preventDefault()
        nav('/encomendas?novo=1')
      } else if (e.key === 'F4' && pode(papel, 'ocorrencia.operar')) {
        e.preventDefault()
        nav('/ocorrencias?novo=1')
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [papel, nav])
}
