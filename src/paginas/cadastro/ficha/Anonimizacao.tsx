import type { ResultadoAnonimizacao } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { fmtData } from '@/domain/time'

export function AlertaRetido({ resultado }: { resultado: ResultadoAnonimizacao }) {
  return (
    <Alert tom="ambar" titulo="O que fica retido" role="status">
      {resultado.eventosRetidos !== undefined && (
        <p className="mb-1">
          {resultado.eventosRetidos === 0 ? (
            'Nenhum evento de acesso desta pessoa fica retido.'
          ) : (
            <>
              {resultado.eventosRetidos} evento(s) de acesso ficam retidos só pelo id
              {resultado.retidoAte ? <> até {fmtData(resultado.retidoAte)}</> : null}.
            </>
          )}
          {resultado.documentosEliminados ? (
            <>
              {' '}
              {resultado.documentosEliminados} arquivo(s) da pessoa eliminado(s) do armazenamento.
            </>
          ) : null}
        </p>
      )}
      <ul className="list-disc pl-5">
        {resultado.retido.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Alert>
  )
}

export function ConfirmarAnonimizacao({
  nome,
  erro,
  onConfirmar,
  onCancelar,
}: {
  nome: string
  erro: string
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border-2 border-[#B42318] bg-[#FEF3F2] p-4 text-[#912018]">
      <p className="font-semibold">
        Anonimizar {nome}? Nome, CPF, telefone, empresa e serviço serão removidos, e a trilha de
        alterações dessa pessoa será redigida. Não há como desfazer.
      </p>
      <p className="text-[14px]">
        O texto livre ligado a ela é substituído e o nome completo é trocado por “[anonimizado]” em
        encomendas, ocorrências e na trilha. Ficam retidos os eventos de acesso até completar 3
        anos, por exercício regular de direitos, inclusive o texto livre deles (que faz parte do
        selo de integridade). Pessoa com vínculo válido não pode ser anonimizada.
      </p>
      {erro && (
        <Alert tom="vermelho" role="alert">
          {erro}
        </Alert>
      )}
      <div className="flex flex-wrap gap-[10px]">
        <Button variante="perigo" onClick={onConfirmar}>
          Confirmar anonimização
        </Button>
        <Button onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
