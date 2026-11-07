import { Link } from 'react-router-dom'
import type { EventoView } from '@/domain/types'
import { fmtHora } from '@/domain/time'
import { textoAutorizacao, textoMeioLongo } from '@/paginas/common/evento'

const ROT = 'text-[13px] text-[#56616B]'

export function DadosEvento({ ev, podeSaida }: { ev: EventoView; podeSaida: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
      <div className="flex flex-col gap-0.5">
        <span className={ROT}>Registrado por</span>
        <span className="font-semibold">{ev.operadorNome}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={ROT}>Autorizado por</span>
        <span className="font-semibold">{textoAutorizacao(ev)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={ROT}>Meio de autorização</span>
        <span className="font-medium">{textoMeioLongo(ev)}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={ROT}>Saída</span>
        <span className="font-medium">
          {ev.saida
            ? fmtHora(ev.saida.em)
            : ev.tipo === 'entrada' && ev.dentro
              ? 'Ainda no condomínio'
              : '—'}
        </span>
        {/* Atalho para a tela de saída já com esta entrada escolhida (lá a saída ainda é confirmada) */}
        {podeSaida && ev.tipo === 'entrada' && ev.dentro && !ev.saida && (
          <Link
            to={`/saida?entrada=${ev.id}`}
            className="mt-1 inline-flex h-[44px] w-fit items-center rounded-lg border border-[#0B5563] bg-white px-3 text-[14px] font-semibold !text-[#0B5563] hover:bg-[#F0F8F9] lg:mouse:h-10"
          >
            Registrar saída
          </Link>
        )}
      </div>
    </div>
  )
}

export function NotasEvento({ ev }: { ev: EventoView }) {
  return (
    <>
      {ev.formularioContingencia && (
        <div className="text-[14px]">
          <span className={ROT}>Formulário de contingência</span>
          <div className="font-mono">nº {ev.formularioContingencia}</div>
        </div>
      )}

      {ev.justificativa && (
        <div className="rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-[14px] py-3 text-[#7A2E0E]">
          <div className="text-[13px] font-semibold">Justificativa</div>
          <div>{ev.justificativa}</div>
        </div>
      )}
      {ev.observacao && (
        <div className="text-[14px]">
          <span className={ROT}>Observação</span>
          <div>{ev.observacao}</div>
        </div>
      )}
    </>
  )
}
