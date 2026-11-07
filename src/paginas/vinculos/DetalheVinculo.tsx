import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import type { VinculoView } from '@/api'
import { Badge } from '@/componentes/Badge'
import { ROTULO_VINCULO } from '@/domain/types'
import { fmtData, fmtDataHora } from '@/domain/time'
import { useCatalogo } from '@/app/catalogo'
import { ConferenciaComprovanteBloco } from './ConferenciaComprovanteBloco'
import { PainelDecisao } from './PainelDecisao'
import type { DecisaoVinculo } from './useDecisaoVinculo'

function textoVigencia(v: VinculoView): string {
  if (v.vigenciaFim)
    return `${v.vigenciaInicio ? fmtData(v.vigenciaInicio) : '—'} a ${fmtData(v.vigenciaFim)}`
  return v.vigenciaInicio ? `desde ${fmtData(v.vigenciaInicio)}` : 'Indeterminada'
}

export function DetalheVinculo({
  atual,
  d,
  podeDecidir,
  titulo,
  recarregar,
  onAbrirFicha,
}: {
  atual: VinculoView
  d: DecisaoVinculo
  podeDecidir: boolean
  titulo: Ref<HTMLHeadingElement>
  recarregar: () => Promise<unknown>
  onAbrirFicha: (pessoaId: string) => void
}) {
  const { rotulo } = useCatalogo()
  const rot = 'text-[13px] text-[#56616B]'
  return (
    <div className="flex flex-col gap-[18px] rounded-[10px] border border-[#DCE1E5] bg-white px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            ref={titulo}
            tabIndex={-1}
            className="scroll-mt-4 text-[22px] font-semibold outline-none"
          >
            {atual.pessoaNome} · {ROTULO_VINCULO[atual.tipo]}
          </h2>
          <Link
            to={`/unidades/${atual.unidadeId}`}
            className="mt-1 flex min-h-[44px] items-center font-mono text-[22px] font-semibold !text-[#0B3F49] hover:underline lg:mouse:min-h-0"
          >
            {rotulo(atual.unidadeId)}
          </Link>
        </div>
        {(atual.status === 'pendente' || atual.status === 'legado') && (
          <Badge tom={d.conferido ? 'verde' : 'ambar'} tamanho="sm">
            {d.conferido ? 'Comprovante conferido' : 'Comprovante não conferido'}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[14px] md:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className={rot}>CPF</span>
          <span className="font-mono">{atual.pessoaDocumento}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Vigência</span>
          <span className="font-mono sm:whitespace-nowrap">{textoVigencia(atual)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Solicitado em</span>
          <span className="font-mono">{fmtDataHora(atual.solicitadoEm)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={rot}>Solicitado por</span>
          <span>{atual.solicitadoPor}</span>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <ConferenciaComprovanteBloco
          key={atual.id}
          vinculo={atual}
          podeRegistrar={podeDecidir && (atual.status === 'pendente' || atual.status === 'legado')}
          onRegistrado={recarregar}
        />
        <PainelDecisao atual={atual} d={d} podeDecidir={podeDecidir} onAbrirFicha={onAbrirFicha} />
      </div>
    </div>
  )
}
