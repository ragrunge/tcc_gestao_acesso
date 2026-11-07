import { Link } from 'react-router-dom'
import type { EncomendaView } from '@/api'
import type { Unidade } from '@/domain/types'
import { Badge } from '@/componentes/Badge'
import { fmtData } from '@/domain/time'
import { codigoUnidade } from '@/domain/units'
import { link, vazio } from './fichaUi'

export function SecaoEncomendas({
  unidade,
  encomendas,
}: {
  unidade: Unidade
  encomendas: { aguardando: number; atrasadas: number; itens: EncomendaView[] }
}) {
  return (
    <section
      className="rounded-[10px] border border-[#DCE1E5] bg-white"
      aria-labelledby="enc-unidade"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EAED] px-5 py-[10px]">
        <h2 id="enc-unidade" className="text-[16px] font-semibold">
          Encomendas aguardando retirada ({encomendas.aguardando})
        </h2>
        <div className="flex items-center gap-3">
          {encomendas.atrasadas > 0 && (
            <Badge tom="ambar" tamanho="xs">
              {encomendas.atrasadas} há mais de 7 dias
            </Badge>
          )}
          <Link className={link} to={`/encomendas?un=${codigoUnidade(unidade)}`}>
            Ver todas da unidade
          </Link>
        </div>
      </div>
      {encomendas.itens.map((e) => (
        <div
          key={e.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[#E6EAED] px-5 py-[10px] last:border-b-0"
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{e.destinatario}</span>
            <span className="text-[13px] text-[#56616B]">
              {e.codigo}
              {e.transportadora ? ` · ${e.transportadora}` : ''}
              {e.codigoRastreio ? ` · ${e.codigoRastreio}` : ''}
            </span>
          </div>
          <span className="text-[13px] text-[#56616B]">Recebida em {fmtData(e.recebidaEm)}</span>
        </div>
      ))}
      {encomendas.aguardando === 0 && (
        <div className={`px-5 py-4 ${vazio}`}>Nenhuma encomenda aguardando.</div>
      )}
      {encomendas.aguardando > encomendas.itens.length && (
        <div className={`px-5 py-3 ${vazio}`}>
          Mostrando as {encomendas.itens.length} mais antigas.
        </div>
      )}
    </section>
  )
}
