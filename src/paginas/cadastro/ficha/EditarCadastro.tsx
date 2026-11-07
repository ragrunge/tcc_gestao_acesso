import { useState, type FormEvent } from 'react'
import { useApi } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { InputMascara } from '@/componentes/InputMascara'
import type { Pessoa } from '@/domain/types'
import { mensagemErro } from '@/app/useAsync'

/** Correção do cadastro (pessoa.editar): nome, telefone, CPF (tira de "sem CPF"), empresa e serviço. */
export function EditarCadastro({
  pessoa,
  onCancelar,
  onSalvo,
}: {
  pessoa: Pessoa
  onCancelar: () => void
  onSalvo: () => void
}) {
  const api = useApi()
  const [nome, setNome] = useState(pessoa.nome)
  const [telefone, setTelefone] = useState('') // em branco: o número atual só aparece mascarado (LGPD)
  const [cpf, setCpf] = useState('')
  const [empresa, setEmpresa] = useState(pessoa.empresa ?? '')
  const [servico, setServico] = useState(pessoa.servico ?? '')
  const [deixouDeSerMenor, setDeixouDeSerMenor] = useState(false)
  const [erro, setErro] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try {
      await api.pessoas.editar({
        // Telefone em branco não é enviado (importado sem telefone pode corrigir só o nome)
        id: pessoa.id,
        nome,
        ...(telefone.trim() ? { telefone } : {}),
        ...(cpf.trim() ? { documento: cpf } : {}),
        ...(pessoa.categoria === 'prestador' ? { empresa, servico } : {}),
        ...(pessoa.menorIdade && deixouDeSerMenor ? { menorIdade: false } : {}),
      })
      onSalvo()
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  return (
    <form
      onSubmit={salvar}
      aria-label="Editar cadastro"
      className="grid grid-cols-1 gap-[14px] rounded-[10px] border border-[#DCE1E5] p-4 sm:grid-cols-2"
    >
      <Field label="Nome completo" className="sm:col-span-2">
        <input className="input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      <Field
        label={
          pessoa.semCpf
            ? 'CPF (informar tira a pessoa de “sem CPF”)'
            : 'Novo CPF (só para corrigir)'
        }
        dica={`Atual: ${pessoa.documentoMascarado}. O número não é guardado.`}
      >
        <InputMascara tipo="cpf" className="input font-mono" value={cpf} onChange={setCpf} />
      </Field>
      <Field
        label="Novo telefone (só para corrigir)"
        dica={
          pessoa.telefoneMascarado
            ? `Atual: ${pessoa.telefoneMascarado}.`
            : 'Sem telefone cadastrado.'
        }
      >
        <InputMascara tipo="telefone" value={telefone} onChange={setTelefone} />
      </Field>
      {pessoa.menorIdade && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#B9C3CA] p-3 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={deixouDeSerMenor}
            onChange={(e) => setDeixouDeSerMenor(e.target.checked)}
          />
          <span>
            <span className="font-medium">Deixou de ser menor de idade</span>
            <span className="block text-[13px] text-[#56616B]">
              A partir daqui CPF e telefone passam a ser obrigatórios.
            </span>
          </span>
        </label>
      )}
      {pessoa.categoria === 'prestador' && (
        <>
          <Field label="Empresa">
            <input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </Field>
          <Field label="Serviço">
            <input className="input" value={servico} onChange={(e) => setServico(e.target.value)} />
          </Field>
        </>
      )}
      {erro && (
        <Alert tom="vermelho" role="alert" className="sm:col-span-2">
          {erro}
        </Alert>
      )}
      <div className="flex flex-wrap gap-[10px] sm:col-span-2">
        <Button type="submit" variante="primario">
          Salvar correção
        </Button>
        <Button onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  )
}
