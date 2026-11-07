import { Button } from '@/componentes/Button'
import type { PainelConsultas } from './consultas'

type Pendente = NonNullable<PainelConsultas['pendentes']['data']>[number]

export function PendenciasSindico({
  pendentes,
  onAprovar,
}: {
  pendentes: Pendente[]
  onAprovar: (id: string) => void
}) {
  return (
    <div
      role="region"
      aria-label="Pendências do síndico"
      className="flex flex-col gap-2 rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-4 py-3 text-[#7A2E0E]"
    >
      <div className="font-semibold">
        Restrições para todo o condomínio aguardando sua aprovação
      </div>
      {pendentes.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 text-[14px]">
          <span className="min-w-[200px] flex-1">
            <strong>{p.pessoaNome}</strong> · {p.motivo}{' '}
            <span className="text-[13px]">
              — pedido por {p.solicitadaPorNome}, cadastrada por {p.cadastradaPorNome}
            </span>
          </span>
          <Button pequeno variante="primario" onClick={() => onAprovar(p.id)}>
            Aprovar
          </Button>
        </div>
      ))}
    </div>
  )
}
