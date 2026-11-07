import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { type PrevistoView } from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { CartaoPasso } from '@/componentes/Card'
import { PageHeader } from '@/componentes/PageHeader'
import { useAgora } from '@/app/useAsync'
import { useCatalogo } from '@/app/catalogo'
import { BlocoRetroativo } from './entrada/BlocoRetroativo'
import { BuscaPessoa } from './entrada/BuscaPessoa'
import { NP_VAZIA } from './entrada/constantes'
import { ModalRestricao } from './entrada/ModalRestricao'
import { NovaPessoaForm } from './entrada/NovaPessoaForm'
import { PassoAutorizacao } from './entrada/PassoAutorizacao'
import { PassoUnidade } from './entrada/PassoUnidade'
import { PessoaEscolhida } from './entrada/PessoaEscolhida'
import { ResumoRegistro } from './entrada/ResumoRegistro'
import { useAcoesRestricao } from './entrada/useAcoesRestricao'
import { useAtalhosEntrada } from './entrada/useAtalhosEntrada'
import { useBuscaPessoa } from './entrada/useBuscaPessoa'
import { useConsultaDestino } from './entrada/useConsultaDestino'
import { useEntradaDerivados } from './entrada/useEntradaDerivados'
import { useEntradaEstado } from './entrada/useEntradaEstado'
import { usePreenchimento } from './entrada/usePreenchimento'
import { usePrevistosAgora } from './entrada/usePrevistosAgora'
import { useRegistrarEntrada } from './entrada/useRegistrarEntrada'
import { useSelecaoEntrada } from './entrada/useSelecaoEntrada'

