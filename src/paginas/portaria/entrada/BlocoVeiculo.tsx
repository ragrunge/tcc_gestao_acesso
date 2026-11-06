import { useEffect, useRef } from 'react'
import { Car } from 'lucide-react'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { InputMascara } from '@/componentes/InputMascara'
import { mascaraPlaca, normalizarPlaca } from '@/domain/cpf'
import type { VeiculoAcesso } from '@/domain/types'
import { descreverVeiculo } from '@/paginas/common/evento'

export interface VeiculoForm {
  comVeiculo: boolean
  placa: string
  modelo: string
  cor: string
}
export const VEICULO_VAZIO: VeiculoForm = { comVeiculo: false, placa: '', modelo: '', cor: '' }

/**
 * Veículo da entrada (opcional). Rádios nativos "A pé" / "Com veículo" (Tab entra no grupo, setas trocam); com veículo,
 * placa (obrigatória, com máscara), modelo e cor. "Mesmo veículo da última visita" preenche tudo de uma vez.
 */
export function BlocoVeiculo({
  valor,
  onChange,
  ultimo,
}: {
  valor: VeiculoForm
  onChange: (v: VeiculoForm) => void
  ultimo: VeiculoAcesso | null
}) {
  // O primeiro campo (placa) do bloco recebe o foco ao marcar "Com veículo"
  const camposRef = useRef<HTMLDivElement>(null)
  const focarPlaca = useRef(false)
  useEffect(() => {
    if (valor.comVeiculo && focarPlaca.current) {
      focarPlaca.current = false
      camposRef.current?.querySelector('input')?.focus()
    }
  }, [valor.comVeiculo])
  const placaInvalida =
    valor.comVeiculo &&
    valor.placa.replace(/[^A-Za-z0-9]/g, '').length === 7 &&
    !normalizarPlaca(valor.placa)
  const opcao = (com: boolean, rotulo: string) => (
    <label
      className={`flex h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 max-lg:h-[44px] [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-[3px] [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#0B5563] ${
        valor.comVeiculo === com
          ? 'border-[#0B5563] bg-[#F0F8F9]'
          : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'
      }`}
    >
      <input
        type="radio"
        name="veiculo"
        className="sr-only"
        checked={valor.comVeiculo === com}
        onChange={() => {
          focarPlaca.current = com
          onChange({ ...valor, comVeiculo: com })
        }}
      />
      <span className="font-medium">{rotulo}</span>
    </label>
  )
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex items-center gap-1.5 text-[14px] font-medium">
        <Car className="h-4 w-4 text-[#56616B]" aria-hidden />
        Veículo{' '}
        <span className="font-normal text-[#56616B]">· opcional, fica registrado na entrada</span>
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {opcao(false, 'A pé')}
        {opcao(true, 'Com veículo')}
        {ultimo && !(valor.comVeiculo && normalizarPlaca(valor.placa) === ultimo.placa) && (
          <Button
            pequeno
            onClick={() => {
              focarPlaca.current = false
              onChange({
                comVeiculo: true,
                placa: mascaraPlaca(ultimo.placa),
                modelo: ultimo.modelo ?? '',
                cor: ultimo.cor ?? '',
              })
            }}
          >
            Mesmo da última visita: {descreverVeiculo(ultimo)}
          </Button>
        )}
      </div>
      {valor.comVeiculo && (
        <div ref={camposRef} className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
          <Field
            label={
              <>
                Placa <span className="text-[#B42318]">*</span>
              </>
            }
            erro={
              placaInvalida
                ? 'Placa fora do padrão antigo (ABC-1234) ou Mercosul (ABC1D23).'
                : undefined
            }
          >
            <InputMascara
              tipo="placa"
              className="input font-mono"
              aria-required
              value={valor.placa}
              onChange={(placa) => onChange({ ...valor, placa })}
            />
          </Field>
          <Field label="Modelo">
            <input
              className="input"
              maxLength={60}
              value={valor.modelo}
              onChange={(e) => onChange({ ...valor, modelo: e.target.value })}
            />
          </Field>
          <Field label="Cor">
            <input
              className="input"
              maxLength={30}
              value={valor.cor}
              onChange={(e) => onChange({ ...valor, cor: e.target.value })}
            />
          </Field>
        </div>
      )}
    </fieldset>
  )
}

/**
 * Tipo de visita (define o prazo de permanência). Rádios nativos: Tab entra no grupo e as setas trocam a opção.
 * O prazo de serviço com autorização prévia de horário vai até o fim da janela (regra do servidor).
 */
