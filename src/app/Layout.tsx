import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { pode } from '@/domain/rbac'
import { useArmadilhaDeFoco } from '@/componentes/Modal'
import { FichaPessoaModal } from '@/paginas/cadastro/FichaPessoaModal'
import { CHAVES, useContagemPendentes } from './consultas'
import { useTituloPagina } from './titulo'
import { BarraTopo } from './layout/BarraTopo'
import { MenuLateral } from './layout/MenuLateral'
import { ROTULO_ROTA } from './layout/navegacao'
import { useAtalhosGlobais } from './layout/useAtalhosGlobais'

export function Layout() {
  const { usuario, sair } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const qc = useQueryClient()
  const [fichaId, setFichaId] = useState<string | null>(null)
  // Menu em gaveta no celular/tablet (< lg). No desktop o menu é a coluna fixa e este estado não tem efeito.
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef<HTMLElement>(null)
  const fecharMenu = () => setMenuAberto(false)
  const papel = usuario!.papel
  useTituloPagina(ROTULO_ROTA.get(loc.pathname.split('/')[1] ?? ''))

  const pend = useContagemPendentes(pode(papel, 'vinculo.decidir'))
  // Recontar a cada navegação (a decisão de um vínculo acontece em outra tela); a primeira carga já é do useQuery.
  const primeiraRota = useRef(true)
  useEffect(() => {
    if (primeiraRota.current) {
      primeiraRota.current = false
      return
    }
    void qc.invalidateQueries({ queryKey: CHAVES.vinculosPendentes })
  }, [loc.pathname, qc])

  // Trocou de rota ou a tela cresceu até o desktop: a gaveta fecha.
  useEffect(() => {
    setMenuAberto(false)
  }, [loc.pathname])
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const aoMudar = () => {
      if (mq.matches) setMenuAberto(false)
    }
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])
  // Gaveta aberta: foco preso, Esc fecha e o foco volta ao botão do menu (mesma armadilha dos modais).
  useArmadilhaDeFoco(menuRef, fecharMenu, menuAberto)

  // Atalhos globais (RNF-07): F2 nova entrada, F3 encomenda, F4 ocorrência, F8 saída.
  useAtalhosGlobais(papel, nav)

  return (
    <div className="app-raiz grid h-dvh h-screen grid-cols-[minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-[#0B5563] shadow-cartao focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      {menuAberto && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(12,22,28,0.58)] xl:hidden"
          onClick={fecharMenu}
          aria-hidden
        />
      )}
      <aside
        ref={menuRef}
        id="menu-principal"
        tabIndex={-1}
        aria-label="Menu principal"
        className={`sobre-escuro ${menuAberto ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-50 w-[288px] max-w-[85vw] flex-col gap-[18px] overflow-auto bg-[#10262C] px-3 py-5 text-[#C8D3D7] xl:static xl:z-auto xl:flex xl:w-auto xl:max-w-none`}
      >
        <MenuLateral
          usuario={usuario!}
          menuAberto={menuAberto}
          fecharMenu={fecharMenu}
          pendentes={pend.data}
        />
      </aside>

      <div className="flex h-dvh h-screen min-w-0 flex-col">
        <BarraTopo
          usuario={usuario!}
          menuAberto={menuAberto}
          onAbrirMenu={() => setMenuAberto(true)}
          onPessoa={setFichaId}
          onSair={() => {
            void sair().then((ok) => {
              if (ok) nav('/login')
            })
          }}
        />
        <main
          className="relative flex-1 overflow-auto px-4 pb-14 pt-5 focus:outline-none md:px-8 md:pt-7"
          id="conteudo"
          tabIndex={-1}
        >
          {/* Transição só do conteúdo (150 ms, sem bloquear foco nem teclado); a chave é a seção, para filtros e detalhes não reanimarem */}
          <div key={loc.pathname.split('/')[1]} className="entrada-tela">
            <Outlet />
          </div>
        </main>
      </div>
      {fichaId && <FichaPessoaModal id={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  )
}
