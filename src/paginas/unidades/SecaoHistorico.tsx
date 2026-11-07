import { Badge } from '@/componentes/Badge'
import type { EventoView } from '@/domain/types'
import { agora } from '@/domain/time'
import { chipDoEvento, quandoCurto, textoAutorizacao } from '@/paginas/common/evento'
import { SecaoEmBreve } from './fichaUi'

export function SecaoHistorico({
  eventos,
  onAbrir,
}: {
  eventos: EventoView[] | null
  onAbrir: (e: EventoView) => void
}) {
  return (
    <section className="rounded-[10px] border border-[#DCE1E5] bg-white">
      <h2 className="border-b border-[#E6EAED] px-5 py-[14px] text-[16px] font-semibold">
        Histórico recente de acessos
      </h2>
      {eventos === null && (
        <div className="px-5 py-4">
          <SecaoEmBreve titulo="Histórico recente de acessos" />
        </div>
      )}
      {eventos?.map((e) => {
        const c = chipDoEvento(e)
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onAbrir(e)}
            className="grid min-h-12 w-full grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-[#EEF1F3] bg-white px-5 py-[9px] text-left hover:bg-[#F5F8F9] md:grid-cols-[110px_minmax(0,1fr)_170px_minmax(0,1fr)_130px]"
          >
            <span className="font-mono text-[14px]">{quandoCurto(e.ocorridoEm, agora())}</span>
            <span className="truncate font-medium">{e.pessoaNome}</span>
            <span>
              <Badge tom={c.tom}>{c.texto}</Badge>
            </span>
            <span className="truncate text-[14px]">{textoAutorizacao(e)}</span>
            <span className="truncate text-[14px] text-[#33424B]">{e.operadorNome}</span>
          </button>
        )
      })}
      {eventos?.length === 0 && (
        <div className="px-5 py-4 text-[#56616B]">Sem acessos recentes.</div>
      )}
    </section>
  )
}
