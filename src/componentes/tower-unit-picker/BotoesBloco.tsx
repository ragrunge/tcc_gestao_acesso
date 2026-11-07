import { forwardRef } from 'react'
import { useCatalogo } from '@/app/catalogo'
import { useBlocos, type Variante } from './dados'

const BLOCO_BOTAO: Record<Variante, string> = {
  entrada: 'h-12 w-12 rounded-lg text-[18px]',
  modal: 'h-11 w-11 rounded-lg text-[17px] max-lg:h-[44px] max-lg:w-[44px]',
  lista: 'h-[44px] rounded-md text-[15px] xl:h-9',
}

/** Botões dos blocos com unidade ativa (radiogroup; a tecla do bloco, "A" ou "4", o escolhe). */
export const BotoesBloco = forwardRef<
  HTMLDivElement,
  {
    bloco: string | null
    onEscolher: (b: string) => void
    variante?: Variante
    desabilitado?: boolean
    autoFocus?: boolean
    rotulo?: string
    /** Blocos exibidos (padrão: os que têm unidade ativa no catálogo). */ blocos?: string[]
  }
>(function BotoesBloco(
  { bloco, onEscolher, variante = 'entrada', desabilitado, autoFocus, rotulo, blocos: lista },
  ref,
) {
  const doCatalogo = useBlocos()
  const { agrupamento } = useCatalogo()
  const blocos = lista ?? doCatalogo
  const primeiro = blocos[0]
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={rotulo ?? agrupamento}
      className={
        variante === 'lista'
          ? 'grid grid-cols-5 gap-1 min-[480px]:grid-cols-9'
          : 'flex flex-wrap gap-2'
      }
      onKeyDown={(e) => {
        if (desabilitado || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
        const b = e.key.toUpperCase()
        if (blocos.includes(b)) {
          e.preventDefault()
          onEscolher(b)
        }
      }}
    >
      {blocos.map((b) => {
        const ativo = bloco === b
        return (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={desabilitado}
            tabIndex={ativo || (bloco === null && b === primeiro) ? 0 : -1}
            {...(autoFocus && (ativo || (bloco === null && b === primeiro))
              ? { 'data-autofocus': true }
              : {})}
            onClick={() => onEscolher(b)}
            className={`border font-mono font-semibold ${BLOCO_BOTAO[variante]} ${ativo ? 'border-[#0B5563] bg-[#0B5563] text-white' : 'border-[#B9C3CA] bg-white text-ink hover:bg-[#EEF2F4]'}`}
          >
            {b}
          </button>
        )
      })}
    </div>
  )
})
