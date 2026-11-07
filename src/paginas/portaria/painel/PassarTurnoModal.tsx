import { Link } from 'react-router-dom'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { fmtHora } from '@/domain/time'
import type { PainelConsultas } from './consultas'

type Props = {
  nome: string
  agora: number
  resumo: PainelConsultas['resumo']['data']
  passando: boolean
  onConfirmar: () => void
  onClose: () => void
}

export function PassarTurnoModal({
  nome,
  agora,
  resumo: r,
  passando,
  onConfirmar,
  onClose,
}: Props) {
  return (
    <Modal
      titulo="Passar turno"
      onClose={onClose}
      rodape={
        <>
          <Button
            variante="primario"
            grande
            className="flex-1"
            data-autofocus
            carregando={passando}
            onClick={onConfirmar}
          >
            Confirmar passagem de turno
          </Button>
          <Button grande onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <p className="text-[#56616B]">
        Resumo do turno de {nome} até {fmtHora(agora)}. Cada operador usa o próprio login: ao
        confirmar, sua sessão é encerrada.
      </p>
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
        {[
          ['Pessoas ainda no condomínio', r?.pessoasDentro],
          ['Encomendas aguardando', r?.encomendasPendentes],
          ['Ocorrências abertas', r?.ocorrenciasAbertas],
          ['Exceções hoje', r?.excecoesHoje],
          ['Autorizações prévias hoje', r?.autorizacoesHoje],
          ['Restrições pendentes', r?.restricoesPendentes],
        ].map(([k, v]) => (
          <div
            key={String(k)}
            className="flex items-center justify-between rounded-lg border border-[#DCE1E5] px-[14px] py-3"
          >
            <span className="text-[14px]">{k}</span>
            <span className="font-mono text-[20px] font-semibold">{v ?? '…'}</span>
          </div>
        ))}
      </div>
      {(r?.pessoasDentro ?? 0) > 0 && (
        <Alert tom="ambar" titulo="Confira quem ainda está dentro">
          <Link className="underline" to="/pessoas" onClick={onClose}>
            Abrir pessoas no condomínio
          </Link>
        </Alert>
      )}
    </Modal>
  )
}
