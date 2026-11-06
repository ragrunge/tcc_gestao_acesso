import { useState, type FormEvent } from 'react'
import { useApi, type PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { PessoaPicker } from '@/componentes/PessoaPicker'
import { fromInput, toInputDate, agora } from '@/domain/time'
import { mensagemErro, useAsync } from '@/app/useAsync'
import { UnidadeTitulo } from './EditarUnidadeModal'
import { rodapeForm } from './formUtils'

export function RestricaoModal({
  unidade,
  onClose,
  onFeito,
}: {
  unidade: string
  onClose: () => void
  onFeito: (todoCondominio: boolean) => void
}) {
  const api = useApi()
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ate, setAte] = useState('')
  const [pedidaPor, setPedidaPor] = useState('')
  const [todo, setTodo] = useState(false)
  const [erro, setErro] = useState('')
  const aut = useAsync(() => api.vinculos.autorizadores(unidade), [unidade])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!pessoa) {
      setErro('Escolha a pessoa que será restringida.')
      return
    }
    try {
      await api.restricoes.criar({
        pessoaId: pessoa.id,
        unidadeId: unidade,
        motivo,
        validaAte: ate ? fromInput(ate) : null,
        solicitadaPorPessoaId: pedidaPor || null,
        paraTodoCondominio: todo,
      })
      onFeito(todo)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  return (
    <Modal
      titulo="Nova restrição"
      onClose={onClose}
      rodape={rodapeForm(onClose, 'f-rest', 'Cadastrar restrição')}
    >
      <UnidadeTitulo unidade={unidade} />
      <form id="f-rest" onSubmit={salvar} className="flex flex-col gap-[14px]">
        <PessoaPicker
          rotulo="Pessoa que não pode entrar"
          valor={pessoa}
          onChange={setPessoa}
          autoFocus
        />
        <Field label="Morador que pediu a restrição (obrigatório)">
          <select
            className="input"
            value={pedidaPor}
            onChange={(e) => setPedidaPor(e.target.value)}
          >
            <option value="">Selecione…</option>
            {(aut.data ?? []).map((a) => (
              <option key={a.pessoa.id} value={a.pessoa.id}>
                {a.pessoa.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo" dica="Evite dados sensíveis no texto.">
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
        <Field label="Vale até (obrigatório)">
          <input
            type="date"
            className="input"
            required
            value={ate}
            min={toInputDate(agora())}
            onChange={(e) => setAte(e.target.value)}
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#B9C3CA] p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={todo}
            onChange={(e) => setTodo(e.target.checked)}
          />
          <span>
            <span className="font-medium">Pedir restrição para todo o condomínio</span>
            <span className="block text-[13px] text-[#56616B]">
              Fica pendente até o síndico aprovar (RN-06). Enquanto pendente, vale só o pedido
              registrado.
            </span>
          </span>
        </label>
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
