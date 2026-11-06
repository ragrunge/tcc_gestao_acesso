import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useApi } from '@/api'
import { agora as agoraSim } from '@/domain/time'
import { chipDoEvento, quandoCurto } from '@/paginas/common/evento'

export /** Movimentações recentes para marcar (RF-28): a primeira página do histórico, sem as correções. */
function SeletorEventos({
  selecionados,
  onChange,
  ocultar = [],
  unidadePrimeiro,
}: {
  selecionados: string[]
  onChange: (ids: string[]) => void
  ocultar?: string[]
  /** Código da unidade ("D-32") cujos eventos sobem para o topo, na ordem de horário. */ unidadePrimeiro?:
    string | null
}) {
  const api = useApi()
  const recentes = useQuery({
    queryKey: ['eventos', 'recentes-ocorrencia'],
    queryFn: async () =>
      (await api.eventos.listarPagina({ limite: 25, excluirTipos: ['correcao'] })).itens,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
  const visiveis = (recentes.data ?? []).filter((e) => !ocultar.includes(e.id))
  const lista = unidadePrimeiro
    ? [
        ...visiveis.filter((e) => e.unidadeRotulo === unidadePrimeiro),
        ...visiveis.filter((e) => e.unidadeRotulo !== unidadePrimeiro),
      ]
    : visiveis
  return (
    <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto px-[10px] pb-[10px]">
      <legend className="sr-only">Movimentações recentes</legend>
      {lista.length === 0 && !recentes.isLoading && (
        <span className="text-[14px] text-[#56616B]">Nenhuma movimentação recente.</span>
      )}
      {lista.map((ev) => {
        const on = selecionados.includes(ev.id)
        return (
          <label
            key={ev.id}
            className={`grid min-h-[44px] shrink-0 cursor-pointer grid-cols-[22px_96px_minmax(0,1fr)] items-center gap-[10px] rounded-lg border bg-white px-[10px] py-1 text-[14px] focus-within:ring-2 focus-within:ring-[#0B5563] md:grid-cols-[22px_96px_minmax(0,1fr)_70px_minmax(0,1fr)] ${on ? 'border-[#0B5563]' : 'border-[#E1E6EA]'}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selecionados, ev.id]
                    : selecionados.filter((x) => x !== ev.id),
                )
              }
            />
            <span
              aria-hidden
              className={`grid h-5 w-5 place-items-center rounded border-2 text-white ${on ? 'border-[#0B5563] bg-[#0B5563]' : 'border-[#9AA7B0] bg-white'}`}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3.4} />}
            </span>
            <span className="whitespace-nowrap font-mono">
              {quandoCurto(ev.ocorridoEm, agoraSim())}
            </span>
            <span className="truncate font-medium">{ev.pessoaNome}</span>
            <span className="col-start-2 font-mono font-semibold md:col-start-auto">
              {ev.unidadeRotulo ?? '—'}
            </span>
            <span className="truncate text-[#33424B]">
              {chipDoEvento(ev).texto} · {ev.operadorNome}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
