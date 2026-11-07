import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

export const cartao =
  'flex flex-col gap-[10px] rounded-[10px] border border-[#DCE1E5] bg-white px-[18px] py-[14px]'
export const vazio = 'text-[14px] text-[#56616B]'
export const link =
  'inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold lg:mouse:min-h-0 text-[#0B5563] hover:underline'

/** Seção cujo módulo a API real ainda não tem: o resto da tela funciona normalmente. */
export function SecaoEmBreve({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 text-[14px] text-[#56616B]"
      role="note"
      aria-label={`${titulo}: disponível em breve`}
    >
      <Info className="mt-[2px] h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span>{children ?? 'Disponível em breve na API real.'}</span>
    </div>
  )
}
