import { Menu } from 'lucide-react'
import type { UsuarioSessao } from '@/api'
import { pode } from '@/domain/rbac'
import { ROTULO_PAPEL } from '@/domain/types'
import { BuscaGlobal } from './BuscaGlobal'
import { Relogio } from './Relogio'

export function BarraTopo({
  usuario,
  menuAberto,
  onAbrirMenu,
  onPessoa,
  onSair,
}: {
  usuario: UsuarioSessao
  menuAberto: boolean
  onAbrirMenu: () => void
  onPessoa: (id: string) => void
  onSair: () => void
}) {
  const papel = usuario.papel
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#DCE1E5] bg-white px-3 py-2 md:px-6 xl:h-16 xl:flex-nowrap xl:gap-6 xl:py-0">
      <button
        type="button"
        onClick={onAbrirMenu}
        aria-label="Abrir menu"
        aria-expanded={menuAberto}
        aria-controls="menu-principal"
        className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg border border-[#C5CDD3] hover:bg-[#EEF2F4] xl:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1 truncate font-semibold xl:flex-none xl:whitespace-nowrap">
        {usuario.condominio?.nome ?? 'Gestão de Acesso'}
      </div>
      {/* api.busca_global exige pessoa.ver: o administrador do sistema não vê o campo (só daria 403). */}
      {pode(papel, 'pessoa.ver') && (
        <div className="order-last w-full xl:order-none xl:flex xl:w-auto xl:flex-1">
          <BuscaGlobal onPessoa={onPessoa} />
        </div>
      )}
      <div className="flex items-center gap-5 xl:ml-auto">
        <Relogio />
        <div className="hidden h-8 w-px bg-[#DCE1E5] md:block" />
        <div className="hidden leading-tight md:block">
          <div className="font-semibold">{usuario.nome}</div>
          <div className="text-[13px] text-[#56616B]">{ROTULO_PAPEL[papel]}</div>
        </div>
        <button
          type="button"
          onClick={onSair}
          className="h-[44px] rounded-lg border border-[#C5CDD3] bg-white px-[14px] text-[14px] hover:bg-[#EEF2F4] lg:mouse:h-10"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