// A ordem dos hooks preserva a ordem original dos efeitos (foco, prefill, busca, consulta do destino, teclado)
export function EntradaPage() {
  const [params] = useSearchParams()
  const retroativo = params.get('retroativo') === '1'
  const { usuario } = useAuth()
  const agora = useAgora(15000)
  const agoraRef = useRef(agora)
  agoraRef.current = agora
  const catalogo = useCatalogo()
  const s = useEntradaEstado(agora)

  const { buscaRef } = s
  useEffect(() => {
    buscaRef.current?.focus()
  }, [buscaRef])

  const { previstosAgora, idxPrevisto, setIdxPrevisto } = usePrevistosAgora({ retroativo, agora })
  const preencher = usePreenchimento({
    escolherPessoaRef: s.escolherPessoaRef,
    aplicarDestino: (destinoPreenchido) => {
      if ('unidade' in destinoPreenchido) {
        s.setBloco(destinoPreenchido.unidade.bloco)
        s.setNumero(destinoPreenchido.unidade.numero)
      } else {
        s.setDestino('area_comum')
        s.setAreaId(destinoPreenchido.areaId)
      }
    },
  })
  const escolherPrevisto = (p: PrevistoView) =>
    void preencher(
      p.pessoaId,
      p.destino.tipo === 'unidade' ? p.destino.id : null,
      p.destino.tipo === 'area_comum' ? p.destino.id : null,
    )

  const busca = useBuscaPessoa({
    ativa: !s.pessoa && !s.novoModo,
    escolherPessoaRef: s.escolherPessoaRef,
    setErro: s.setErro,
  })
  const sel = useSelecaoEntrada({ s, setQuery: busca.setQuery, setSugestoes: busca.setSugestoes })
  const nomeUsuario = usuario!.nome
  const d = useEntradaDerivados({ s, catalogo, agora, retroativo, nomeUsuario })
  const { emArea, unidadeAtual, areaAtual } = d
  useConsultaDestino({ ...s, unidadeAtual, areaAtual, emArea, agoraRef })

  const confirmar = useRegistrarEntrada({ s, d, retroativo })
  const algoPreenchido = !!s.pessoa || s.novoModo || busca.query.length > 0
  const cancelar = useAtalhosEntrada({
    confirmar,
    pronto: d.pronto,
    algoPreenchido,
    limpar: sel.limpar,
  })
  const { resolverRestricao, registrarRecusa } = useAcoesRestricao({
    s,
    d,
    retroativo,
    limpar: sel.limpar,
  })
  const pr = s.restricao?.[0]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo={retroativo ? 'Lançar registro retroativo' : 'Registrar entrada'}
        descricao={
          retroativo
            ? 'Contingência (UC08): lance o acesso anotado no papel durante a queda do sistema, com a data e a hora reais.'
            : 'Pessoa, unidade e quem autorizou. O registro não pode ser editado depois de confirmado.'
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          {retroativo && (
            <BlocoRetroativo
              agora={agora}
              dataReal={s.dataReal}
              setDataReal={s.setDataReal}
              horaReal={s.horaReal}
              setHoraReal={s.setHoraReal}
              formulario={s.formulario}
              setFormulario={s.setFormulario}
              retroValido={d.retroValido}
            />
          )}

          <CartaoPasso n={1} titulo="Pessoa">
            {!s.pessoa && !s.novoModo && (
              <BuscaPessoa
                buscaRef={s.buscaRef}
                enterPendente={busca.enterPendente}
                query={busca.query}
                setQuery={busca.setQuery}
                sugestoes={busca.sugestoes}
                idx={busca.idx}
                setIdx={busca.setIdx}
                mais={busca.mais}
                buscando={busca.buscando}
                dicaCpf={busca.dicaCpf}
                previstosAgora={previstosAgora}
                idxPrevisto={idxPrevisto}
                setIdxPrevisto={setIdxPrevisto}
                escolherPrevisto={escolherPrevisto}
                escolherPessoa={sel.escolherPessoa}
                agora={agora}
                iniciarCadastro={() => {
                  s.setNovoModo(true)
                  s.setNp({ ...NP_VAZIA, nome: busca.query })
                }}
              />
            )}
            {s.novoModo && !s.pessoa && (
              <NovaPessoaForm
                np={s.np}
                setNp={s.setNp}
                erroNp={s.erroNp}
                cadastrarNova={sel.cadastrarNova}
                voltar={() => {
                  s.setNovoModo(false)
                  setTimeout(() => s.buscaRef.current?.focus(), 0)
                }}
              />
            )}
            {s.pessoa && <PessoaEscolhida pessoa={s.pessoa} trocar={() => sel.limpar()} />}
          </CartaoPasso>

          <CartaoPasso n={2} titulo="Unidade de destino">
            {!s.pessoa ? (
              <p className="text-[#56616B]">Escolha a pessoa primeiro.</p>
            ) : (
              <PassoUnidade
                pessoa={s.pessoa}
                comPrazo={d.comPrazo}
                tipoEscolhido={d.tipoEscolhido}
                setTipoVisita={s.setTipoVisita}
                destino={s.destino}
                trocarDestino={sel.trocarDestino}
                emArea={d.emArea}
                catalogo={catalogo}
                areaId={s.areaId}
                escolherArea={sel.escolherArea}
                pickerRef={s.pickerRef}
                bloco={s.bloco}
                numero={s.numero}
                mudarUnidade={sel.mudarUnidade}
                limparUnidade={sel.limparUnidade}
                propriaUnidade={d.propriaUnidade}
                veiculo={s.veiculo}
                setVeiculo={s.setVeiculo}
                ultimoVeiculo={s.ultimoVeiculo}
              />
            )}
          </CartaoPasso>

          <CartaoPasso n={3} titulo="Quem autorizou?">
            <PassoAutorizacao
              pessoa={s.pessoa}
              bloqueado={d.autorizacaoBloqueada}
              carregandoUnidade={s.carregandoUnidade}
              emArea={d.emArea}
              semCpf={d.semCpf}
              previaValida={d.previaValida}
              previaFora={d.previaFora}
              grupoMeioRef={s.grupoMeioRef}
              motivoMeioBloqueado={d.motivoMeioBloqueado}
              meio={s.meio}
              escolherMeio={sel.escolherMeio}
              residenteId={s.residenteId}
              setResidenteId={s.setResidenteId}
              autorizadores={s.autorizadores}
              codUnidade={d.codUnidade}
              podeRecusar={d.podeRecusar}
              recusando={s.recusando}
              registrarRecusa={registrarRecusa}
              nomeUsuario={usuario!.nome}
              justificativa={s.justificativa}
              setJustificativa={s.setJustificativa}
              funcionario={s.funcionario}
              instante={d.quando ?? agora}
              erro={s.erro}
            />
          </CartaoPasso>
        </div>

        <ResumoRegistro
          usuario={usuario!}
          agora={agora}
          pessoa={s.pessoa}
          emArea={d.emArea}
          rotuloDestino={d.rotuloDestino}
          autorizadoPor={d.autorizadoPor}
          meio={s.meio}
          veiculo={s.veiculo}
          placaNormalizada={d.placaNormalizada}
          tipoResumo={d.tipoResumo}
          saiAte={d.saiAte}
          quando={d.quando}
          retroativo={retroativo}
          horaReal={s.horaReal}
          pronto={d.pronto}
          enviando={s.enviando}
          faltas={d.faltas}
          confirmar={confirmar}
          cancelar={cancelar}
        />
      </div>

      {s.restricao && pr && s.pessoa && (
        <ModalRestricao
          pr={pr}
          pessoa={s.pessoa}
          codUnidade={d.codUnidade}
          resolverRestricao={resolverRestricao}
        />
      )}
    </div>
  )
}
