import { Link } from 'react-router-dom'
import type { VinculoView } from '@/api'
import type { VinculoUnidade } from '@/domain/types'
import { ROTULO_VINCULO } from '@/domain/types'
import { Alert } from '@/componentes/Alert'
import { SeloVinculo } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'

export type VinculoFeito = { v: VinculoUnidade; resumo: string }

export function SecaoVinculos({
  vinculos,
  podeVincular,
  anonimizada,
  desativada,
  vinculado,
  onVincular,
  onClose,
}: {
  vinculos: VinculoView[]
  podeVincular: boolean
  anonimizada: boolean
  desativada: boolean
  vinculado: VinculoFeito | null
  onVincular: () => void
  onClose: () => void
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Vínculos com unidades</h3>
        {podeVincular && !anonimizada && (
          <Button
            pequeno
            variante="contorno"
            disabled={desativada}
            aria-describedby={desativada ? 'ficha-vincular-motivo' : undefined}
            onClick={onVincular}
          >
            Vincular a uma unidade
          </Button>
        )}
      </div>
      {podeVincular && !anonimizada && desativada && (
        <p id="ficha-vincular-motivo" className="mb-2 text-[13px] text-[#56616B]">
          Cadastro desativado não recebe vínculo: reative o cadastro para vincular a uma unidade.
        </p>
      )}
      {vinculado && (
        <Alert
          tom={vinculado.v.status === 'pendente' ? 'ambar' : 'verde'}
          role="status"
          className="mb-2"
        >
          {vinculado.resumo}:{' '}
          {vinculado.v.status === 'pendente' ? (
            <>
              solicitado e <strong>pendente</strong>. Falta registrar a conferência do comprovante e
              aprovar em{' '}
              <Link className="font-semibold underline" to="/vinculos" onClick={onClose}>
                Vínculos
              </Link>
              ; enquanto pendente, não dá acesso de morador.
            </>
          ) : (
            <>registrado ({vinculado.v.status}).</>
          )}
        </Alert>
      )}
      {vinculos.length === 0 ? (
        <p className="text-[#56616B]">Sem vínculos.</p>
      ) : (
        <div className="rounded-[10px] border border-[#DCE1E5]">
          {vinculos.map((v) => (
            <div
              key={v.id}
              className="grid min-h-12 grid-cols-1 gap-1 border-b border-[#EEF1F3] px-4 py-2 last:border-b-0 sm:grid-cols-[100px_minmax(0,1fr)_120px] sm:items-center sm:gap-3"
            >
              <span className="font-mono font-semibold">{v.unidadeCodigo}</span>
              <span className="text-[14px]">{ROTULO_VINCULO[v.tipo]}</span>
              <SeloVinculo status={v.status} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
