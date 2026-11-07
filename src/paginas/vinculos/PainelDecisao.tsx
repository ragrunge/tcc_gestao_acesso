import type { VinculoView } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Badge } from '@/componentes/Badge'
import { fmtDataHora } from '@/domain/time'
import { DecisaoPendente } from './DecisaoPendente'
import { EncerrarVinculo } from './EncerrarVinculo'
import { RegularizarLegado } from './RegularizarLegado'
import type { DecisaoVinculo } from './useDecisaoVinculo'

export function PainelDecisao({
  atual,
  d,
  podeDecidir,
  onAbrirFicha,
}: {
  atual: VinculoView
  d: DecisaoVinculo
  podeDecidir: boolean
  onAbrirFicha: (pessoaId: string) => void
}) {
  return (
    <div className="flex flex-col gap-[14px]">
      <h3 className="text-[15px] font-semibold">Decisão</h3>
      {atual.nota && (
        <div className="rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-3 py-[10px] text-[14px] text-[#7A2E0E]">
          {atual.nota}
        </div>
      )}
      <div className="h-px bg-[#E6EAED]" />

      {atual.status === 'pendente' && <DecisaoPendente atual={atual} d={d} />}
      {atual.status === 'legado' && !d.encerrando && (
        <RegularizarLegado
          atual={atual}
          d={d}
          podeDecidir={podeDecidir}
          onAbrirFicha={onAbrirFicha}
        />
      )}
      {atual.decididoEm && (
        <div
          className={`rounded-lg border px-[14px] py-3 font-medium ${atual.status === 'rejeitado' ? 'border-[#FDA29B] bg-[#FEE4E2] text-[#B42318]' : 'border-[#75E0A7] bg-[#DCFAE6] text-[#05603A]'}`}
        >
          <Badge tom={atual.status === 'rejeitado' ? 'vermelho' : 'verde'} tamanho="xs">
            {atual.status === 'rejeitado' ? 'Rejeitado' : 'Aprovado'}
          </Badge>{' '}
          por {atual.decididoPorNome} em {fmtDataHora(atual.decididoEm)}
          {atual.justificativa && atual.status !== 'encerrado' && (
            <>
              <br />
              Justificativa: {atual.justificativa}
            </>
          )}
        </div>
      )}
      {atual.status === 'encerrado' && (
        <div className="rounded-lg border border-[#D5DDE2] bg-[#EEF2F4] px-[14px] py-3 font-medium text-[#33424B]">
          <Badge tom="neutro" tamanho="xs">
            Encerrado
          </Badge>{' '}
          em {atual.encerradoEm ? fmtDataHora(atual.encerradoEm) : '—'}
          {atual.justificativa && (
            <>
              <br />
              Motivo: {atual.justificativa}
            </>
          )}
        </div>
      )}
      {/* RF-07: encerramento manual (aprovado ou legado). Pendente se rejeita; rejeitado e encerrado são finais. */}
      {podeDecidir && (atual.status === 'aprovado' || atual.status === 'legado') && (
        <EncerrarVinculo d={d} />
      )}
      {d.erro && atual.status === 'aprovado' && !d.encerrando && (
        <Alert tom="vermelho" role="alert">
          {d.erro}
        </Alert>
      )}
    </div>
  )
}
