import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useApi, type OcorrenciaView } from '@/api'
import { useAuth, useCan } from '@/auth/AuthContext'
import { SeloOcorrencia } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { Cel, Lista, ListaCab, ListaLinha, Vazio } from '@/componentes/Table'
import { Tabs } from '@/componentes/Tabs'
import { useToast } from '@/componentes/Toast'
import { ROTULO_TIPO_OCORRENCIA, type StatusOcorrencia, type TipoOcorrencia } from '@/domain/types'
import { fmtDataHora } from '@/domain/time'
import { useCatalogo } from '@/app/catalogo'
import { mensagemErro } from '@/app/useAsync'
import { APOS_OCORRENCIA, CHAVES, useInvalidar } from '@/app/consultas'
import { ErroCarregar } from '@/componentes/Carregando'
import {
  BarraFiltros,
  CampoFiltro,
  CONTROLE,
  ContagemResultado,
  FiltroUnidade,
  lerOpcao,
  naUrl,
  useFiltrosUrl,
  useFiltroUnidade,
} from '@/componentes/Filtros'
import { Paginacao, Totais } from '@/componentes/Paginacao'
import { usePaginacao } from '@/app/paginacao'
import { DetalheModal } from './DetalheModal'
import { NovaOcorrenciaModal } from './NovaOcorrenciaModal'

// Cabe sem rolagem lateral com o menu aberto em 1280 px (área útil ~972 px; ver larguraMinima em Table.tsx)
const COLUNAS = '100px 130px 170px 80px minmax(0,1fr) 110px 130px'

/** Parâmetros dos filtros na URL: aba, unidade (código) e tipo. Não confundir com os de pré-preenchimento do formulário (novo=1). */
const PARAMS_FILTRO = ['aba', 'un', 'tp', 'pagina']

const TIPOS_OCORRENCIA = Object.keys(ROTULO_TIPO_OCORRENCIA) as TipoOcorrencia[]

type Filtro = 'todas' | 'abertas' | 'encerradas'

const STATUS_DO_FILTRO: Record<Filtro, StatusOcorrencia[] | undefined> = {
  todas: undefined,
  abertas: ['aberta', 'em_andamento'],
  encerradas: ['encerrada'],
}

