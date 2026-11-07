import { Osso } from '@/componentes/Carregando'
import { Vazio } from '@/componentes/Table'
import { CommandList } from '@/componentes/ui/command'
import type { EventoView } from '@/domain/types'
import { COLUNAS } from './constantes'
import type { useBuscaPorCpf } from './consultas'
import { LinhaPresente } from './LinhaPresente'

type Props = {
  carregando: boolean
  vazio: boolean
  total: number
  achados: EventoView[]
  q: string
  agora: number
  buscandoCpf: boolean
  docPorPessoa: ReturnType<typeof useBuscaPorCpf>['docPorPessoa']
  onSelect: (e: EventoView) => void
}

export function ListaPresentes({
  carregando,
  vazio,
  total,
  achados,
  q,
  agora,
  buscandoCpf,
  docPorPessoa,
  onSelect,
}: Props) {
  return (
    <>
      {carregando && (
        <div aria-hidden className="apos-espera rounded-[10px] border border-[#DCE1E5] bg-white">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`grid grid-cols-2 gap-3 border-b border-[#EEF1F3] px-5 py-[18px] last:border-b-0 ${COLUNAS}`}
            >
              {[0, 1, 2, 3, 4, 5].map((c) => (
                <Osso key={c} className={`h-3 ${c % 2 ? 'w-[45%]' : 'w-[70%]'}`} />
              ))}
            </div>
          ))}
        </div>
      )}
      {vazio && (
        <div className="rounded-[10px] border border-[#DCE1E5] bg-white">
          <Vazio>Ninguém dentro agora.</Vazio>
        </div>
      )}
      {total > 0 && (
        <div className="rounded-[10px] border border-[#DCE1E5] bg-white md:overflow-hidden">
          <div
            aria-hidden
            className={`hidden gap-3 border-b border-[#E6EAED] px-5 py-3 text-[13px] font-semibold text-[#56616B] md:grid ${COLUNAS}`}
          >
            <span>Nome</span>
            <span>Tipo</span>
            <span>Destino</span>
            <span>Entrada</span>
            <span>Permanência</span>
            <span>Autorizado por</span>
          </div>
          <CommandList label="Quem está dentro" className="max-h-none p-2 md:p-0">
            {achados.length === 0 && !buscandoCpf && (
              <Vazio>Ninguém dentro com “{q.trim()}”.</Vazio>
            )}
            {achados.map((e) => (
              <LinhaPresente
                key={e.id}
                e={e}
                agora={agora}
                docPorPessoa={docPorPessoa}
                onSelect={onSelect}
              />
            ))}
          </CommandList>
        </div>
      )}
    </>
  )
}
