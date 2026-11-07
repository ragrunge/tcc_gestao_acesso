import { Check } from 'lucide-react'
import type { VinculoView } from '@/api'
import { Button } from '@/componentes/Button'
import { ROTULO_COMPROVANTE } from '@/domain/types'
import { fmtData } from '@/domain/time'
import { FormConferencia } from './FormConferencia'
import { useConferenciaComprovante } from './useConferenciaComprovante'

function ConferenciaRegistrada({
  vinculo,
  conferencia: c,
  podeRefazer,
  onRefazer,
}: {
  vinculo: VinculoView
  conferencia: NonNullable<VinculoView['conferencia']>
  podeRefazer: boolean
  onRefazer: () => void
}) {
  const rot = 'text-[13px] text-[#56616B]'
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-start gap-[10px] text-[#05603A]">
        <Check className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2.6} aria-hidden />
        <span className="font-semibold">Comprovante conferido</span>
      </div>
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Documento</span>
          <span>
            {ROTULO_COMPROVANTE[c.tipoDocumento]}
            {c.descricao ? ` — ${c.descricao}` : ''}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Data da conferência</span>
          <span>{fmtData(c.data)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Conferido por</span>
          <span>{vinculo.conferidoPorNome ?? '—'}</span>
        </div>
        {c.observacao && (
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <span className={rot}>Observação</span>
            <span>{c.observacao}</span>
          </div>
        )}
      </div>
      {podeRefazer && (
        <div>
          <Button pequeno onClick={onRefazer}>
            Refazer conferência
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * RF-05: conferência do comprovante de vínculo. A administração confere o documento (que chega por e-mail ou em mãos)
 * e registra só o tipo, a data e quem conferiu. O arquivo não entra no sistema (LGPD, art. 6º, III).
 */
export function ConferenciaComprovanteBloco({
  vinculo,
  podeRegistrar,
  onRegistrado,
}: {
  vinculo: VinculoView
  podeRegistrar: boolean
  onRegistrado: () => Promise<unknown>
}) {
  const f = useConferenciaComprovante(vinculo, onRegistrado)
  const c = vinculo.conferencia
  return (
    <section
      aria-labelledby={`conf-${vinculo.id}`}
      className="flex flex-col gap-[14px] rounded-lg border border-[#DCE1E5] bg-[#F7F9FA] p-[18px]"
    >
      <h3 id={`conf-${vinculo.id}`} className="text-[15px] font-semibold">
        Conferência do comprovante
      </h3>
      <p className="text-[13px] text-[#56616B]">
        O comprovante (escritura ou contrato) é conferido pela administração e não é anexado: o
        sistema registra só o tipo, a data e quem conferiu.
      </p>
      {c && !f.editando && (
        <ConferenciaRegistrada
          vinculo={vinculo}
          conferencia={c}
          podeRefazer={podeRegistrar}
          onRefazer={() => f.setEditando(true)}
        />
      )}
      {!c && !podeRegistrar && (
        <span className="text-[#56616B]">Nenhuma conferência registrada.</span>
      )}
      {podeRegistrar && f.editando && <FormConferencia f={f} podeCancelar={!!c} />}
    </section>
  )
}
