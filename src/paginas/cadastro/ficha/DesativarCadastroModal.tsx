import { ConfirmarModal } from '@/componentes/ConfirmarModal'
import { Field } from '@/componentes/Field'
import { MIN_JUSTIFICATIVA, justificativaValida } from '@/domain/rules'

export function DesativarCadastroModal({
  nome,
  motivo,
  setMotivo,
  onConfirmar,
  onClose,
}: {
  nome: string
  motivo: string
  setMotivo: (m: string) => void
  onConfirmar: () => Promise<void>
  onClose: () => void
}) {
  return (
    <ConfirmarModal
      titulo="Desativar cadastro"
      rotulo="Desativar cadastro"
      desabilitado={!justificativaValida(motivo)}
      onConfirmar={onConfirmar}
      onClose={onClose}
    >
      <p>
        Desativar o cadastro de <strong>{nome}</strong>? Não é exclusão: o histórico continua, a
        pessoa some das buscas e não pode entrar até ser reativada. Autorizações prévias vigentes
        para ela são revogadas.
      </p>
      <Field label={`Motivo (obrigatório, mínimo ${MIN_JUSTIFICATIVA} caracteres)`}>
        <textarea
          className="input"
          rows={2}
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Field>
    </ConfirmarModal>
  )
}
