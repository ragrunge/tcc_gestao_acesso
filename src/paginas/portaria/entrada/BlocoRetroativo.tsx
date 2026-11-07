import { Clock, History } from 'lucide-react'
import { Field } from '@/componentes/Field'
import { fmtHora, toInputDate, toInputTime } from '@/domain/time'

export function BlocoRetroativo({
  agora,
  dataReal,
  setDataReal,
  horaReal,
  setHoraReal,
  formulario,
  setFormulario,
  retroValido,
}: {
  agora: number
  dataReal: string
  setDataReal: (v: string) => void
  horaReal: string
  setHoraReal: (v: string) => void
  formulario: string
  setFormulario: (v: string) => void
  retroValido: boolean
}) {
  return (
    <section className="rounded-[10px] border border-[#A9D2D8] bg-[#F0F8F9] p-5">
      <h2 className="mb-[14px] flex items-center gap-2 text-[17px] font-semibold">
        <History className="h-5 w-5 text-[#0B5563]" aria-hidden />
        Data e hora reais do acesso
      </h2>
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-3">
        <Field label="Data real do acesso">
          <input
            type="date"
            className="input"
            value={dataReal}
            max={toInputDate(agora)}
            onChange={(e) => setDataReal(e.target.value)}
          />
        </Field>
        <Field
          label="Hora real do acesso"
          erro={horaReal && !retroValido ? 'Deve ser anterior ao momento atual.' : undefined}
        >
          <input
            type="time"
            className="input"
            value={horaReal}
            max={dataReal === toInputDate(agora) ? toInputTime(agora) : undefined}
            onChange={(e) => setHoraReal(e.target.value)}
          />
        </Field>
        <Field
          label="Nº do formulário de papel"
          dica="Obrigatório. Fica registrado no próprio evento (entra no hash)."
        >
          <input
            className="input"
            value={formulario}
            onChange={(e) => setFormulario(e.target.value)}
          />
        </Field>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[14px] text-[#0B4450]">
        <Clock className="h-4 w-4" aria-hidden />A hora do lançamento ({fmtHora(agora)}) é definida
        pelo sistema e gravada junto, com a etiqueta Retroativo.
      </p>
    </section>
  )
}
