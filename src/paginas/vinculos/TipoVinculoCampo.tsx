import { ROTULO_VINCULO, type TipoVinculo } from '@/domain/types'
import { Label } from '@/componentes/ui/label'
import { RadioGroup, RadioGroupItem } from '@/componentes/ui/radio-group'
import { DICA_TIPO, TIPOS } from './regras'

export function TipoVinculoCampo({
  valor,
  onChange,
}: {
  valor: TipoVinculo
  onChange: (t: TipoVinculo) => void
}) {
  return (
    <fieldset className="flex flex-col gap-[6px]">
      <legend id="tipo-vinculo-legenda" className="mb-[6px] text-[14px] font-medium">
        Tipo de vínculo
      </legend>
      <RadioGroup
        value={valor}
        onValueChange={(v) => onChange(v as TipoVinculo)}
        aria-labelledby="tipo-vinculo-legenda"
        className="grid-cols-1 sm:grid-cols-3"
      >
        {TIPOS.map((t) => (
          <div
            key={t}
            className="flex items-start gap-3 rounded-lg border border-[#B9C3CA] bg-white p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-claro"
          >
            <RadioGroupItem
              id={`tipo-${t}`}
              value={t}
              aria-describedby={`tipo-${t}-d`}
              className="mt-[2px]"
            />
            <span className="flex flex-col">
              <Label htmlFor={`tipo-${t}`} className="cursor-pointer font-semibold">
                {ROTULO_VINCULO[t]}
              </Label>
              <span id={`tipo-${t}-d`} className="text-[13px] text-[#56616B]">
                {DICA_TIPO[t]}
              </span>
            </span>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
