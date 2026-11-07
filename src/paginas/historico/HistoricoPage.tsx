import { useMemo, useState } from 'react'
import { type FiltroEventos } from '@/api'
import { Paginacao, Totais } from '@/componentes/Paginacao'
import { useCan } from '@/auth/AuthContext'
import { Tabs } from '@/componentes/Tabs'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { type EventoView, type MeioAutorizacao } from '@/domain/types'
import { fimDoDia, fromInput } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'
import { APOS_EVENTO, useInvalidar } from '@/app/consultas'
import { EventoGaveta } from './EventoGaveta'
import { SeloAncora } from './SeloAncora'
import { TrilhaAlteracoes } from './TrilhaAlteracoes'
import { useEventosLista, useOperadores } from './consultas'
import { AvisoIntegridade } from './pagina/AvisoIntegridade'
import { FiltrosHistorico } from './pagina/FiltrosHistorico'
import { ListaEventos } from './pagina/ListaEventos'
import { MEIOS, TIPOS } from './pagina/constantes'
import { useAcoesTrilha } from './pagina/useAcoesTrilha'
import { ErroCarregar } from '@/componentes/Carregando'
import {
  lerOpcao,
  naUrl,
  useFiltrosUrl,
  useFiltroUnidade,
  usePeriodoUrl,
} from '@/componentes/Filtros'

export function HistoricoPage() {
  const podeVerificar = useCan('auditoria.verificar')
  const podeExportar = useCan('auditoria.exportar')
  const { params, gravar } = useFiltrosUrl()
  // Na URL: período, unidade, porteiro, tipo, meio, checkboxes e aba. A pessoa (nome) e a placa ficam só no estado (dado pessoal).
  const periodo = usePeriodoUrl(7)
  const { de, ate } = periodo
  const unid = useFiltroUnidade()
  const [pessoa, setPessoa] = useState('')
  const [placa, setPlaca] = useState('')
  const tipo = lerOpcao(params.get('tipo'), TIPOS, '')
  const meio = lerOpcao(params.get('meio'), MEIOS, '')
  const exc = params.get('exc') === '1'
  const retro = params.get('retro') === '1'
  // Aba sem permissão (link copiado por outro perfil) volta para a trilha de acessos
  const abaUrl = lerOpcao(params.get('aba'), ['acessos', 'alteracoes'] as const, 'acessos')
  const aba = abaUrl === 'alteracoes' && !podeVerificar ? 'acessos' : abaUrl
  const [aberto, setAberto] = useState<EventoView | null>(null)

  const operadores = useOperadores()
  // Porteiro da URL que não existe na lista (link velho) volta ao padrão, depois que a lista carrega
  const opUrl = params.get('op') ?? ''
  const operadorId = operadores.data && !operadores.data.some(([id]) => id === opUrl) ? '' : opUrl
  const un = unid.unidadeId ?? null
  const filtro: FiltroEventos = useMemo(
    () => ({
      de: de ? (fromInput(de) ?? undefined) : undefined,
      ate: ate ? fimDoDia(fromInput(ate) ?? 0) : undefined,
      unidadeId: un ?? undefined,
      pessoa: pessoa || undefined,
      placa: placa || undefined,
      operadorId: operadorId || undefined,
      tipo: (tipo || undefined) as FiltroEventos['tipo'],
      meio: (meio || undefined) as MeioAutorizacao | undefined,
      somenteExcecoes: exc || undefined,
      somenteRetroativos: retro || undefined,
    }),
    [de, ate, un, pessoa, placa, operadorId, tipo, meio, exc, retro],
  )

  const invalidar = useInvalidar()
  const { integ, verificando, verificar, exportar } = useAcoesTrilha(filtro)
  const pag = useEventosLista(filtro)
  const lista = pag.consulta
  const porTipo = pag.trocando ? undefined : pag.dados?.porTipo

  const dados = pag.itens
  const ativos = [
    periodo.ativo,
    !!unid.texto.trim(),
    !!pessoa,
    !!placa,
    !!operadorId,
    !!tipo,
    !!meio,
    exc,
    retro,
  ].filter(Boolean).length
  const limpar = () => {
    periodo.limpar()
    unid.limpar()
    setPessoa('')
    setPlaca('')
    gravar({ op: undefined, tipo: undefined, meio: undefined, exc: undefined, retro: undefined })
  }
  // Escondido até a F5 migrar os selos: o texto promete âncora externa e o botão responde "não disponível".
  const mostraSelo = false

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Histórico e auditoria"
        descricao="Trilha só de inclusão. Nada é editado: correções são novos registros ligados ao original."
        acoes={
          <>
            {podeVerificar && (
              <Button
                variante="contorno"
                carregando={verificando}
                onClick={() => void verificar()}
                title="Confere se nenhum registro da trilha foi alterado ou removido"
              >
                Verificar integridade da trilha
              </Button>
            )}
            {podeExportar && (
              <Button
                variante="contorno"
                onClick={() => void exportar()}
                title="Cada registro leva o hash que o liga ao anterior"
              >
                Exportar trilha (arquivo verificável)
              </Button>
            )}
          </>
        }
      />

      {podeVerificar && (
        <Tabs
          rotulo="Trilhas"
          ativa={aba}
          onChange={(a) => gravar({ aba: naUrl(a, 'acessos'), pagina: undefined })}
          abas={[
            { id: 'acessos' as const, rotulo: 'Trilha de acessos' },
            { id: 'alteracoes' as const, rotulo: 'Trilha de alterações' },
          ]}
        />
      )}
      {aba === 'alteracoes' ? (
        <TrilhaAlteracoes />
      ) : (
        <>
          <AvisoIntegridade verificando={verificando} integ={integ} />

          {mostraSelo && <SeloAncora />}

          <FiltrosHistorico
            ativos={ativos}
            onLimpar={limpar}
            total={pag.total ?? dados.length}
            pessoa={pessoa}
            setPessoa={setPessoa}
            placa={placa}
            setPlaca={setPlaca}
            periodo={periodo}
            unid={unid}
            operadorId={operadorId}
            operadores={operadores.data}
            meio={meio}
            tipo={tipo}
            exc={exc}
            retro={retro}
            gravar={gravar}
          />

          <Totais
            rotulo="Registros nos filtros, por tipo"
            itens={[
              { rotulo: 'Entradas', valor: porTipo?.entrada },
              { rotulo: 'Saídas', valor: porTipo?.saida },
              { rotulo: 'Negados', valor: porTipo?.negado, destaque: 'vermelho' },
              { rotulo: 'Recusados', valor: porTipo?.recusado, destaque: 'ambar' },
              { rotulo: 'Correções', valor: porTipo?.correcao },
            ]}
          />
          {lista.error && (
            <ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} />
          )}
          <ListaEventos
            dados={dados}
            integ={integ}
            carregando={lista.isLoading}
            vazio={!lista.isPending && !lista.error && dados.length === 0}
            onAbrir={setAberto}
          />
          <Paginacao
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            onIr={pag.irPara}
            rotulo="eventos"
            ocupado={pag.trocando}
          />
        </>
      )}

      {aberto && (
        <EventoGaveta
          ev={aberto}
          onClose={() => setAberto(null)}
          onCorrigido={() => {
            setAberto(null)
            void invalidar(APOS_EVENTO)
          }}
        />
      )}
    </div>
  )
}