export function OcorrenciasPage() {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const { avisar } = useToast()
  const podeOperar = useCan('ocorrencia.operar')
  const { usuario } = useAuth()
  const { gravar } = useFiltrosUrl()
  const filtro = lerOpcao(params.get('aba'), ['todas', 'abertas', 'encerradas'] as const, 'todas')
  const tipoFiltro = lerOpcao(
    params.get('tp'),
    ['', ...TIPOS_OCORRENCIA] as ('' | TipoOcorrencia)[],
    '',
  )
  const unid = useFiltroUnidade()
  const [nova, setNova] = useState<Record<string, string> | null>(null)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const { codigo } = useCatalogo()
  const invalidar = useInvalidar()

  const pag = usePaginacao<OcorrenciaView>({
    chave: CHAVES.ocorrenciasLista(filtro, tipoFiltro, unid.unidadeId),
    buscar: (pos) =>
      api.ocorrencias.listarPagina({
        status: STATUS_DO_FILTRO[filtro],
        tipo: tipoFiltro || undefined,
        unidadeId: unid.unidadeId,
        ...pos,
      }),
    habilitado: !unid.pendente,
  })
  const lista = pag.consulta
  const resumo = useQuery({
    queryKey: CHAVES.ocorrenciasResumo,
    queryFn: () => api.ocorrencias.resumo(),
    staleTime: 0,
  }).data

  // F4 (ou o fluxo de restrição na entrada) abre o formulário já preenchido
  useEffect(() => {
    if (params.get('novo') === '1' && podeOperar) {
      // Os filtros da lista ficam na URL; o resto (tipo, unidade, evento...) pré-preenche o formulário e sai
      setNova(Object.fromEntries([...params.entries()].filter(([k]) => !PARAMS_FILTRO.includes(k))))
      setParams(
        new URLSearchParams([...params.entries()].filter(([k]) => PARAMS_FILTRO.includes(k))),
        { replace: true },
      )
    }
  }, [params, podeOperar, setParams])

  const dados = pag.itens
  const daLista = dados.find((o) => o.id === abertaId)
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Ocorrências"
        descricao="Fatos do turno com envolvidos e eventos de acesso vinculados."
        acoes={
          podeOperar && (
            <Button variante="primario" atalho="F4" onClick={() => setNova({})}>
              Nova ocorrência
            </Button>
          )
        }
      />
      <Totais
        rotulo="Ocorrências por situação"
        itens={[
          { rotulo: 'Abertas', valor: resumo?.aberta, destaque: 'ambar' },
          { rotulo: 'Em andamento', valor: resumo?.emAndamento },
          { rotulo: 'Encerradas', valor: resumo?.encerrada },
          { rotulo: 'Total', valor: resumo?.total },
        ]}
      />
      <BarraFiltros
        ativos={(unid.texto.trim() ? 1 : 0) + (tipoFiltro ? 1 : 0)}
        principalAtivo={!!unid.texto.trim()}
        onLimpar={() => {
          unid.limpar()
          gravar({ tp: undefined })
        }}
        principal={<FiltroUnidade f={unid} />}
      >
        <CampoFiltro rotulo="Tipo" largura="md:w-64">
          <select
            className={CONTROLE}
            value={tipoFiltro}
            onChange={(e) => gravar({ tp: naUrl(e.target.value, '') })}
          >
            <option value="">Todos</option>
            {TIPOS_OCORRENCIA.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_OCORRENCIA[t]}
              </option>
            ))}
          </select>
        </CampoFiltro>
      </BarraFiltros>
      {(unid.unidadeId || tipoFiltro) && (
        <ContagemResultado
          n={pag.total ?? dados.length}
          singular="ocorrência"
          plural="ocorrências"
          className="-mb-3 px-1"
        />
      )}
      <div className="rounded-[10px] border border-[#DCE1E5] bg-white">
        <Tabs
          rotulo="Situação das ocorrências"
          ativa={filtro}
          onChange={(a) => gravar({ aba: naUrl(a, 'todas') })}
          abas={[
            { id: 'todas', rotulo: 'Todas' },
            { id: 'abertas', rotulo: 'Abertas e em andamento' },
            { id: 'encerradas', rotulo: 'Encerradas' },
          ]}
        />
        {lista.error && (
          <div className="p-4">
            <ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} />
          </div>
        )}
        <Lista
          legenda="Ocorrências registradas"
          colunas={COLUNAS}
          empilhar
          className="!rounded-none !border-0"
          carregando={lista.isLoading}
        >
          <ListaCab
            rotulos={['Código', 'Data', 'Tipo', 'Unidade', 'Descrição', 'Status', 'Registrado por']}
          />
          {dados.map((o) => (
            <ListaLinha
              key={o.id}
              minH={56}
              padY={10}
              onClick={() => setAbertaId(o.id)}
              ariaLabel={`Abrir ocorrência ${o.codigo}`}
            >
              <Cel className="font-mono text-[13.5px]">{o.codigo}</Cel>
              <Cel className="text-[14px]">{fmtDataHora(o.abertaEm)}</Cel>
              <Cel className="font-medium">{ROTULO_TIPO_OCORRENCIA[o.tipo]}</Cel>
              <Cel className={o.unidadeId ? 'font-mono font-semibold' : 'text-[14px]'}>
                {o.unidadeId ? codigo(o.unidadeId) : 'Área comum'}
              </Cel>
              <Cel className="col-span-2 truncate text-[14px] text-[#33424B] md:col-span-1">
                {o.descricao}
              </Cel>
              <Cel>
                <SeloOcorrencia status={o.status} />
              </Cel>
              <Cel className="text-[14px]">{o.abertaPorNome}</Cel>
            </ListaLinha>
          ))}
        </Lista>
        {!lista.isLoading && !lista.error && dados.length === 0 && (
          <Vazio>Nenhuma ocorrência nesta lista.</Vazio>
        )}
        {pag.totalPaginas > 1 && (
          <div className="border-t border-[#E6EAED] p-3">
            <Paginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              onIr={pag.irPara}
              rotulo="ocorrências"
              ocupado={pag.trocando}
            />
          </div>
        )}
      </div>
      {nova && (
        <NovaOcorrenciaModal
          inicial={nova}
          onClose={() => setNova(null)}
          onFeito={(o, falhas) => {
            setNova(null)
            if (falhas.length)
              avisar({
                tom: 'ambar',
                titulo: `Ocorrência ${o.codigo} registrada`,
                texto: `Anexo não enviado: ${falhas.join(' ')} Abra a ocorrência para tentar de novo.`,
                duracao: 12000,
              })
            else avisar({ texto: `Ocorrência ${o.codigo} registrada.` })
            void invalidar(APOS_OCORRENCIA)
          }}
        />
      )}
      {abertaId && (
        <DetalheModal
          id={abertaId}
          inicial={daLista}
          onClose={() => setAbertaId(null)}
          podeOperarDe={(o) =>
            podeOperar && (usuario?.papel !== 'porteiro' || o.abertaPorId === usuario.id)
          }
        />
      )}
    </div>
  )
}
