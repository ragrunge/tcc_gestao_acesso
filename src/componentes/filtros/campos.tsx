import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { CONTROLE } from './controle'

/** Rótulo em cima, controle embaixo. `largura`: classe de largura no desktop (ex.: 'md:w-56'); no celular ocupa a linha. */
export function CampoFiltro({
  rotulo,
  children,
  largura = '',
  como = 'label',
  className = '',
}: {
  rotulo: ReactNode
  children: ReactNode
  largura?: string
  como?: 'label' | 'group'
  className?: string
}) {
  const cls = `flex w-full min-w-0 flex-col gap-1 text-[13px] font-medium text-[#33424B] md:w-auto ${largura} ${className}`
  return como === 'label' ? (
    <label className={cls}>
      {rotulo}
      {children}
    </label>
  ) : (
    <div role="group" className={cls} aria-label={typeof rotulo === 'string' ? rotulo : undefined}>
      <span aria-hidden>{rotulo}</span>
      {children}
    </div>
  )
}

export function FiltroBusca({
  rotulo,
  value,
  onChange,
  placeholder,
  largura = 'md:w-80',
  descritoPor,
}: {
  rotulo: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  largura?: string
  /** id do texto de apoio que fica fora da barra (a barra alinha os campos pela base: texto embaixo desalinharia). */
  descritoPor?: string
}) {
  return (
    <CampoFiltro rotulo={rotulo} largura={largura}>
      <span className="relative block">
        <Search
          className="pointer-events-none absolute left-[11px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#56616B]"
          aria-hidden
        />
        <input
          type="text"
          className={`${CONTROLE} !pl-[34px]`}
          value={value}
          placeholder={placeholder}
          aria-describedby={descritoPor}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </CampoFiltro>
  )
}

export function FiltroCheck({
  rotulo,
  checked,
  onChange,
}: {
  rotulo: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 text-[14px] md:w-auto md:mouse:min-h-10">
      <input
        type="checkbox"
        className="h-[18px] w-[18px] accent-[#0B5563]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {rotulo}
    </label>
  )
}

/** Contagem na linha de cima da tabela (não dentro da barra). Ex.: "5 eventos nos filtros escolhidos". */
export function ContagemResultado({
  n,
  singular,
  plural,
  sufixo = 'nos filtros escolhidos',
  className = '',
}: {
  n: number
  singular: string
  plural: string
  sufixo?: string
  className?: string
}) {
  return (
    <p aria-live="polite" className={`text-[14px] text-[#56616B] ${className}`}>
      {n} {n === 1 ? singular : plural}
      {sufixo ? ` ${sufixo}` : ''}
    </p>
  )
}
