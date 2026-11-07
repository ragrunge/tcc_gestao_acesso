import { useState, type FormEvent } from 'react'
import { useApi, type PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { PessoaPicker } from '@/componentes/PessoaPicker'
import { MIN_JUSTIFICATIVA } from '@/domain/rules'
import { fromInput } from '@/domain/time'
import { mensagemErro, useAsync } from '@/app/useAsync'
import { UnidadeTitulo } from './EditarUnidadeModal'
import { rodapeForm } from './formUtils'
import { CadastroNoSeletor } from './CadastroNoSeletor'
import { JanelaPreviaCampos } from './JanelaPreviaCampos'

export function PreviaModal({
  unidade,
  podeCadastrar,
  onClose,
  onFeito,
}: {
  unidade: string
  podeCadastrar?: boolean
  onClose: () => void
  onFeito: () => void
}) {
  const api = useApi()
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(null)
  const [pedidaPor, setPedidaPor] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [ate, setAte] = useState('') // sem valor padrão: a validade é obrigatória (RN-07)
  const [dias, setDias] = useState<number[]>([])
  const [hi, setHi] = useState('')
  const [hf, setHf] = useState('')
  const [erro, setErro] = useState('')
  const aut = useAsync(() => api.vinculos.autorizadores(unidade), [unidade])
  const [cadastrando, setCadastrando] = useState<string | null>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!pessoa) {
      setErro('Escolha a pessoa autorizada.')
      return
    }
    try {
      await api.autorizacoes.criar({
        unidadeId: unidade,
        pessoaId: pessoa.id,
        validaAte: ate ? fromInput(ate) : null,
        diasSemana: dias.length ? dias : null,
        horaInicio: hi || null,
        horaFim: hf || null,
        solicitadaPorPessoaId: pedidaPor || null,
        justificativa: pedidaPor ? null : justificativa,
      })
      onFeito()
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  if (cadastrando !== null) {
    return (
      <CadastroNoSeletor
        unidade={unidade}
        texto={cadastrando}
        categoriaInicial="visitante"
        onVoltar={() => setCadastrando(null)}
        aviso="Depois de cadastrada, a pessoa já fica escolhida na autorização prévia."
        onEscolhida={(p) => {
          setPessoa(p)
          setCadastrando(null)
          setErro('')
        }}
      />
    )
  }
  return (
    <Modal
      titulo="Nova autorização prévia"
      onClose={onClose}
      rodape={rodapeForm(onClose, 'f-prev', 'Cadastrar autorização')}
    >
      <UnidadeTitulo unidade={unidade} />
      <form id="f-prev" onSubmit={salvar} className="flex flex-col gap-[14px]">
        <PessoaPicker
          rotulo="Pessoa autorizada"
          valor={pessoa}
          onChange={setPessoa}
          autoFocus
          onCadastrar={podeCadastrar ? setCadastrando : undefined}
        />
        <Field label="Morador que pediu">
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
        {!pedidaPor && (
          <Field
            label={`Justificativa (obrigatória sem morador solicitante, mínimo ${MIN_JUSTIFICATIVA} caracteres)`}
            dica="A autorização ficará marcada como “Sem solicitante” e contará como exceção de quem a cadastrou."
          >
            <textarea
              className="input"
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </Field>
        )}
        <JanelaPreviaCampos
          ate={ate}
          setAte={setAte}
          dias={dias}
          setDias={setDias}
          hi={hi}
          setHi={setHi}
          hf={hf}
          setHf={setHf}
        />
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
