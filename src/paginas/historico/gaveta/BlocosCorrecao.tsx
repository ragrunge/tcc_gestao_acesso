import type { EventoView, ValoresCorrecao } from '@/domain/types'
import { useCatalogo } from '@/app/catalogo'
import { ROTULO_CAMPO, formatarValor, linhasCorrecao } from './formatar'

export function ValoresOriginais({ ev }: { ev: EventoView }) {
  const catalogo = useCatalogo()
  if (!ev.valoresOriginais || !ev.correcao) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#A9D2D8] bg-[#E3F0F2] px-[14px] py-3 text-[14px] text-[#0B4450]">
      <div className="font-semibold">
        Corrigido por {ev.correcao.operadorNome} ({ev.correcao.codigo}). Os valores acima já são os
        corrigidos; o registro original permanece inalterado.
      </div>
      <table className="w-full break-words text-left">
        <thead>
          <tr className="text-[13px] text-[#56616B]">
            <th className="font-semibold">Campo</th>
            <th className="font-semibold">Original</th>
            <th className="font-semibold">Corrigido</th>
          </tr>
        </thead>
        <tbody>
          {linhasCorrecao(ev, catalogo.codigo).map(([campo, antes, depois]) => (
            <tr key={campo}>
              <td className="pr-2 align-top">{campo}</td>
              <td className="pr-2 align-top line-through">{antes}</td>
              <td className="align-top font-semibold">{depois}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ev.correcao.justificativa && <div>Justificativa: {ev.correcao.justificativa}</div>}
    </div>
  )
}

export function ValoresCorrigidos({ ev }: { ev: EventoView }) {
  const catalogo = useCatalogo()
  if (ev.tipo !== 'correcao' || !ev.valoresCorrigidos) return null
  const fmt = (campo: keyof ValoresCorrecao, v: unknown) => formatarValor(campo, v, catalogo.codigo)
  return (
    <div className="rounded-lg border border-[#A9D2D8] bg-[#E3F0F2] px-[14px] py-3 text-[14px] text-[#0B4450]">
      <div className="font-semibold">Valores corrigidos por este registro</div>
      <ul className="list-disc pl-5">
        {Object.entries(ev.valoresCorrigidos).map(([k, v]) => (
          <li key={k}>
            {ROTULO_CAMPO[k as keyof ValoresCorrecao]}:{' '}
            {k === 'pessoaId'
              ? (ev.pessoaNomeCorrigida ?? String(v))
              : k === 'autorizadoPorPessoaId'
                ? (ev.autorizadoPorNomeCorrigido ?? '—')
                : fmt(k as keyof ValoresCorrecao, v)}
          </li>
        ))}
      </ul>
    </div>
  )
}
