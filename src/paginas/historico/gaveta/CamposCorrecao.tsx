import type { PessoaBusca } from '@/api'
import { Field } from '@/componentes/Field'
import { PessoaPicker } from '@/componentes/PessoaPicker'

export function CamposCorrecao({
  temAutorizador,
  vUnidade,
  setVUnidade,
  vData,
  setVData,
  vHora,
  setVHora,
  vPessoa,
  setVPessoa,
  vAutorizador,
  setVAutorizador,
}: {
  temAutorizador: boolean
  vUnidade: string
  setVUnidade: (v: string) => void
  vData: string
  setVData: (v: string) => void
  vHora: string
  setVHora: (v: string) => void
  vPessoa: PessoaBusca | null
  setVPessoa: (p: PessoaBusca | null) => void
  vAutorizador: PessoaBusca | null
  setVAutorizador: (p: PessoaBusca | null) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-dashed border-[#C5CDD3] p-3">
      <legend className="px-1 text-[13px] font-medium text-[#56616B]">
        Valores corretos (preencha só o que mudou)
      </legend>
      <Field label="Unidade de destino">
        <input
          className="input font-mono"
          placeholder="Ex.: D-32"
          value={vUnidade}
          onChange={(e) => setVUnidade(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Data real">
          <input
            type="date"
            className="input"
            value={vData}
            onChange={(e) => setVData(e.target.value)}
          />
        </Field>
        <Field label="Hora real">
          <input
            type="time"
            className="input"
            value={vHora}
            onChange={(e) => setVHora(e.target.value)}
          />
        </Field>
      </div>
      <PessoaPicker rotulo="Pessoa correta" valor={vPessoa} onChange={setVPessoa} />
      {temAutorizador && (
        <PessoaPicker
          rotulo="Quem autorizou (pessoa correta)"
          valor={vAutorizador}
          onChange={setVAutorizador}
        />
      )}
    </fieldset>
  )
}
