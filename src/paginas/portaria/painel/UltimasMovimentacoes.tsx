import { ErroCarregar } from '@/componentes/Carregando'
import { Cel, CelUnidade, Lista, ListaCab, ListaLinha, Vazio } from '@/componentes/Table'
import { ROTULO_CATEGORIA, type EventoView } from '@/domain/types'
import { AutorizacaoEvento, destaqueEvento, quandoCurto } from '@/paginas/common/evento'
import type { PainelConsultas } from './consultas'

const COLUNAS = '112px minmax(0,1.5fr) 80px 110px minmax(0,1.8fr) minmax(0,1fr)'

type Props = {
  eventos: PainelConsultas['eventos']
  agora: number
  onAbrir: (e: EventoView) => void
}

export function UltimasMovimentacoes({ eventos, agora, onAbrir }: Props) {
  return (
    <section className="rounded-[10px] border border-[#DCE1E5] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#E6EAED] px-4 py-4 md:px-5">
        <h2 className="text-[17px] font-semibold">Últimas movimentações</h2>
        <span className="text-[13px] text-[#56616B]">
          Clique em uma linha para ver o registro completo
        </span>
      </div>
      {eventos.error && (
        <div className="p-4">
          <ErroCarregar
            mensagem="Não foi possível carregar as movimentações."
            onTentar={() => eventos.refetch()}
          />
        </div>
      )}
      <Lista
        legenda="Últimas movimentações de acesso"
        colunas={COLUNAS}
        empilhar
        className="!rounded-none !border-0"
        carregando={eventos.isLoading}
        linhasCarregando={6}
      >
        <ListaCab rotulos={['Hora', 'Nome', 'Unidade', 'Tipo', 'Autorização', 'Registrado por']} />
        {(eventos.data ?? []).map((e) => (
          <ListaLinha key={e.id} destaque={destaqueEvento(e)} onClick={() => onAbrir(e)} padY={12}>
            <Cel className="whitespace-nowrap font-mono text-[14px]">
              {quandoCurto(e.ocorridoEm, agora)}
            </Cel>
            <Cel className="truncate font-medium">{e.pessoaNome}</Cel>
            <CelUnidade id={e.unidadeDestinoId} texto={e.unidadeRotulo} />
            <Cel className="text-[14px] text-[#33424B]">{ROTULO_CATEGORIA[e.categoriaPessoa]}</Cel>
            <Cel className="col-span-2 md:col-span-1">
              <AutorizacaoEvento ev={e} />
            </Cel>
            <Cel className="text-[14px] text-[#33424B]">{e.operadorNome}</Cel>
          </ListaLinha>
        ))}
      </Lista>
      {eventos.data?.length === 0 && <Vazio>Nenhuma movimentação registrada.</Vazio>}
    </section>
  )
}
