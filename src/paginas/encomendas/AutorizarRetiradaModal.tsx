import { useAcoesEncomenda } from './consultas'
import { useState, type FormEvent } from 'react'
import { useApi, type EncomendaView, type PessoaBusca } from '@/api'
import { PessoaPicker } from '@/componentes/PessoaPicker'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { UnitTag } from '@/componentes/UnitTag'
import { ROTULO_VINCULO } from '@/domain/types'
import { mensagemErro, useAsync } from '@/app/useAsync'

/** RN-08: morador com vínculo válido autoriza outra pessoa (cadastrada com CPF) a retirar esta encomenda. */
export function AutorizarRetiradaModal({
  encomenda,
  onClose,
  onFeito,
}: {
  encomenda: EncomendaView
  onClose: () => void
  onFeito: (nome: string) => void
}) {
  const api = useApi()
  const acoes = useAcoesEncomenda()
  const moradores = useAsync(
    () => api.vinculos.autorizadores(encomenda.unidadeId),
    [encomenda.unidadeId],
  )
  const [solicitante, setSolicitante] = useState('')
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(null)
  const [erro, setErro] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!solicitante) {
      setErro('Escolha o morador que autoriza.')
      return
    }
    if (!pessoa) {
      setErro('Escolha quem vai retirar.')
      return
    }
    try {
      await acoes.autorizarRetirada({
        encomendaId: encomenda.id,
        pessoaId: pessoa.id,
        solicitadaPorPessoaId: solicitante,
      })
      onFeito(pessoa.nome)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  return (
    <Modal
      titulo={`Autorizar retirada da encomenda ${encomenda.codigo}`}
      onClose={onClose}
      rodape={
        <>
          <Button type="submit" form="f-aut-ret" variante="primario" grande className="flex-1">
            Autorizar retirada
          </Button>
          <Button grande onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <UnitTag id={encomenda.unidadeId} tamanho="lg" />
      <form id="f-aut-ret" onSubmit={salvar} className="flex flex-col gap-[14px]">
        <Field label="Morador que autoriza (vínculo válido na unidade)">
          <select
            data-autofocus
            className="input"
            value={solicitante}
            onChange={(ev) => setSolicitante(ev.target.value)}
          >
            <option value="">Selecione…</option>
            {(moradores.data ?? []).map((m) => (
              <option key={m.pessoa.id} value={m.pessoa.id}>
                {m.pessoa.nome} ({ROTULO_VINCULO[m.vinculo.tipo]})
              </option>
            ))}
          </select>
        </Field>
        <PessoaPicker
          rotulo="Quem vai retirar (cadastro com CPF)"
          valor={pessoa}
          onChange={setPessoa}
        />
        <Alert tom="neutro">
          A pessoa autorizada precisa estar cadastrada com CPF. Na retirada, o porteiro confere o
          documento.
        </Alert>
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
