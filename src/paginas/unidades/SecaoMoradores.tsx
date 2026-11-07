import type { VinculoView } from '@/api'
import { SeloVinculo } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'
import { ROTULO_VINCULO } from '@/domain/types'
import { fmtData } from '@/domain/time'
import { SecaoEmBreve, link } from './fichaUi'

export function SecaoMoradores({
  vinculos,
  podeIncluir,
  podeEncerrar,
  onIncluir,
  onEncerrar,
}: {
  vinculos: VinculoView[] | null
  podeIncluir: boolean
  podeEncerrar: boolean
  onIncluir: () => void
  onEncerrar: (v: VinculoView) => void
}) {
  return (
    <section className="rounded-[10px] border border-[#DCE1E5] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#E6EAED] px-5 py-[10px]">
        <h2 className="text-[16px] font-semibold">Moradores</h2>
        {podeIncluir && (
          <Button pequeno onClick={onIncluir}>
            Incluir morador
          </Button>
        )}
      </div>
      {vinculos === null && (
        <div className="px-5 py-4">
          <SecaoEmBreve titulo="Moradores">
            Vínculos da unidade: disponível em breve na API real.
          </SecaoEmBreve>
        </div>
      )}
      {vinculos?.map((v) => (
        <div
          key={v.id}
          className="grid min-h-[52px] grid-cols-1 gap-1 border-b border-[#EEF1F3] px-5 py-[10px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_220px_120px_auto] sm:items-center sm:gap-3"
        >
          <span className="truncate font-medium">{v.pessoaNome}</span>
          <span className="truncate text-[14px]">
            {ROTULO_VINCULO[v.tipo]}
            {v.status === 'legado' && v.prazoRegularizacao ? (
              <span className="text-[#56616B]">
                {' '}
                · regularizar até {fmtData(v.prazoRegularizacao)}
              </span>
            ) : v.vigenciaFim ? (
              <span className="text-[#56616B]"> · até {fmtData(v.vigenciaFim)}</span>
            ) : null}
          </span>
          <SeloVinculo status={v.status} />
          <span>
            {podeEncerrar && (v.status === 'aprovado' || v.status === 'legado') && (
              <button
                type="button"
                className={link}
                aria-label={`Encerrar vínculo de ${v.pessoaNome}`}
                onClick={() => onEncerrar(v)}
              >
                Encerrar vínculo
              </button>
            )}
          </span>
        </div>
      ))}
      {vinculos?.length === 0 && (
        <div className="px-5 py-4 text-[#56616B]">Nenhum vínculo cadastrado.</div>
      )}
    </section>
  )
}
