import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { MIN_JUSTIFICATIVA } from '@/domain/rules'
import type { DecisaoVinculo } from './useDecisaoVinculo'

/** RF-07: encerramento manual (aprovado ou legado), com motivo obrigatório e data opcional. */
export function EncerrarVinculo({ d }: { d: DecisaoVinculo }) {
  if (!d.encerrando) {
    return (
      <div>
        <Button
          onClick={() => {
            d.setEncerrando(true)
            d.setErro('')
          }}
        >
          Encerrar vínculo
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-[10px] rounded-lg border border-[#D5DDE2] p-3">
      <label htmlFor="motivo-enc" className="flex flex-col gap-1.5 text-[14px] font-medium">
        Motivo do encerramento (obrigatório)
        <textarea
          id="motivo-enc"
          autoFocus
          className="input font-normal"
          rows={3}
          value={d.motivo}
          onChange={(e) => d.setMotivo(e.target.value)}
          placeholder="Ex.: Locação encerrada; o inquilino entregou as chaves à administração."
        />
      </label>
      <span className="text-[13px] text-[#56616B]">
        {d.motivo.trim().length} de {MIN_JUSTIFICATIVA} caracteres no mínimo
      </span>
      <label className="flex flex-col gap-1.5 text-[14px] font-medium">
        Data do encerramento (opcional)
        <input
          type="date"
          className="input font-normal"
          value={d.dataEnc}
          onChange={(e) => d.setDataEnc(e.target.value)}
        />
        <span className="text-[13px] font-normal text-[#56616B]">
          Em branco: hoje, ou o fim da vigência se ele já passou. Não pode ser futura.
        </span>
      </label>
      {d.erro && (
        <Alert tom="vermelho" role="alert">
          {d.erro}
        </Alert>
      )}
      <div className="flex flex-col gap-[10px] sm:flex-row">
        <Button
          variante="perigo"
          className="sm:flex-1"
          disabled={!d.motivoOk}
          carregando={d.salvando}
          onClick={() => void d.encerrar()}
        >
          Confirmar encerramento
        </Button>
        <Button
          onClick={() => {
            d.setEncerrando(false)
            d.setErro('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
