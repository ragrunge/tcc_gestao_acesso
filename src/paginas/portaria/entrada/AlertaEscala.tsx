import { Alert } from '@/componentes/Alert'
import { descreverJanela, escalaVigente } from '@/domain/rules'
import type { Funcionario } from '@/domain/types'

export function AlertaEscala({
  funcionario,
  instante,
}: {
  funcionario: Funcionario | null
  instante: number
}) {
  return funcionario && escalaVigente(funcionario, instante) ? (
    <Alert tom="verde" role="status">
      {funcionario.funcao} em horário de escala ({funcionario.escala.horaInicio}–
      {funcionario.escala.horaFim},{' '}
      {descreverJanela({
        diasSemana: funcionario.escala.diasSemana,
        horaInicio: null,
        horaFim: null,
      })}
      ).
    </Alert>
  ) : (
    <Alert tom="ambar">O funcionário não está em horário de escala neste momento.</Alert>
  )
}
