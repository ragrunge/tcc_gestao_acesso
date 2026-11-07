import type { PessoaBusca, RestricaoView } from '@/api'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { fmtData, fmtHora } from '@/domain/time'

export function ModalRestricao({
  pr,
  pessoa,
  codUnidade,
  resolverRestricao,
}: {
  pr: RestricaoView
  pessoa: PessoaBusca
  codUnidade: string | null
  resolverRestricao: (registrarOcorrencia: boolean) => Promise<void>
}) {
  return (
    <Modal
      titulo={
        codUnidade
          ? `Entrada não permitida para ${codUnidade}`
          : 'Entrada não permitida no condomínio'
      }
      tom="vermelho"
      tituloId="titulo-restricao"
      onClose={() => void resolverRestricao(false)}
      rodape={
        <>
          <Button
            variante="perigo"
            grande
            className="flex-1"
            onClick={() => void resolverRestricao(true)}
          >
            Registrar ocorrência
          </Button>
          <Button grande atalho="Esc" data-autofocus onClick={() => void resolverRestricao(false)}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="text-[18px] font-semibold">{pessoa.nome}</div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-[#56616B]">Motivo registrado pelo morador</span>
        <span className="text-[17px] font-semibold text-[#912018]">“{pr.motivo}”</span>
      </div>
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[#56616B]">Restrição solicitada por</span>
          <span className="font-medium">{pr.solicitadaPorNome ?? 'Administração'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-[#56616B]">Cadastrada no sistema por</span>
          <span className="font-medium">
            {pr.cadastradaPorNome} · {fmtData(pr.cadastradaEm)} {fmtHora(pr.cadastradaEm)}
          </span>
        </div>
      </div>
      {pr.escopo === 'condominio' && (
        <div className="text-[14px] font-medium text-[#912018]">
          Restrição para todo o condomínio (aprovada pelo síndico).
        </div>
      )}
      <div className="rounded-lg bg-[#F3F5F6] px-3 py-[10px] text-[14px] text-[#33424B]">
        A tentativa será gravada na trilha de auditoria com seu nome e horário. Não há opção de
        liberar: os dois caminhos gravam a tentativa negada.
      </div>
    </Modal>
  )
}
