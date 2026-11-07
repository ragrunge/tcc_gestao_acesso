import { Info } from 'lucide-react'
import type { EventoView } from '@/domain/types'
import { Badge } from '@/componentes/Badge'
import { agora, fmtDataHora } from '@/domain/time'
import { chipDoEvento, quandoCurto, textoAutorizacao } from '@/paginas/common/evento'

export function SecaoAcessos({ eventos }: { eventos: EventoView[] | null }) {
  return (
    <section>
      <h3 className="mb-2 text-[15px] font-semibold">Últimos acessos</h3>
      {eventos === null ? (
        <p
          className="flex items-start gap-2 text-[14px] text-[#56616B]"
          role="note"
          aria-label="Últimos acessos: disponível em breve"
        >
          <Info className="mt-[2px] h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Disponível em breve na API real.
        </p>
      ) : eventos.length === 0 ? (
        <p className="text-[#56616B]">Sem acessos registrados.</p>
      ) : (
        <div
          className="rounded-[10px] border border-[#DCE1E5]"
          title={`Atualizado em ${fmtDataHora(agora())}`}
        >
          {eventos.map((e) => (
            <div
              key={e.id}
              className="grid min-h-12 grid-cols-1 gap-1 border-b border-[#EEF1F3] px-4 py-2 last:border-b-0 sm:grid-cols-[110px_120px_minmax(0,1fr)] sm:items-center sm:gap-3"
            >
              <span className="font-mono text-[14px]">{quandoCurto(e.ocorridoEm, agora())}</span>
              <span className="truncate font-mono font-semibold">{e.unidadeRotulo ?? '—'}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Badge tom={chipDoEvento(e).tom} icone={chipDoEvento(e).icone}>
                  {chipDoEvento(e).texto}
                </Badge>
                <span className="truncate text-[14px]">{textoAutorizacao(e)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
