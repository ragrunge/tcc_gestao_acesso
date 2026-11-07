import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { nesteAgrupamento } from '@/domain/units'
import { useCatalogo } from '@/app/catalogo'
import { rotuloTeclas, useBlocos, useNumerosDoBloco } from './tower-unit-picker/dados'
import { BotoesBloco } from './tower-unit-picker/BotoesBloco'
import { GradeAndares } from './tower-unit-picker/GradeAndares'
import { UnidadeEscolhida } from './tower-unit-picker/UnidadeEscolhida'

export { useNumerosDoBloco, useBlocos, andaresDoBloco } from './tower-unit-picker/dados'
export { BotoesBloco, GradeAndares, UnidadeEscolhida }

export interface TowerUnitPickerHandle {
  focusBloco: () => void
  focusUnidade: () => void
}

/**
 * Seletor de bloco e unidade do fluxo de entrada, operável só pelo teclado (RNF-07):
 * - no grupo de blocos, a tecla do bloco ("A", "4") o escolhe e leva o foco ao campo de apartamento;
 * - no campo de apartamento, digitar um número válido (ex.: 32, ou 03 no térreo) escolhe a unidade e dispara onComplete;
 * - também é possível clicar na grade por andar.
 * Blocos e números vêm do catálogo (banco): a grade mostra o que existe, inclusive exceções cadastradas à mão.
 */
export const TowerUnitPicker = forwardRef<
  TowerUnitPickerHandle,
  {
    bloco: string | null
    numero: string | null
    onChange: (bloco: string | null, numero: string | null) => void
    onComplete?: () => void
    onAlterar?: () => void
    desabilitado?: boolean
    autoFocusBloco?: boolean
    variante?: 'entrada' | 'modal'
  }
>(function TowerUnitPicker(
  {
    bloco,
    numero,
    onChange,
    onComplete,
    onAlterar,
    desabilitado,
    autoFocusBloco,
    variante = 'entrada',
  },
  ref,
) {
  const grupoRef = useRef<HTMLDivElement>(null)
  const unidadeRef = useRef<HTMLInputElement>(null)
  const [digitado, setDigitado] = useState(numero ?? '')
  const numerosDoBloco = useNumerosDoBloco()
  const blocos = useBlocos()
  const { porBlocoNumero, agrupamento } = useCatalogo()
  const numeros = bloco ? numerosDoBloco(bloco) : []
  const maxDigitos = Math.max(2, ...numeros.map((n) => n.length))
  // Inválido: nenhum número deste bloco começa com o que foi digitado
  const invalido = digitado.length >= 2 && !numeros.some((n) => n.startsWith(digitado))

  useImperativeHandle(ref, () => ({
    focusBloco: () =>
      (
        grupoRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
        grupoRef.current?.querySelector<HTMLElement>('button')
      )?.focus(),
    focusUnidade: () => unidadeRef.current?.focus(),
  }))

  function escolherBloco(b: string) {
    setDigitado('')
    onChange(b, null)
    setTimeout(() => unidadeRef.current?.focus(), 0)
  }
  function escolherUnidade(n: string) {
    setDigitado(n)
    onChange(bloco, n)
    onComplete?.()
  }
  function alterar() {
    setDigitado('')
    if (onAlterar) onAlterar()
    else onChange(null, null)
  }

  const escolhida = bloco && numero ? porBlocoNumero(bloco, numero) : undefined
  if (escolhida)
    return (
      <UnidadeEscolhida id={escolhida.id} onAlterar={alterar} grande={variante === 'entrada'} />
    )

  const rotulo = 'w-14 shrink-0 text-[14px] font-medium'
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <span id="rotulo-bloco" className={rotulo}>
          {agrupamento}
        </span>
        <BotoesBloco
          ref={grupoRef}
          bloco={bloco}
          onEscolher={escolherBloco}
          variante={variante}
          desabilitado={desabilitado}
          autoFocus={autoFocusBloco}
          rotulo={rotuloTeclas(agrupamento, blocos)}
          blocos={blocos}
        />
      </div>
      {bloco && (
        <div className="flex gap-2">
          <span className={`${rotulo} pt-1.5`}>Unidade</span>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <GradeAndares
              bloco={bloco}
              numero={numero}
              onEscolher={escolherUnidade}
              variante={variante}
              desabilitado={desabilitado}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="campo-unidade" className="text-[13px] text-[#56616B]">
                Ou digite o apartamento
                {numeros.length > 0 && numeros.length <= 6
                  ? ` (${numeros[0]} a ${numeros[numeros.length - 1]})`
                  : ''}
              </label>
              <input
                ref={unidadeRef}
                id="campo-unidade"
                className="input !h-[44px] !w-[88px] font-mono lg:mouse:!h-9"
                inputMode="numeric"
                maxLength={maxDigitos}
                autoComplete="off"
                disabled={desabilitado}
                placeholder="ex.: 32"
                value={digitado}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, maxDigitos)
                  setDigitado(v)
                  // Escolhe quando o número existe e nenhum outro (mais longo) começa com ele
                  const unico =
                    numeros.includes(v) && !numeros.some((n) => n !== v && n.startsWith(v))
                  if (bloco && unico) escolherUnidade(v)
                  else if (numero) onChange(bloco, null)
                }}
                aria-invalid={invalido}
                aria-describedby="ajuda-unidade"
              />
              <span
                id="ajuda-unidade"
                className={`text-[13px] ${invalido ? 'font-medium text-[#B42318]' : 'sr-only'}`}
              >
                {invalido
                  ? `Unidade inexistente ${nesteAgrupamento(agrupamento)}.`
                  : 'Digite o número ou clique em uma unidade.'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
