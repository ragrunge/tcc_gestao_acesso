import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { descreverJanela } from '@/domain/rules'
import { fmtHora } from '@/domain/time'
import type { PainelConsultas } from './consultas'

type Props = {
  previas: PainelConsultas['previas']
  onClose: () => void
}

export function PreviasModal({ previas, onClose }: Props) {
  return (
    <Modal
      titulo="Autorizações prévias de hoje"
      onClose={onClose}
      rodape={
        <Button grande className="ml-auto" data-autofocus onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col">
        {(previas.data ?? []).map((a) => (
          <div
            key={a.id}
            className="grid grid-cols-1 gap-1 border-b border-[#EEF1F3] py-[10px] sm:grid-cols-[minmax(0,1fr)_80px_150px_100px] sm:items-center sm:gap-3"
          >
            <span className="flex flex-col">
              <span className="font-medium">{a.pessoaNome}</span>
              <span className="text-[13px] text-[#56616B]">
                Autorizado por {a.solicitadaPorNome}
              </span>
            </span>
            <span className="font-mono font-semibold">{a.unidadeRotulo}</span>
            <span className="text-[14px]">{descreverJanela(a)}</span>
            <span
              className={`text-[13px] font-semibold ${a.utilizadaEm ? 'text-[#05603A]' : a.estado === 'valida' ? 'text-[#0B4450]' : 'text-[#93370D]'}`}
            >
              {a.utilizadaEm
                ? `Utilizada ${fmtHora(a.utilizadaEm)}`
                : a.estado === 'valida'
                  ? 'Vale agora'
                  : 'Aguardando'}
            </span>
          </div>
        ))}
        {previas.data?.length === 0 && (
          <p className="py-2 text-[#56616B]">Nenhuma autorização prévia para hoje.</p>
        )}
      </div>
    </Modal>
  )
}
