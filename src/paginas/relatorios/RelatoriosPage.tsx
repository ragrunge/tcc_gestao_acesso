import { useMemo } from 'react'
import { useApi, type FiltroRelatorio } from '@/api'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { useToast } from '@/componentes/Toast'
import {
  ROTULO_CATEGORIA,
  ROTULO_MEIO,
  type CategoriaPessoa,
  type MeioAutorizacao,
} from '@/domain/types'
import { fmtData, fimDoDia, fromInput } from '@/domain/time'
import { mensagemErro, useAsync } from '@/app/useAsync'
import { baixarArquivo } from '@/paginas/historico/download'
import { ErroCarregar, Esqueleto, Osso } from '@/componentes/Carregando'
import {
  BarraFiltros,
  CampoFiltro,
  CONTROLE,
  FiltroPeriodo,
  FiltroUnidade,
  lerOpcao,
  naUrl,
  useFiltrosUrl,
  useFiltroUnidade,
  usePeriodoUrl,
} from '@/componentes/Filtros'
import { secao } from './Barras'
import { GraficoAcessosDia } from './GraficoAcessosDia'
import { PaineisResumo } from './PaineisResumo'

export function RelatoriosPage() {
  const api = useApi()
  const { avisar } = useToast()
  // Na URL: período (padrão: últimos 30 dias), unidade, tipo de pessoa e meio
  const { params, gravar } = useFiltrosUrl()
  const periodo = usePeriodoUrl(30)
  const { de, ate } = periodo
  const unid = useFiltroUnidade()
  const categoria = lerOpcao(
    params.get('cat'),
    ['', ...Object.keys(ROTULO_CATEGORIA)] as ('' | CategoriaPessoa)[],
    '',
  )
  const meio = lerOpcao(
    params.get('meio'),
    ['', ...Object.keys(ROTULO_MEIO)] as ('' | MeioAutorizacao)[],
    '',
  )
  // RF-30/RF-31: período (padrão últimos 30 dias), unidade, tipo de pessoa e meio de autorização
  const filtro: FiltroRelatorio = useMemo(
    () => ({
      de: de ? (fromInput(de) ?? undefined) : undefined,
      ate: ate ? fimDoDia(fromInput(ate) ?? 0) : undefined,
      unidadeId: unid.unidadeId,
      categoria: (categoria || undefined) as CategoriaPessoa | undefined,
      meio: (meio || undefined) as MeioAutorizacao | undefined,
    }),
    [de, ate, unid.unidadeId, categoria, meio],
  )
  const rel = useAsync(() => api.relatorios.resumo(filtro), [JSON.stringify(filtro)])
  const r = rel.data
  const ativos = [periodo.ativo, !!unid.texto.trim(), !!categoria, !!meio].filter(Boolean).length
  const limpar = () => {
    periodo.limpar()
    unid.limpar()
    gravar({ cat: undefined, meio: undefined })
  }
  async function exportarCsv() {
    try {
      const p = await api.relatorios.exportarCsv(filtro)
      baixarArquivo(p.nomeArquivo, p.conteudo, 'text/csv')
      avisar({
        titulo: 'Relatório exportado',
        texto: `Arquivo ${p.nomeArquivo} gerado com os filtros aplicados.`,
      })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Relatórios"
        descricao={
          r ? `${fmtData(r.periodo.de)} a ${fmtData(r.periodo.ate)}` : 'Carregando período…'
        }
        acoes={
          <>
            <Button variante="contorno" onClick={() => void exportarCsv()}>
              Exportar CSV
            </Button>
            <Button variante="primario" onClick={() => window.print()}>
              Exportar PDF
            </Button>
          </>
        }
      />
      <BarraFiltros rotulo="Filtros do relatório" ativos={ativos} onLimpar={limpar}>
        <FiltroPeriodo de={de} ate={ate} onChange={periodo.alterar} atalhos />
        <FiltroUnidade f={unid} />
        <CampoFiltro rotulo="Tipo de pessoa" largura="md:w-44">
          <select
            className={CONTROLE}
            value={categoria}
            onChange={(e) => gravar({ cat: naUrl(e.target.value, '') })}
          >
            <option value="">Todos</option>
            {(Object.keys(ROTULO_CATEGORIA) as CategoriaPessoa[]).map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA[c]}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Meio de autorização" largura="md:w-52">
          <select
            className={CONTROLE}
            value={meio}
            onChange={(e) => gravar({ meio: naUrl(e.target.value, '') })}
          >
            <option value="">Todos</option>
            {(Object.keys(ROTULO_MEIO) as MeioAutorizacao[]).map((m) => (
              <option key={m} value={m}>
                {ROTULO_MEIO[m]}
              </option>
            ))}
          </select>
        </CampoFiltro>
      </BarraFiltros>
      {rel.error && <ErroCarregar mensagem={rel.error} onTentar={rel.recarregar} />}
      {!r && !rel.error && (
        <Esqueleto rotulo="relatório" className="flex flex-col gap-5">
          <div className={secao}>
            <Osso className="h-4 w-[160px]" />
            <Osso className="mt-2 h-[180px] w-full" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className={secao}>
                <Osso className="h-4 w-[140px]" />
                {[0, 1, 2, 3].map((l) => (
                  <Osso key={l} className="h-3.5 w-full" />
                ))}
              </div>
            ))}
          </div>
        </Esqueleto>
      )}
      {r && (
        <>
          <GraficoAcessosDia r={r} />
          <PaineisResumo r={r} />
        </>
      )}
    </div>
  )
}
