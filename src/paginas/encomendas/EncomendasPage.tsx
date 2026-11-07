import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, TriangleAlert } from 'lucide-react'
import { type EncomendaView } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { Cel, CelUnidade, Lista, ListaCab, ListaLinha, Vazio } from '@/componentes/Table'
import { Tabs } from '@/componentes/Tabs'
import { useToast } from '@/componentes/Toast'
import { diasDesde, encomendaAtrasada } from '@/domain/rules'
import { useCatalogo } from '@/app/catalogo'
import { fmtDataHora } from '@/domain/time'
import { mensagemErro, useAgora } from '@/app/useAsync'
import { APOS_ENCOMENDA, useInvalidar } from '@/app/consultas'
import { ErroCarregar } from '@/componentes/Carregando'
import {
  BarraFiltros,
  ContagemResultado,
  FiltroUnidade,
  lerOpcao,
  naUrl,
  useFiltrosUrl,
  useFiltroUnidade,
} from '@/componentes/Filtros'
import { Paginacao } from '@/componentes/Paginacao'
import { useEncomendasLista, useResumoEncomendas } from './consultas'
import { COL_AGUARDANDO, COL_ENTREGUES } from './constants'
import { ReceberModal } from './ReceberModal'
import { EntregarModal } from './EntregarModal'
import { AutorizarRetiradaModal } from './AutorizarRetiradaModal'

/** Transportadora e, embaixo, o código de rastreio (quando houver). */
function CelTransporte({ e }: { e: EncomendaView }) {
  return (
    <Cel className="flex flex-col gap-0.5">
      <span className="truncate text-[14px]">{e.transportadora}</span>
      {e.codigoRastreio && (
        <span className="truncate font-mono text-[12.5px] text-[#56616B]">{e.codigoRastreio}</span>
      )}
    </Cel>
  )
}

