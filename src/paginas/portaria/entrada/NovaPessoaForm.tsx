import type { FormEvent } from 'react'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { InputMascara } from '@/componentes/InputMascara'
import { NP_VAZIA, TIPOS_CADASTRO_RAPIDO } from './constantes'

export type NovaPessoaCampos = typeof NP_VAZIA

export function NovaPessoaForm({
  np,
  setNp,
  erroNp,
  cadastrarNova,
  voltar,
}: {
  np: NovaPessoaCampos
  setNp: (v: NovaPessoaCampos) => void
  erroNp: string
  cadastrarNova: (e: FormEvent) => void
  voltar: () => void
}) {
  return (
    <form onSubmit={cadastrarNova} className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
      <Field label="Nome completo" className="sm:col-span-2">
        <input
          className="input"
          autoFocus
          required
          value={np.nome}
          onChange={(e) => setNp({ ...np, nome: e.target.value })}
        />
      </Field>
      <Field label="CPF" dica="Só CPF. Guardado mascarado, com hash para busca.">
        <InputMascara
          tipo="cpf"
          className="input font-mono"
          disabled={np.semCpf}
          required={!np.semCpf}
          value={np.documento}
          onChange={(documento) => setNp({ ...np, documento })}
        />
      </Field>
      <Field label="Telefone (obrigatório)">
        <InputMascara
          tipo="telefone"
          required
          value={np.telefone}
          onChange={(telefone) => setNp({ ...np, telefone })}
        />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#B9C3CA] p-3 sm:col-span-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={np.semCpf}
          onChange={(e) => setNp({ ...np, semCpf: e.target.checked, documento: '' })}
        />
        <span>
          <span className="font-medium">Pessoa sem CPF</span>
          <span className="block text-[13px] text-[#56616B]">
            Exceção: nome e telefone continuam obrigatórios e a pessoa só entra por exceção do
            porteiro, com justificativa.
          </span>
        </span>
      </label>
      <Field label="Tipo">
        <select
          className="input"
          value={np.tipoVisita}
          onChange={(e) => {
            const t = TIPOS_CADASTRO_RAPIDO.find((x) => x.valor === e.target.value)!
            setNp({ ...np, tipoVisita: t.valor, categoria: t.categoria })
          }}
        >
          {TIPOS_CADASTRO_RAPIDO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </Field>
      {np.categoria === 'prestador' && (
        <>
          <Field label="Empresa">
            <input
              className="input"
              required
              value={np.empresa}
              onChange={(e) => setNp({ ...np, empresa: e.target.value })}
            />
          </Field>
          <Field label="Serviço">
            <input
              className="input"
              value={np.servico}
              onChange={(e) => setNp({ ...np, servico: e.target.value })}
            />
          </Field>
        </>
      )}
      {erroNp && (
        <Alert tom="vermelho" role="alert" className="sm:col-span-2">
          {erroNp}
        </Alert>
      )}
      <div className="flex flex-wrap gap-[10px] sm:col-span-2">
        <Button type="submit" variante="primario">
          Usar este cadastro
        </Button>
        <Button onClick={voltar}>Voltar à busca</Button>
      </div>
    </form>
  )
}
