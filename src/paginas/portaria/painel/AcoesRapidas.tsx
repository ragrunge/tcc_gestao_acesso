import { Link } from 'react-router-dom'

const TECLA =
  'hidden rounded-md border px-[10px] py-[6px] font-mono text-[16px] font-semibold lg:block'
const acaoCls =
  'flex h-[88px] items-center justify-between gap-3 rounded-xl px-5 text-left md:h-[112px] md:px-7'

export function AcoesRapidas() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      <Link to="/entrada" className={`${acaoCls} bg-[#0B5563] !text-white hover:bg-[#08434E]`}>
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-semibold">Nova entrada</span>
          <span className="text-[14px] text-[#CFE6EA]">Visitante, prestador ou funcionário</span>
        </span>
        <kbd className={`${TECLA} border-white/45`}>F2</kbd>
      </Link>
      <Link
        to="/saida"
        className={`${acaoCls} border-2 border-[#0B5563] bg-white !text-[#0B5563] hover:bg-[#F0F8F9]`}
      >
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-semibold">Registrar saída</span>
          <span className="text-[14px] text-[#33424B]">Busca entre quem está dentro</span>
        </span>
        <kbd className={`${TECLA} border-[#0B5563]/50`}>F8</kbd>
      </Link>
      <Link
        to="/encomendas?novo=1"
        className={`${acaoCls} border border-[#C5CDD3] bg-white !text-ink hover:border-[#0B5563]`}
      >
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-semibold">Encomenda</span>
          <span className="text-[14px] text-[#56616B]">Receber ou entregar</span>
        </span>
        <kbd className={`${TECLA} border-[#B9C3CA]`}>F3</kbd>
      </Link>
      <Link
        to="/ocorrencias?novo=1"
        className={`${acaoCls} border border-[#C5CDD3] bg-white !text-ink hover:border-[#0B5563]`}
      >
        <span className="flex flex-col gap-1">
          <span className="text-[22px] font-semibold">Ocorrência</span>
          <span className="text-[14px] text-[#56616B]">Registrar fato do turno</span>
        </span>
        <kbd className={`${TECLA} border-[#B9C3CA]`}>F4</kbd>
      </Link>
    </div>
  )
}
