import { Check } from 'lucide-react'
import type { AutorizacaoView } from '@/api'
import { Badge } from '@/componentes/Badge'
import { descreverJanela } from '@/domain/rules'
import { fmtData } from '@/domain/time'
import { SecaoEmBreve, cartao, link, vazio } from './fichaUi'

export function SecaoPrevias({
  autorizacoes,
  podeRevogar,
  onRevogar,
}: {
  autorizacoes: AutorizacaoView[] | null
  podeRevogar: boolean
  onRevogar: (a: AutorizacaoView) => void
}) {
  return (
    <section className={cartao}>
      <h2 className="text-[16px] font-semibold">Autorizações prévias ativas</h2>
      {autorizacoes === null && <SecaoEmBreve titulo="Autorizações prévias" />}
      {autorizacoes?.map((a) => (
        <div key={a.id} className="flex items-start gap-2">
          <Check
            className="mt-[3px] h-4 w-4 shrink-0 text-[#05603A]"
            strokeWidth={2.6}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{a.pessoaNome}</span>
            <span className="text-[13px] text-[#56616B]">
              Até {fmtData(a.validaAte)} · {descreverJanela(a)}
              {a.semSolicitante
                ? ` · cadastrada por ${a.cadastradaPorNome}`
                : ` · por ${a.solicitadaPorNome}`}
            </span>
            {a.semSolicitante && (
              <span className="mt-0.5 self-start">
                <Badge tom="ambar" tamanho="xs">
                  Sem solicitante
                </Badge>
              </span>
            )}
            {a.semSolicitante && a.justificativa && (
              <span className="text-[13px] text-[#7A2E0E]">Justificativa: {a.justificativa}</span>
            )}
            {a.estado !== 'valida' && (
              <span className="mt-0.5 self-start">
                <Badge tom="ambar" tamanho="xs">
                  Fora da janela agora
                </Badge>
              </span>
            )}
          </div>
          {podeRevogar && (
            <button
              type="button"
              className={link}
              aria-label={`Revogar autorização de ${a.pessoaNome}`}
              onClick={() => onRevogar(a)}
            >
              Revogar
            </button>
          )}
        </div>
      ))}
      {autorizacoes?.length === 0 && <span className={vazio}>Nenhuma autorização ativa.</span>}
    </section>
  )
}
