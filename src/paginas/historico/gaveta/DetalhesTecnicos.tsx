import type { EventoView } from '@/domain/types'

/** Prova da trilha (hash chain): fechada por padrão, para quem audita ou precisa conferir. */
export function DetalhesTecnicos({ ev }: { ev: EventoView }) {
  return (
    <details className="text-[13px] text-[#56616B]">
      <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
      <dl className="mt-2 flex flex-col gap-1.5">
        <div>
          <dt className="inline">Código: </dt>
          <dd className="inline font-mono">
            {ev.codigo}
            {ev.saida && ` · saída ${ev.saida.codigo}`}
          </dd>
        </div>
        <div>
          <dt className="inline">Sequência na trilha: </dt>
          <dd className="inline font-mono">{ev.seq}</dd>
        </div>
        <div>
          <dt>Hash (sha256)</dt>
          <dd className="break-all font-mono text-[12px]">{ev.hash}</dd>
        </div>
        <div>
          <dt>Hash anterior</dt>
          <dd className="break-all font-mono text-[12px]">{ev.hashAnterior}</dd>
        </div>
      </dl>
    </details>
  )
}
