import { fmtData, fmtHora } from '@/domain/time'
import { longeDoEvento, type PassoLinhaTempo } from './regras'

export function LinhaDoTempo({
  passos,
  ocorridoEm,
}: {
  passos: PassoLinhaTempo[]
  ocorridoEm: number
}) {
  return (
    <div>
      <h3 className="mb-[10px] text-[15px] font-semibold">Linha do tempo</h3>
      <ol className="flex flex-col">
        {passos.map((p, i) => (
          <li key={i} className="grid grid-cols-[56px_14px_minmax(0,1fr)] gap-[10px] pb-3">
            <span className="font-mono text-[13px] text-[#56616B]">{fmtHora(p.quando)}</span>
            <span className="mt-[5px] h-[10px] w-[10px] rounded-full bg-[#0B5563]" />
            <span className="text-[14px]">
              {p.texto}
              {longeDoEvento(p.quando, ocorridoEm) ? ` — ${fmtData(p.quando)}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
