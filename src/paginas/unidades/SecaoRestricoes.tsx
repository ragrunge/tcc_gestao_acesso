import { Ban } from 'lucide-react'
import type { RestricaoView } from '@/api'
import { Badge } from '@/componentes/Badge'
import { fmtData } from '@/domain/time'
import { SecaoEmBreve, cartao, link, vazio } from './fichaUi'

export function SecaoRestricoes({
  restricoes,
  podeRevogar,
  onRevogar,
}: {
  restricoes: RestricaoView[] | null
  podeRevogar: boolean
  onRevogar: (r: RestricaoView) => void
}) {
  return (
    <section className={cartao}>
      <h2 className="text-[16px] font-semibold">Restrições</h2>
      {restricoes === null && <SecaoEmBreve titulo="Restrições" />}
      {restricoes?.map((r) => (
        <div key={r.id} className="flex items-start gap-2 text-[#B42318]">
          <Ban className="mt-[3px] h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{r.pessoaNome}</span>
            <span className="text-[13px] text-[#912018]">“{r.motivo}”</span>
            <span className="text-[13px] text-[#56616B]">
              Solicitada por {r.solicitadaPorNome ?? 'administração'} · {fmtData(r.cadastradaEm)}
            </span>
            {(r.pendente || r.escopo === 'condominio') && (
              <span className="mt-0.5 self-start">
                {r.pendente ? (
                  <Badge tom="ambar" tamanho="xs">
                    Aguardando aprovação do síndico
                  </Badge>
                ) : (
                  <Badge tom="vermelho" tamanho="xs">
                    Todo o condomínio
                  </Badge>
                )}
              </span>
            )}
          </div>
          {podeRevogar && (
            <button
              type="button"
              className={link}
              aria-label={`Revogar restrição de ${r.pessoaNome}`}
              onClick={() => onRevogar(r)}
            >
              Revogar
            </button>
          )}
        </div>
      ))}
      {restricoes?.length === 0 && <span className={vazio}>Nenhuma restrição.</span>}
    </section>
  )
}
