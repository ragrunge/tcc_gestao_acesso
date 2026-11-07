import { CONTROLE } from './controle'
import { ultimosDias } from './periodo'

const ATALHOS = [
  { rotulo: 'Hoje', dias: 1 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
]

/** Período: um rótulo, duas datas lado a lado e, se `atalhos`, chips "Hoje / 7 dias / 30 dias". */
export function FiltroPeriodo({
  de,
  ate,
  onChange,
  atalhos = false,
}: {
  de: string
  ate: string
  onChange: (de: string, ate: string) => void
  atalhos?: boolean
}) {
  // Atalhos na linha do rótulo: o campo fica com a largura das datas e cabe na barra em 1280 px
  return (
    <div
      role="group"
      aria-label="Período"
      className="flex w-full min-w-0 flex-col gap-1 text-[13px] font-medium text-[#33424B] md:w-[300px]"
    >
      <span className="flex min-h-[20px] items-center justify-between gap-2">
        <span aria-hidden>Período</span>
        {atalhos && (
          <span className="flex gap-1">
            {ATALHOS.map((a) => {
              const p = ultimosDias(a.dias)
              const marcado = de === p.de && ate === p.ate
              return (
                <button
                  key={a.dias}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => onChange(p.de, p.ate)}
                  className={`h-[44px] rounded-md px-2.5 text-[12.5px] md:mouse:h-6 ${marcado ? 'bg-[#E3F0F2] font-semibold text-[#0B5563]' : 'font-medium text-[#56616B] hover:bg-[#EEF2F4] hover:text-ink'}`}
                >
                  {a.rotulo}
                </button>
              )
            })}
          </span>
        )}
      </span>
      <span className="flex gap-1.5">
        <input
          type="date"
          aria-label="De"
          className={`${CONTROLE} min-w-0 flex-1`}
          value={de}
          max={ate || undefined}
          onChange={(e) => onChange(e.target.value, ate)}
        />
        <input
          type="date"
          aria-label="Até"
          className={`${CONTROLE} min-w-0 flex-1`}
          value={ate}
          min={de || undefined}
          onChange={(e) => onChange(de, e.target.value)}
        />
      </span>
    </div>
  )
}
