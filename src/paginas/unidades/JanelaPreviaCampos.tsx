import { Field } from '@/componentes/Field'
import { SeletorDias } from '@/componentes/SeletorDias'
import { toInputDate, agora } from '@/domain/time'

/** Validade, dias da semana e horário da autorização prévia. */
export function JanelaPreviaCampos({
  ate,
  setAte,
  dias,
  setDias,
  hi,
  setHi,
  hf,
  setHf,
}: {
  ate: string
  setAte: (v: string) => void
  dias: number[]
  setDias: (v: number[]) => void
  hi: string
  setHi: (v: string) => void
  hf: string
  setHf: (v: string) => void
}) {
  return (
    <>
      <Field
        label="Válida até (obrigatório)"
        dica="Não existe autorização por prazo indeterminado (RN-07)."
      >
        <input
          type="date"
          className="input"
          required
          value={ate}
          min={toInputDate(agora())}
          onChange={(e) => setAte(e.target.value)}
        />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[14px] font-medium">
          Dias da semana (nenhum marcado = todos os dias)
        </legend>
        <SeletorDias valor={dias} onChange={setDias} />
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Horário inicial">
          <input type="time" className="input" value={hi} onChange={(e) => setHi(e.target.value)} />
        </Field>
        <Field label="Horário final">
          <input type="time" className="input" value={hf} onChange={(e) => setHf(e.target.value)} />
        </Field>
      </div>
    </>
  )
}
