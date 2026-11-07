import { PRAZO_PADRAO_MIN } from '@/domain/rules'
import { ROTULO_TIPO_VISITA, TIPOS_VISITA, type TipoVisita } from '@/domain/types'
import { fmtPrazo } from './constantes'

export function SeletorTipoVisita({
  valor,
  onChange,
}: {
  valor: TipoVisita
  onChange: (t: TipoVisita) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[14px] font-medium">
        Tipo de visita{' '}
        <span className="font-normal text-[#56616B]">· define o prazo de permanência</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIPOS_VISITA.map((t) => (
          <label
            key={t}
            className={`flex min-h-[56px] cursor-pointer flex-col justify-center rounded-lg border-2 px-4 py-2 [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-[3px] [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#0B5563] ${
              valor === t
                ? 'border-[#0B5563] bg-[#F0F8F9]'
                : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'
            }`}
          >
            <input
              type="radio"
              name="tipo-visita"
              className="sr-only"
              checked={valor === t}
              onChange={() => onChange(t)}
            />
            <span className="font-medium">{ROTULO_TIPO_VISITA[t]}</span>
            <span className="text-[13px] text-[#56616B]">
              Prazo {fmtPrazo(PRAZO_PADRAO_MIN[t])}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
