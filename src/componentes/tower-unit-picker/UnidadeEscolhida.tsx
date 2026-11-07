import { UnitTag } from '../UnitTag'

/** Caixa destacada da unidade escolhida: "BLOCO D · AP 32" + botão Alterar. */
export function UnidadeEscolhida({
  id,
  onAlterar,
  grande = true,
}: {
  id: string
  onAlterar: () => void
  grande?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-[10px] border-2 border-[#0B5563] bg-[#F0F8F9] ${grande ? 'px-[18px] py-[14px]' : 'px-4 py-3'}`}
      aria-live="polite"
    >
      <UnitTag id={id} tamanho={grande ? 'xl' : 'lg'} />
      <button
        type="button"
        onClick={onAlterar}
        className="h-[44px] rounded-lg border border-[#B9C3CA] bg-white px-[14px] text-[14px] hover:bg-[#EEF2F4] lg:mouse:h-10"
      >
        Alterar
      </button>
    </div>
  )
}
