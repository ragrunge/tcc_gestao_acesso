import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function BarraFiltros({
  children,
  ativos,
  onLimpar,
  principal,
  principalAtivo = false,
  rotulo = 'Filtros',
  resultado,
}: {
  children?: ReactNode
  /** Quantos filtros diferem do padrão (inclui o principal, se preenchido). */
  ativos: number
  onLimpar: () => void
  /** Campo sempre visível no celular (normalmente a busca). */
  principal?: ReactNode
  /** O principal está preenchido: não entra na contagem do botão "Filtros (n)", que só fala do que está escondido. */
  principalAtivo?: boolean
  rotulo?: string
  /** Contagem do resultado dentro do cartão, à direita, antes do "Limpar filtros" (ex.: `ContagemResultado`). */
  resultado?: ReactNode
}) {
  const painel = useId()
  // Começa aberto no celular se já há filtro aplicado (ex.: voltou de outra tela com a URL filtrada)
  const [aberto, setAberto] = useState(() => ativos > 0)
  const escondidos = Math.max(0, ativos - (principalAtivo ? 1 : 0))
  return (
    <form
      role="search"
      aria-label={rotulo}
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[10px] border border-[#DCE1E5] bg-white px-4 py-4 sm:px-5"
    >
      <div className="flex w-full items-end gap-2 md:contents">
        {principal && <div className="min-w-0 flex-1 md:flex-none">{principal}</div>}
        {children && (
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={painel}
            onClick={() => setAberto(!aberto)}
            className="inline-flex h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-[#B9C3CA] bg-white px-3 text-[14px] font-medium text-[#33424B] hover:border-[#0B5563] md:hidden"
          >
            {escondidos > 0 ? `Filtros (${escondidos})` : 'Filtros'}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      </div>
      <div
        id={painel}
        className={`${(aberto || !children) && !(!children && ativos === 0) ? 'flex' : 'hidden'} w-full flex-col gap-3 md:contents`}
      >
        {children}
        {ativos > 0 && (
          <button
            type="button"
            onClick={onLimpar}
            className={`h-[44px] self-start px-1 text-[14px] font-semibold text-[#0B5563] hover:underline md:order-2 md:self-end md:mouse:h-10 ${resultado ? '' : 'md:ml-auto'}`}
          >
            Limpar filtros ({ativos})
          </button>
        )}
      </div>
      {resultado && (
        <div className="flex w-full items-center md:order-1 md:ml-auto md:w-auto md:self-end md:mouse:h-10">
          {resultado}
        </div>
      )}
    </form>
  )
}
