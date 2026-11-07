import type { RelatorioResumo } from '@/api'
import { ROTULO_MEIO_CURTO } from '@/domain/types'
import { Barras, PETROLEO, secao } from './Barras'

const CORES_IDADE = ['#0B5563', '#0B5563', '#DC6803', '#B42318']

export function PaineisResumo({ r }: { r: RelatorioResumo }) {
  const pct = Math.round((r.cadastroCompleto.unidadesCompletas / r.cadastroCompleto.total) * 100)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={secao}>
        <h2 className="text-[16px] font-semibold">Acessos por meio de autorização</h2>
        <Barras
          itens={r.acessosPorMeio.map((m) => ({
            rotulo: ROTULO_MEIO_CURTO[m.meio],
            valor: m.total,
            cor: m.meio === 'excecao_porteiro' ? '#DC6803' : PETROLEO,
          }))}
        />
      </section>
      <section className={secao}>
        <h2 className="text-[16px] font-semibold">Liberações por exceção, por responsável</h2>
        <Barras
          cor="#DC6803"
          itens={r.excecoesPorPorteiro.map((e) => ({ rotulo: e.operador, valor: e.total }))}
          rotuloVazio="Nenhuma exceção no período."
        />
      </section>
      <section className={secao}>
        <h2 className="text-[16px] font-semibold">Encomendas pendentes por idade</h2>
        <Barras
          itens={r.encomendasPorIdade.map((e, i) => ({
            rotulo: e.faixa,
            valor: e.total,
            cor: CORES_IDADE[i] ?? PETROLEO,
          }))}
        />
      </section>
      <section className={secao}>
        <h2 className="text-[16px] font-semibold">Unidades com cadastro completo</h2>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[40px] font-semibold">{pct}%</span>
          <span className="text-[#56616B]">
            {r.cadastroCompleto.unidadesCompletas} de {r.cadastroCompleto.total} unidades
          </span>
        </div>
        <div
          className="h-[14px] rounded-[3px] bg-[#EEF2F4]"
          role="img"
          aria-label={`${pct}% das unidades com cadastro completo`}
        >
          <div
            className="h-full rounded-[3px]"
            style={{ width: `${pct}%`, background: PETROLEO }}
          />
        </div>
        <span className="text-[14px] text-[#56616B]">
          Completo = ao menos um morador com vínculo aprovado. Vínculos legados ainda não contam.
        </span>
      </section>
    </div>
  )
}
