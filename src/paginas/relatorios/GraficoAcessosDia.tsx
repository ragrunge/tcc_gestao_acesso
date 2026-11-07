import type { RelatorioResumo } from '@/api'
import { fmtDataCurta, partes } from '@/domain/time'
import { PETROLEO } from './Barras'

export function GraficoAcessosDia({ r }: { r: RelatorioResumo }) {
  const maxDia = Math.max(1, ...r.acessosPorDia.map((d) => d.entradas))
  return (
    <section className="rounded-[10px] border border-[#DCE1E5] bg-white px-[22px] py-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[16px] font-semibold">Acessos por dia</h2>
        <span className="text-[14px] text-[#56616B]">
          {r.totais.entradas} acessos no período · {r.totais.excecoes} exceções · {r.totais.negados}{' '}
          negados · {r.totais.recusados} recusados · {r.totais.retroativos} retroativos · fins de
          semana em tom claro
        </span>
      </div>
      <figure>
        <div
          role="img"
          aria-label="Gráfico de barras com o número de entradas por dia no período"
          className="mt-4 flex h-[180px] items-end gap-1 border-b border-[#C5CDD3]"
        >
          {r.acessosPorDia.map((d) => {
            const dow = partes(d.dia).dow
            const fds = dow === 0 || dow === 6
            return (
              <div
                key={d.dia}
                title={`${fmtDataCurta(d.dia)}: ${d.entradas} entrada(s)`}
                className="flex-1 rounded-t-[3px]"
                style={{
                  height: `${(d.entradas / maxDia) * 100}%`,
                  background: fds ? '#9CC7CF' : PETROLEO,
                  minHeight: d.entradas > 0 ? 2 : 0,
                }}
              />
            )
          })}
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {r.acessosPorDia.map((d, i) => (
            <span
              key={d.dia}
              className={`min-w-0 flex-1 whitespace-nowrap text-[12px] text-[#56616B] ${i % 7 === 0 ? '' : 'hidden sm:block'}`}
            >
              {r.acessosPorDia.length <= 31 || i % 7 === 0
                ? String(partes(d.dia).dia).padStart(2, '0')
                : ''}
            </span>
          ))}
        </div>
        <figcaption className="sr-only">
          Entradas por dia:{' '}
          {r.acessosPorDia.map((d) => `${fmtDataCurta(d.dia)} ${d.entradas}`).join('; ')}
        </figcaption>
      </figure>
    </section>
  )
}
