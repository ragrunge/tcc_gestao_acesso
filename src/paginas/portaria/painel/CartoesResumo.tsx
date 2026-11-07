import { Link } from 'react-router-dom'
import { Osso } from '@/componentes/Carregando'
import type { PainelConsultas } from './consultas'

const cartaoCls =
  'flex flex-col gap-1.5 rounded-[10px] border border-[#DCE1E5] bg-white px-4 py-[14px] text-left text-ink hover:border-[#0B5563] md:px-5 md:py-[18px]'

type Props = Pick<PainelConsultas, 'resumo' | 'encs' | 'previas'> & {
  onAbrirPrevias: () => void
}

export function CartoesResumo({ resumo, encs, previas, onAbrirPrevias }: Props) {
  const r = resumo.data
  const cartoes = [
    { rotulo: 'Presentes agora', valor: r?.pessoasDentro, sub: 'Ver lista →', para: '/pessoas' },
    {
      rotulo: 'Encomendas aguardando',
      valor: r?.encomendasPendentes,
      sub: (() => {
        const n = encs.data?.atrasadas ?? 0
        return n > 0 ? `${n} há mais de ${encs.data!.diasAtraso} dias →` : 'Ver encomendas →'
      })(),
      para: '/encomendas',
    },
    {
      rotulo: 'Ocorrências abertas',
      valor: r?.ocorrenciasAbertas,
      sub: 'Ver ocorrências →',
      para: '/ocorrencias',
    },
  ]

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      aria-busy={resumo.isLoading || undefined}
    >
      {cartoes.map((c) => (
        <Link key={c.rotulo} to={c.para} className={cartaoCls}>
          <span className="text-[14px] text-[#56616B]">{c.rotulo}</span>
          <span className="font-mono text-[34px] font-semibold leading-[1.1]">
            {c.valor ?? <ValorCarregando carregando={resumo.isLoading} />}
          </span>
          <span className="text-[13px] font-medium text-[#0B5563]">{c.sub}</span>
        </Link>
      ))}
      <button type="button" className={cartaoCls} onClick={onAbrirPrevias}>
        <span className="text-[14px] text-[#56616B]">Autorizações prévias hoje</span>
        <span className="font-mono text-[34px] font-semibold leading-[1.1]">
          {r?.autorizacoesHoje ?? <ValorCarregando carregando={resumo.isLoading} />}
        </span>
        <span className="text-[13px] font-medium text-[#0B5563]">
          {(() => {
            const n = (previas.data ?? []).filter((a) => !a.utilizadaEm).length
            return n > 0 ? `${n} ainda não utilizadas →` : 'Ver autorizações →'
          })()}
        </span>
      </button>
    </div>
  )
}

/** Número do cartão: osso enquanto o resumo do turno carrega, travessão se falhou. */
function ValorCarregando({ carregando }: { carregando: boolean }) {
  return carregando ? <Osso className="apos-espera my-[7px] h-[26px] w-14" /> : <>—</>
}
