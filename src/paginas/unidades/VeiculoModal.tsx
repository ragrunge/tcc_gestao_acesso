import { useState, type FormEvent } from 'react'
import { useApi } from '@/api'
import { Alert } from '@/componentes/Alert'
import { InputMascara } from '@/componentes/InputMascara'
import { SeletorCor } from '@/componentes/SeletorCor'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { type Veiculo } from '@/domain/types'
import { mensagemErro } from '@/app/useAsync'
import { UnidadeTitulo } from './EditarUnidadeModal'

export /** RF-08: novo veículo ou edição (placa, modelo, cor) e desativação. Placa ativa é única no condomínio. */
function VeiculoModal({
  unidade,
  atual,
  onClose,
  onFeito,
}: {
  unidade: string
  atual?: Veiculo
  onClose: () => void
  onFeito: (texto: string) => void
}) {
  const api = useApi()
  const [f, setF] = useState({
    placa: atual?.placa ?? '',
    modelo: atual?.modelo ?? '',
    cor: atual?.cor ?? '',
  })
  const [erro, setErro] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    try {
      if (atual) {
        await api.veiculos.editar({ id: atual.id, ...f })
        onFeito('Veículo atualizado.')
      } else {
        await api.veiculos.criar({ unidadeId: unidade, ...f })
        onFeito('Veículo cadastrado.')
      }
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  async function desativar() {
    if (!atual) return
    setErro('')
    try {
      await api.veiculos.editar({ id: atual.id, ativo: false })
      onFeito(`Veículo ${atual.placa} desativado. O histórico é mantido.`)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  return (
    <Modal
      titulo={atual ? 'Editar veículo' : 'Novo veículo'}
      onClose={onClose}
      rodape={
        <>
          <Button type="submit" form="f-vei" variante="primario" grande className="flex-1">
            {atual ? 'Salvar' : 'Cadastrar'}
          </Button>
          {atual && (
            <Button grande variante="perigo" onClick={() => void desativar()}>
              Desativar veículo
            </Button>
          )}
          <Button grande onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <UnidadeTitulo unidade={unidade} />
      <form id="f-vei" onSubmit={salvar} className="flex flex-col gap-[14px]">
        <Field label="Placa">
          <InputMascara
            tipo="placa"
            data-autofocus
            className="input font-mono uppercase"
            value={f.placa}
            onChange={(placa) => setF({ ...f, placa })}
          />
        </Field>
        <Field label="Modelo">
          <input
            className="input"
            value={f.modelo}
            onChange={(e) => setF({ ...f, modelo: e.target.value })}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span id="rotulo-cor-veiculo" className="text-[14px] font-medium">
            Cor
          </span>
          <SeletorCor
            rotuloId="rotulo-cor-veiculo"
            valor={f.cor}
            onChange={(cor) => setF({ ...f, cor })}
          />
        </div>
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
