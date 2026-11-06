import { useState } from 'react'
import { type VinculoView } from '@/api'
import { Field } from '@/componentes/Field'
import { ConfirmarModal } from '@/componentes/ConfirmarModal'
import { ROTULO_VINCULO } from '@/domain/types'
import { MIN_JUSTIFICATIVA } from '@/domain/rules'

export /** Encerra um vínculo aprovado ou legado direto da unidade (RF-07): motivo obrigatório e confirmação. */
function EncerrarVinculoModal({
  vinculo,
  onClose,
  onConfirmar,
}: {
  vinculo: VinculoView
  onClose: () => void
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const ok = motivo.trim().length >= MIN_JUSTIFICATIVA
  return (
    <ConfirmarModal
      titulo="Encerrar vínculo"
      rotulo="Confirmar encerramento"
      desabilitado={!ok}
      onClose={onClose}
      onConfirmar={() => onConfirmar(motivo)}
    >
      <p>
        Encerrar o vínculo de <strong>{vinculo.pessoaNome}</strong> ({ROTULO_VINCULO[vinculo.tipo]}
        )? Ele deixa de valer para acesso; o histórico é mantido.
      </p>
      <Field
        label="Motivo do encerramento (obrigatório)"
        dica={`${motivo.trim().length} de ${MIN_JUSTIFICATIVA} caracteres no mínimo`}
      >
        <textarea
          className="input"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: Locação encerrada; o inquilino entregou as chaves à administração."
        />
      </Field>
    </ConfirmarModal>
  )
}
