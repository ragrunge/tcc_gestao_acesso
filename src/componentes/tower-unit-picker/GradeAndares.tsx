import { doAgrupamento } from '@/domain/units'
import { useCatalogo } from '@/app/catalogo'
import { andaresDoBloco, useNumerosDoBloco, type Variante } from './dados'

/** Grade por andar (linhas de cima para baixo, rótulo à esquerda, apartamentos em colunas). */
export function GradeAndares({
  bloco,
  numero,
  onEscolher,
  variante = 'entrada',
  destaque,
  desabilitado,
  numeros: lista,
  inativos,
}: {
  bloco: string
  numero?: string | null
  onEscolher: (n: string) => void
  variante?: Variante
  /** Unidades com cadastro detalhado (azul claro). */ destaque?: ReadonlySet<string>
  desabilitado?: boolean
  /** Números exibidos (padrão: unidades ativas do bloco). */ numeros?: string[]
  /** Números de unidades desativadas (tracejado). */ inativos?: ReadonlySet<string>
}) {
  const numerosDoBloco = useNumerosDoBloco()
  const { agrupamento } = useCatalogo()
  const andares = andaresDoBloco(lista ?? numerosDoBloco(bloco))
  const colunas = Math.max(1, ...andares.map((a) => a.numeros.length))
  const rotuloLargura = variante === 'entrada' ? '48px' : '42px'
  const botao =
    variante === 'entrada'
      ? 'h-[44px] rounded-md text-[14px] lg:mouse:h-[34px]'
      : 'h-[44px] rounded-[5px] text-[13px] lg:mouse:h-8'
  return (
    <div
      role="group"
      aria-label={`Unidades ${doAgrupamento(agrupamento)} ${bloco}`}
      className={
        variante === 'modal'
          ? 'flex max-w-[360px] flex-col gap-1'
          : `flex flex-col gap-1 ${variante === 'entrada' ? 'max-w-[420px]' : ''}`
      }
    >
      {andares.map((a) => (
        <div
          key={a.andar}
          className="grid items-center gap-1"
          style={{ gridTemplateColumns: `${rotuloLargura} repeat(${colunas}, minmax(0, 1fr))` }}
        >
          <span className="whitespace-nowrap text-[12px] text-[#56616B]">{a.rotulo}</span>
          {a.numeros.map((n) => {
            const sel = numero === n
            const det = destaque?.has(n)
            const inativo = inativos?.has(n)
            return (
              <button
                key={n}
                type="button"
                disabled={desabilitado}
                aria-pressed={sel}
                aria-label={`Apartamento ${n}${inativo ? ' (desativada)' : ''}`}
                onClick={() => onEscolher(n)}
                className={`border font-mono ${botao} ${
                  sel
                    ? 'border-[#0B5563] bg-[#0B5563] text-white'
                    : inativo
                      ? 'border-dashed border-[#B9C3CA] bg-[#F3F5F6] text-[#56616B] line-through'
                      : det
                        ? 'border-[#A9D2D8] bg-[#E3F0F2] text-[#0B4450] hover:border-[#0B5563]'
                        : 'border-[#C5CDD3] bg-white text-ink hover:border-[#0B5563] hover:bg-[#E3F0F2]'
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
