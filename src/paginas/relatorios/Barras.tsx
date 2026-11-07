export const PETROLEO = '#0B5563'
export const secao =
  'flex min-w-0 flex-col gap-3 rounded-[10px] border border-[#DCE1E5] bg-white px-4 py-[18px] sm:px-[22px]'

/** Barras horizontais (HTML/CSS). Os valores aparecem como texto, então não dependem de cor. */
export function Barras({
  itens,
  cor,
  rotuloVazio = 'Sem dados no período.',
}: {
  itens: { rotulo: string; valor: number; cor?: string }[]
  cor?: string
  rotuloVazio?: string
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  if (itens.length === 0 || itens.every((i) => i.valor === 0))
    return <p className="text-[#56616B]">{rotuloVazio}</p>
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((i) => (
        <li
          key={i.rotulo}
          className="grid grid-cols-[100px_minmax(0,1fr)_40px] items-center gap-[10px] sm:grid-cols-[170px_minmax(0,1fr)_48px]"
        >
          <span className="truncate text-[14px]">{i.rotulo}</span>
          <span className="h-[14px] rounded-[3px] bg-[#EEF2F4]" aria-hidden>
            <span
              className="block h-full rounded-[3px]"
              style={{ width: `${(i.valor / max) * 100}%`, background: i.cor ?? cor ?? PETROLEO }}
            />
          </span>
          <span className="text-right font-mono text-[14px]">{i.valor}</span>
        </li>
      ))}
    </ul>
  )
}
