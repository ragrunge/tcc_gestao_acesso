import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { useApi, type UsuarioSessao } from '@/api'
import { rotaDisponivel } from '@/auth/AuthContext'
import { ROTULO_PAPEL } from '@/domain/types'
import { Marca } from '@/componentes/Marca'
import { GRUPOS } from './navegacao'

export function MenuLateral({
  usuario,
  menuAberto,
  fecharMenu,
  pendentes,
}: {
  usuario: UsuarioSessao
  menuAberto: boolean
  fecharMenu: () => void
  pendentes: number | undefined
}) {
  const api = useApi()
  const papel = usuario.papel
  return (
    <>
      {/* Só montado com a gaveta aberta: no desktop não duplica nome/botão no DOM (leitor de tela e testes). */}
      {menuAberto && (
        <div className="flex items-start justify-between gap-2 xl:hidden">
          <div className="min-w-0 px-[10px]">
            <div className="truncate font-semibold text-white">{usuario.nome}</div>
            <div className="text-[13px] text-[#9FB1B7]">{ROTULO_PAPEL[papel]}</div>
          </div>
          <button
            type="button"
            onClick={fecharMenu}
            aria-label="Fechar menu"
            className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg text-white hover:bg-[#1E4952]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex items-center gap-[10px] px-[10px] pb-2 pt-1">
        <Marca tamanho={34} />
        <div className="leading-[1.2]">
          <div className="text-[14px] font-semibold text-white">Gestão de Acesso</div>
          <div className="text-[12px] text-[#9FB1B7]">
            {usuario.condominio?.nome ?? 'Controle de acesso'}
          </div>
        </div>
      </div>
      {GRUPOS.map((g) => {
        const itens = g.itens.filter(
          (i) => rotaDisponivel(usuario, i.rota) && api.suporta?.(i.rota) !== false,
        )
        if (itens.length === 0) return null
        return (
          <nav key={g.titulo} aria-label={g.titulo} className="flex flex-col gap-0.5">
            <div className="px-3 pb-[6px] pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8DA2A9]">
              {g.titulo}
            </div>
            {itens.map((i) => (
              <NavLink
                key={i.rota}
                to={`/${i.rota}`}
                onClick={fecharMenu}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center justify-between gap-2 rounded-md border-l-[3px] py-0 pl-[10px] pr-3 text-[14.5px] hover:text-white lg:mouse:min-h-[40px] ${
                    isActive
                      ? 'border-[#6CCBD8] bg-[#1E4952] text-white'
                      : 'border-transparent text-[#C8D3D7]'
                  }`
                }
              >
                <span>{i.rotulo}</span>
                {i.contador && (pendentes ?? 0) > 0 && (
                  <span
                    className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#F79009] px-[7px] text-[12px] font-bold text-[#1A1204]"
                    aria-label={`${pendentes} pendentes`}
                  >
                    {pendentes}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )
      })}
      <div className="mt-auto px-3 text-[12px] leading-[1.5] text-[#8DA2A9]">
        Projeto acadêmico · TCC
      </div>
    </>
  )
}
