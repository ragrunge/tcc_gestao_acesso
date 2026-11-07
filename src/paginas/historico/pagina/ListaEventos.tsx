import type { ResultadoIntegridade } from '@/domain/hashChain'
import { Badge } from '@/componentes/Badge'
import { Cel, CelUnidade, Lista, ListaCab, ListaLinha, Vazio } from '@/componentes/Table'
import type { EventoView } from '@/domain/types'
import { fmtData, fmtHora } from '@/domain/time'
import { destaqueEvento } from '@/paginas/common/evento'
import { Autorizacao, Integridade } from './CelulasEvento'
import { COLUNAS, EVENTO } from './constantes'

export function ListaEventos({
  dados,
  integ,
  carregando,
  vazio,
  onAbrir,
}: {
  dados: EventoView[]
  integ: ResultadoIntegridade | null
  carregando: boolean
  vazio: boolean
  onAbrir: (e: EventoView) => void
}) {
  const invalidoSeq = integ && !integ.valido ? integ.primeiroSeqInvalido : undefined
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#DCE1E5] bg-white">
      <Lista
        legenda="Eventos de acesso"
        colunas={COLUNAS}
        empilhar
        className="!rounded-none !border-0"
        carregando={carregando}
        linhasCarregando={8}
      >
        <ListaCab
          padY={10}
          rotulos={[
            'Data e hora',
            'Evento',
            'Pessoa',
            'Unid.',
            'Autorização',
            'Registrado por',
            'Integridade',
          ]}
        />
        {dados.map((e) => {
          const ruim = invalidoSeq !== undefined && e.seq === invalidoSeq
          return (
            <ListaLinha
              key={e.id}
              minH={50}
              destaque={
                ruim ? 'vermelho' : (destaqueEvento(e) ?? (e.retroativo ? 'novo' : undefined))
              }
              onClick={() => onAbrir(e)}
              ariaLabel={`Abrir evento ${e.codigo}`}
            >
              <Cel className="font-mono text-[14px]">
                {fmtData(e.ocorridoEm)} {fmtHora(e.ocorridoEm)}
              </Cel>
              <Cel>
                <Badge tom={EVENTO[e.tipo].tom} icone={EVENTO[e.tipo].icone} tamanho="sm">
                  {EVENTO[e.tipo].texto}
                </Badge>
              </Cel>
              <Cel className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{e.pessoaNome}</span>
                <span className="font-mono text-[12.5px] text-[#56616B]">{e.codigo}</span>
              </Cel>
              <CelUnidade id={e.unidadeDestinoId} texto={e.unidadeRotulo} />
              <Cel className="col-span-2 md:col-span-1">
                <Autorizacao ev={e} />
              </Cel>
              <Cel className="text-[14px]">{e.operadorNome}</Cel>
              <Cel>
                <Integridade seq={e.seq} integ={integ} />
              </Cel>
            </ListaLinha>
          )
        })}
      </Lista>
      {vazio && <Vazio>Nenhum evento com estes filtros.</Vazio>}
    </div>
  )
}
