import type { VinculoView } from '@/api'
import { SeloVinculo } from '@/componentes/Badge'
import { Osso } from '@/componentes/Carregando'
import { Paginacao } from '@/componentes/Paginacao'
import { Tabs } from '@/componentes/Tabs'
import { ROTULO_VINCULO } from '@/domain/types'
import { fmtData } from '@/domain/time'
import type { useFilaVinculos } from './consultas'
import type { Aba } from './regras'

function ItemFila({
  v,
  ativo,
  onEscolher,
}: {
  v: VinculoView
  ativo: boolean
  onEscolher: (id: string) => void
}) {
  return (
    <button
      type="button"
      aria-current={ativo}
      onClick={() => onEscolher(v.id)}
      className={`flex w-full flex-col gap-1.5 rounded-[10px] border-2 px-4 py-[14px] text-left ${ativo ? 'border-[#0B5563] bg-[#F0F8F9]' : v.legadoVencido ? 'border-[#FDA29B] bg-[#FEF3F2]' : 'border-[#DCE1E5] bg-white'}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{v.pessoaNome}</span>
        <SeloVinculo status={v.status} tamanho="sm" />
      </span>
      <span className="text-[14px]">
        <span className="font-mono font-semibold">{v.unidadeCodigo}</span> ·{' '}
        {ROTULO_VINCULO[v.tipo]}
      </span>
      {v.status === 'legado' && v.prazoRegularizacao ? (
        <span
          className={`text-[13px] ${v.legadoVencido ? 'font-semibold text-[#B42318]' : 'text-[#56616B]'}`}
        >
          {v.legadoVencido ? 'Prazo vencido em' : 'Regularizar até'} {fmtData(v.prazoRegularizacao)}
        </span>
      ) : (
        <span className="text-[13px] text-[#56616B]">Solicitado em {fmtData(v.solicitadoEm)}</span>
      )}
    </button>
  )
}

/** Abas (pendentes, legados, decididos), a lista da página atual e a paginação. */
export function FilaVinculos({
  aba,
  onTrocarAba,
  fila,
  atualId,
  onEscolher,
  onIrPagina,
  nPend,
  nLeg,
  nVencidos,
}: {
  aba: Aba
  onTrocarAba: (a: Aba) => void
  fila: ReturnType<typeof useFilaVinculos>
  atualId: string | undefined
  onEscolher: (id: string) => void
  onIrPagina: (n: number) => void
  nPend: number | undefined
  nLeg: number | undefined
  nVencidos: number | undefined
}) {
  const lista = fila.itens
  return (
    <div className="flex flex-col gap-2">
      <Tabs
        compacta
        rotulo="Fila de vínculos"
        ativa={aba}
        onChange={onTrocarAba}
        abas={[
          { id: 'pendentes', rotulo: `Pendentes${nPend === undefined ? '' : ` (${nPend})`}` },
          { id: 'legados', rotulo: `Legados${nLeg === undefined ? '' : ` (${nLeg})`}` },
          { id: 'decididos', rotulo: 'Decididos' },
        ]}
      />
      {aba === 'legados' && (
        <p className="text-[13px] text-[#56616B]">
          Importados da planilha (RN-09). Valem até o prazo de regularização; {nVencidos ?? '…'} com
          prazo vencido, em destaque (os vencidos vêm primeiro).
        </p>
      )}
      <ul
        className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto"
        aria-label="Fila"
        aria-busy={fila.consulta.isLoading || fila.trocando || undefined}
      >
        {fila.consulta.isLoading &&
          [0, 1, 2, 3].map((i) => (
            <li
              key={i}
              aria-hidden
              className="apos-espera flex flex-col gap-2.5 rounded-[10px] border-2 border-[#DCE1E5] bg-white px-4 py-[14px]"
            >
              <Osso className="h-3.5 w-[60%]" />
              <Osso className="h-3 w-[40%]" />
            </li>
          ))}
        {!fila.consulta.isLoading && !fila.consulta.error && lista.length === 0 && (
          <li className="rounded-[10px] border border-dashed border-[#C5CDD3] bg-white p-4 text-[#56616B]">
            Nenhum vínculo nesta lista.
          </li>
        )}
        {lista.map((v) => (
          <li key={v.id}>
            <ItemFila v={v} ativo={atualId === v.id} onEscolher={onEscolher} />
          </li>
        ))}
      </ul>
      <Paginacao
        pagina={fila.pagina}
        totalPaginas={fila.totalPaginas}
        onIr={onIrPagina}
        rotulo="vínculos"
        ocupado={fila.trocando}
      />
    </div>
  )
}
