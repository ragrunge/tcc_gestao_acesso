import { Button } from '@/componentes/Button'
import { ROTULO_CATEGORIA, type EventoView } from '@/domain/types'
import { fmtData, fmtHora } from '@/domain/time'
import { useCatalogo } from '@/app/catalogo'
import { descreverVeiculo } from '@/paginas/common/evento'

export function CabecalhoEvento({ ev, onClose }: { ev: EventoView; onClose: () => void }) {
  const catalogo = useCatalogo()
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[22px] font-semibold leading-tight">{ev.pessoaNome}</div>
          <div className="text-[#33424B]">
            {ROTULO_CATEGORIA[ev.categoriaPessoa]} · {fmtData(ev.ocorridoEm)} ·{' '}
            {fmtHora(ev.ocorridoEm)}
          </div>
        </div>
        <Button pequeno data-autofocus onClick={onClose}>
          Fechar
        </Button>
      </div>
      <div className="font-mono text-[28px] font-semibold text-[#0B3F49]">
        {ev.unidadeDestinoId
          ? catalogo.rotulo(ev.unidadeDestinoId)
          : ev.areaComumNome
            ? `ÁREA COMUM · ${ev.areaComumNome.toUpperCase()}`
            : 'Condomínio'}
      </div>
      {(ev.empresa || ev.servico) && (
        <div className="text-[14px] text-[#33424B]">
          Prestador: {[ev.empresa, ev.servico].filter(Boolean).join(' · ')}
        </div>
      )}
      {ev.veiculo && (
        <div className="text-[14px] text-[#33424B]">
          Veículo: <span className="font-mono">{descreverVeiculo(ev.veiculo)}</span>
          {ev.tipo === 'saida' && (
            <span className="text-[#56616B]"> (informado na entrada {ev.entradaCodigo})</span>
          )}
        </div>
      )}
    </>
  )
}