const idade = (dias: number) => (dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`)

export function EncomendasPage() {
  const [params, setParams] = useSearchParams()
  const { avisar } = useToast()
  const agora = useAgora(30000)
  const podeOperar = useCan('encomenda.operar')
  const podeAutorizar = useCan('encomenda.autorizar_retirada')
  const { codigo } = useCatalogo()
  // Na URL: aba (aguardando/entregue) e unidade (código, ex.: un=D-32). Os demais parâmetros (novo=1) ficam como estão.
  const { gravar } = useFiltrosUrl()
  const aba = lerOpcao(params.get('aba'), ['aguardando', 'entregue'] as const, 'aguardando')
  const unid = useFiltroUnidade()
  const [receber, setReceber] = useState(false)
  const [entregando, setEntregando] = useState<EncomendaView | null>(null)
  const [autorizando, setAutorizando] = useState<EncomendaView | null>(null)
  const invalidar = useInvalidar()
  // React Query: receber, entregar e autorizar invalidam o prefixo 'encomendas' (filas e contagens) e o turno (painel)
  const pag = useEncomendasLista(aba, unid.unidadeId, !unid.pendente)
  const lista = pag.consulta
  const resumo = useResumoEncomendas()
  const depoisDeEscrever = () => void invalidar(APOS_ENCOMENDA)

  // F3 abre o recebimento direto
  useEffect(() => {
    if (params.get('novo') === '1' && podeOperar) {
      setReceber(true)
      params.delete('novo')
      setParams(params, { replace: true })
    }
  }, [params, podeOperar, setParams])

  const dados = pag.itens
  const nAguardando = resumo.data?.aguardando ?? 0
  const nAtrasadas = resumo.data?.atrasadas ?? 0
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Encomendas"
        descricao={`${nAguardando} aguardando retirada · ${nAtrasadas} há mais de 7 dias. Entrega só para pessoa com vínculo na unidade.`}
        acoes={
          podeOperar && (
            <Button variante="primario" atalho="F3" onClick={() => setReceber(true)}>
              Receber encomenda
            </Button>
          )
        }
      />

      <BarraFiltros
        ativos={unid.texto.trim() ? 1 : 0}
        principalAtivo={!!unid.texto.trim()}
        onLimpar={unid.limpar}
        principal={<FiltroUnidade f={unid} />}
      />
      {unid.unidadeId && (
        <ContagemResultado
          n={pag.total ?? dados.length}
          singular="encomenda"
          plural="encomendas"
          sufixo="na unidade"
          className="-mb-3 px-1"
        />
      )}
      <div className="rounded-[10px] border border-[#DCE1E5] bg-white">
        <Tabs
          rotulo="Situação das encomendas"
          ativa={aba}
          onChange={(a) => gravar({ aba: naUrl(a, 'aguardando') })}
          abas={[
            { id: 'aguardando', rotulo: `Aguardando retirada (${nAguardando})` },
            { id: 'entregue', rotulo: `Entregues (${resumo.data?.entregues ?? 0})` },
          ]}
        />
        {lista.error && (
          <div className="p-4">
            <ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} />
          </div>
        )}
        {aba === 'aguardando' ? (
          <Lista
            legenda="Encomendas aguardando retirada"
            colunas={COL_AGUARDANDO}
            empilhar
            className="!rounded-none !border-0"
            carregando={lista.isLoading}
          >
            <ListaCab
              rotulos={[
                'Unidade',
                'Destinatário',
                'Transportadora',
                'Recebida em',
                'Recebida por',
                '',
              ]}
            />
            {dados.map((e) => {
              const dias = diasDesde(e.recebidaEm, agora)
              const atrasada = encomendaAtrasada(e.recebidaEm, agora)
              return (
                <ListaLinha key={e.id} destaque={atrasada ? 'ambar' : undefined} minH={56} padY={8}>
                  <CelUnidade id={e.unidadeId} className="text-[17px]" />
                  <Cel className="truncate font-medium">{e.destinatario}</Cel>
                  <CelTransporte e={e} />
                  <Cel className="flex flex-col gap-0.5">
                    <span className="text-[14px]">{fmtDataHora(e.recebidaEm)}</span>
                    <span
                      className={`inline-flex h-[22px] items-center gap-[5px] self-start rounded-[5px] border px-[7px] text-[12px] font-semibold ${
                        atrasada
                          ? 'border-[#FEC84B] bg-[#FEF0C7] text-[#93370D]'
                          : 'border-[#D5DDE2] bg-[#EEF2F4] text-[#33424B]'
                      }`}
                    >
                      {atrasada && (
                        <TriangleAlert className="h-3 w-3" strokeWidth={2.6} aria-hidden />
                      )}
                      {idade(dias)}
                    </span>
                  </Cel>
                  <Cel className="flex flex-col gap-0.5 text-[14px]">
                    <span className="truncate">{e.recebidaPorNome}</span>
                    {e.autorizacoes.length > 0 && (
                      <span className="text-[12px] text-[#0B4450]">
                        Autorizado: {e.autorizacoes.map((a) => a.pessoaNome).join(', ')}
                      </span>
                    )}
                  </Cel>
                  <Cel className="col-span-2 flex flex-col gap-1 md:col-span-1">
                    {podeOperar && (
                      <button
                        type="button"
                        onClick={() => setEntregando(e)}
                        aria-label={`Entregar encomenda ${e.codigo}`}
                        className="h-[44px] w-full rounded-lg border border-[#B9C3CA] bg-white text-[14px] font-medium hover:border-[#0B5563] hover:text-[#0B5563]"
                      >
                        Entregar
                      </button>
                    )}
                    {podeAutorizar && (
                      <button
                        type="button"
                        onClick={() => setAutorizando(e)}
                        aria-label={`Autorizar retirada da encomenda ${e.codigo}`}
                        className="flex min-h-[44px] items-center justify-center text-[12.5px] font-semibold text-[#0B5563] hover:underline lg:mouse:min-h-0"
                      >
                        Autorizar retirada
                      </button>
                    )}
                  </Cel>
                </ListaLinha>
              )
            })}
          </Lista>
        ) : (
          <Lista
            legenda="Encomendas entregues"
            colunas={COL_ENTREGUES}
            empilhar
            className="!rounded-none !border-0"
            carregando={lista.isLoading}
          >
            <ListaCab
              rotulos={[
                'Unidade',
                'Destinatário',
                'Transportadora',
                'Entregue em',
                'Entregue a',
                'Entregue por',
              ]}
            />
            {dados.map((e) => (
              <ListaLinha key={e.id} minH={56} padY={8}>
                <CelUnidade id={e.unidadeId} className="text-[17px]" />
                <Cel className="truncate font-medium">{e.destinatario}</Cel>
                <CelTransporte e={e} />
                <Cel className="text-[14px]">{e.retiradaEm && fmtDataHora(e.retiradaEm)}</Cel>
                <Cel className="flex items-center gap-1.5 font-medium text-[#05603A]">
                  <Check className="h-4 w-4 shrink-0" strokeWidth={2.6} aria-hidden />
                  <span className="truncate">{e.retiradaPorNome}</span>
                </Cel>
                <Cel className="truncate text-[14px]">{e.retiradaRegistradaPorNome}</Cel>
              </ListaLinha>
            ))}
          </Lista>
        )}
        {!lista.isLoading && !lista.error && dados.length === 0 && (
          <Vazio>Nenhuma encomenda nesta lista.</Vazio>
        )}
        {pag.totalPaginas > 1 && (
          <div className="border-t border-[#E6EAED] p-3">
            <Paginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              onIr={pag.irPara}
              rotulo="encomendas"
              ocupado={pag.trocando}
            />
          </div>
        )}
      </div>

      {receber && (
        <ReceberModal
          onClose={() => setReceber(false)}
          onFeito={(e) => {
            setReceber(false)
            avisar({
              texto: `Encomenda ${e.codigo} registrada para ${codigo(e.unidadeId)}. Avise a unidade pelo interfone.`,
            })
            depoisDeEscrever()
          }}
        />
      )}
      {entregando && (
        <EntregarModal
          encomenda={entregando}
          onClose={() => setEntregando(null)}
          onFeito={(e, nome) => {
            setEntregando(null)
            avisar({ texto: `Encomenda ${e.codigo} entregue a ${nome}.` })
            depoisDeEscrever()
          }}
        />
      )}
      {autorizando && (
        <AutorizarRetiradaModal
          encomenda={autorizando}
          onClose={() => setAutorizando(null)}
          onFeito={(nome) => {
            setAutorizando(null)
            avisar({ texto: `${nome} autorizado(a) a retirar a encomenda ${autorizando.codigo}.` })
            depoisDeEscrever()
          }}
        />
      )}
    </div>
  )
}
