import type { Veiculo } from '@/domain/types'
import { cartao, link, vazio } from './fichaUi'

export function SecaoVeiculos({
  veiculos,
  podeEditar,
  onNovo,
  onEditar,
}: {
  veiculos: Veiculo[]
  podeEditar: boolean
  onNovo: () => void
  onEditar: (v: Veiculo) => void
}) {
  return (
    <section className={cartao}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Veículos</h2>
        {podeEditar && (
          <button type="button" className={link} onClick={onNovo}>
            + Novo
          </button>
        )}
      </div>
      {veiculos.map((v) => (
        <div key={v.id} className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-mono text-[17px] font-semibold">{v.placa}</span>
            <span className="text-[14px] text-[#56616B]">
              {v.modelo} · {v.cor}
            </span>
          </div>
          {podeEditar && (
            <button
              type="button"
              className={link}
              aria-label={`Editar veículo ${v.placa}`}
              onClick={() => onEditar(v)}
            >
              Editar
            </button>
          )}
        </div>
      ))}
      {veiculos.length === 0 && <span className={vazio}>Nenhum veículo cadastrado.</span>}
    </section>
  )
}
