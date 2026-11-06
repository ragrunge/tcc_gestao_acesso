import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useApi,
  ehApiError,
  type Autorizador,
  type AutorizacaoView,
  type NovaPessoaInput,
  type PessoaBusca,
  type PrevistoView,
  type RestricaoView,
} from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { CartaoPasso } from '@/componentes/Card'
import { temModalAberto } from '@/componentes/Modal'
import { PageHeader } from '@/componentes/PageHeader'
import { type TowerUnitPickerHandle } from '@/componentes/TowerUnitPicker'
import { useToast } from '@/componentes/Toast'
import {
  ROTULO_CATEGORIA,
  ROTULO_PAPEL,
  type Funcionario,
  type MeioAutorizacao,
  type TipoVisita,
  type VeiculoAcesso,
} from '@/domain/types'
import {
  meioComMorador,
  prazoInicial,
  temPrazoPermanencia,
  tipoVisitaPadrao,
  estadoAutorizacaoPrevia,
  meiosAceitos,
  podeConfirmarEntrada,
  type DadosAutorizacao,
} from '@/domain/rules'
import { fmtData, fmtHora, fromInput, toInputDate } from '@/domain/time'
import { normalizarPlaca } from '@/domain/cpf'
import { mensagemErro, useAgora } from '@/app/useAsync'
import { useCatalogo } from '@/app/catalogo'
import { APOS_EVENTO, useInvalidar } from '@/app/consultas'
import { garantirNegado } from './negado'
import { BlocoRetroativo } from './entrada/BlocoRetroativo'
import { VEICULO_VAZIO, type VeiculoForm } from './entrada/BlocoVeiculo'
import { BuscaPessoa } from './entrada/BuscaPessoa'
import { NP_VAZIA } from './entrada/constantes'
import { useBuscaPessoa } from './entrada/useBuscaPessoa'
import { useConsultaDestino } from './entrada/useConsultaDestino'
import { usePreenchimento } from './entrada/usePreenchimento'
import { usePrevistosAgora } from './entrada/usePrevistosAgora'
import { ModalRestricao } from './entrada/ModalRestricao'
import { NovaPessoaForm } from './entrada/NovaPessoaForm'
import { PassoAutorizacao } from './entrada/PassoAutorizacao'
import { PassoUnidade } from './entrada/PassoUnidade'
import { PessoaEscolhida } from './entrada/PessoaEscolhida'
import { listarFaltas, textoAutorizadoPor } from './entrada/regras'
import { ResumoRegistro } from './entrada/ResumoRegistro'

export function EntradaPage() {
  const api = useApi()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const retroativo = params.get('retroativo') === '1'
  const { usuario } = useAuth()
  const { avisar } = useToast()
  const agora = useAgora(15000)
  const agoraRef = useRef(agora)
  agoraRef.current = agora
  const catalogo = useCatalogo()
  // Registrar entrada, recusa ou negado atualiza presentes, turno e histórico (e a unidade, a ficha e a busca)
  const invalidar = useInvalidar()

  // --- Passo 1: pessoa
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(null)
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null)
  const [novoModo, setNovoModo] = useState(false)
  const [np, setNp] = useState(NP_VAZIA)
  const [erroNp, setErroNp] = useState('')
  // --- Passo 2: unidade (ou área comum, só prestador: RF-36)
  const [destino, setDestino] = useState<'unidade' | 'area_comum'>('unidade')
  const [areaId, setAreaId] = useState('')
  const [bloco, setBloco] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [carregandoUnidade, setCarregandoUnidade] = useState(false)
  const [previas, setPrevias] = useState<AutorizacaoView[]>([])
  const [autorizadores, setAutorizadores] = useState<Autorizador[]>([])
  const [restricao, setRestricao] = useState<RestricaoView[] | null>(null)
  // Negado que o servidor JÁ gravou (422 PESSOA_EM_RESTRICAO na confirmação): o modal não pode gravar outro
  const [negadoGravado, setNegadoGravado] = useState<{ eventoId: string; codigo: string } | null>(
    null,
  )
  // --- Passo 3: autorização
  const [meio, setMeio] = useState<MeioAutorizacao | null>(null)
  const [residenteId, setResidenteId] = useState<string | null>(null)
  const [justificativa, setJustificativa] = useState('')
  /** Prazo de permanência (só visitante/prestador). Nulo = padrão da categoria. */
  const [tipoVisita, setTipoVisita] = useState<TipoVisita | null>(null)
  // --- Veículo (opcional; a pé é o padrão). Vai no evento de entrada e entra no hash.
  const [veiculo, setVeiculo] = useState<VeiculoForm>(VEICULO_VAZIO)
  /** Veículo da última entrada com veículo da pessoa ("mesmo veículo da última visita"). */
  const [ultimoVeiculo, setUltimoVeiculo] = useState<VeiculoAcesso | null>(null)
  const pedidoVeiculo = useRef('')
  // --- Retroativo
  const [dataReal, setDataReal] = useState(toInputDate(agora))
  const [horaReal, setHoraReal] = useState('')
  const [formulario, setFormulario] = useState('')
  // --- Envio
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [recusando, setRecusando] = useState(false)

  const buscaRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<TowerUnitPickerHandle>(null)
  const grupoMeioRef = useRef<HTMLFieldSetElement>(null)
  const escolherPessoaRef = useRef<(p: PessoaBusca) => Promise<void>>(async () => undefined)

  useEffect(() => {
    buscaRef.current?.focus()
  }, [])

  const { previstosAgora, idxPrevisto, setIdxPrevisto } = usePrevistosAgora({ retroativo, agora })
  const preencher = usePreenchimento({
    escolherPessoaRef,
    aplicarDestino: (destinoPreenchido) => {
      if ('unidade' in destinoPreenchido) {
        setBloco(destinoPreenchido.unidade.bloco)
        setNumero(destinoPreenchido.unidade.numero)
      } else {
        setDestino('area_comum')
        setAreaId(destinoPreenchido.areaId)
      }
    },
  })
  const escolherPrevisto = (p: PrevistoView) =>
    void preencher(
      p.pessoaId,
      p.destino.tipo === 'unidade' ? p.destino.id : null,
      p.destino.tipo === 'area_comum' ? p.destino.id : null,
    )

  const {
    query,
    setQuery,
    sugestoes,
    setSugestoes,
    idx,
    setIdx,
    buscando,
    mais,
    enterPendente,
    dicaCpf,
  } = useBuscaPessoa({ ativa: !pessoa && !novoModo, escolherPessoaRef, setErro })

  const escolherPessoa = useCallback(
    async (p: PessoaBusca) => {
      setPessoa(p)
      setQuery('')
      setSugestoes([])
      setErro('')
      setTipoVisita(null)
      setVeiculo(VEICULO_VAZIO)
      setUltimoVeiculo(null)
      // Sugestão do último veículo: conveniência, falha não atrapalha a entrada
      // Resposta de uma pessoa anterior (trocou rápido) é descartada.
      pedidoVeiculo.current = p.id
      Promise.resolve()
        .then(() => api.eventos.ultimoVeiculo(p.id))
        .then(
          (v) => {
            if (pedidoVeiculo.current === p.id) setUltimoVeiculo(v)
          },
          () => undefined,
        )
      setFuncionario(p.categoria === 'funcionario' ? await api.pessoas.funcionario(p.id) : null)
      // Correção 12: após escolher a pessoa, o foco vai para a seleção de bloco
      setTimeout(() => pickerRef.current?.focusBloco(), 0)
    },
    [api, setQuery, setSugestoes],
  )

  escolherPessoaRef.current = escolherPessoa

  function limpar(manterFoco = true) {
    setPessoa(null)
    setFuncionario(null)
    setQuery('')
    setSugestoes([])
    setNovoModo(false)
    setNp(NP_VAZIA)
    setErroNp('')
    setBloco(null)
    setNumero(null)
    setPrevias([])
    setAutorizadores([])
    setMeio(null)
    setResidenteId(null)
    setJustificativa('')
    setErro('')
    setFormulario('')
    setHoraReal('')
    setRestricao(null)
    setNegadoGravado(null)
    setDestino('unidade')
    setAreaId('')
    setTipoVisita(null)
    setVeiculo(VEICULO_VAZIO)
    setUltimoVeiculo(null)
    pedidoVeiculo.current = ''
    if (manterFoco) setTimeout(() => buscaRef.current?.focus(), 0)
  }
  const limparUnidade = () => {
    setRestricao(null)
    setNegadoGravado(null)
    setBloco(null)
    setNumero(null)
    setPrevias([])
    setAutorizadores([])
    setMeio(null)
    setResidenteId(null)
    setJustificativa('')
    setTimeout(() => pickerRef.current?.focusBloco(), 0)
  }

  // Ao escolher a unidade: restrições (RF-16), autorizações prévias e moradores aptos a autorizar
  const emArea = destino === 'area_comum' && pessoa?.categoria === 'prestador'
  const unidadeAtual =
    !emArea && bloco && numero ? (catalogo.porBlocoNumero(bloco, numero)?.id ?? null) : null
  const areaAtual = emArea && areaId ? areaId : null
  const codUnidade = unidadeAtual ? catalogo.codigo(unidadeAtual) : null

  useConsultaDestino({
    pessoa,
    unidadeAtual,
    areaAtual,
    emArea,
    agoraRef,
    grupoMeioRef,
    carregandoUnidade,
    setCarregandoUnidade,
    setMeio,
    setResidenteId,
    setErro,
    setNegadoGravado,
    setRestricao,
    setPrevias,
    setAutorizadores,
  })

  // --- instante do acesso (retroativo usa a hora real informada)
  const quando = retroativo ? fromInput(dataReal, horaReal || '00:00') : agora
  const retroValido = !retroativo || (!!horaReal && quando !== null && quando < agora)

  const previaValida = useMemo(
    () => previas.find((a) => quando !== null && estadoAutorizacaoPrevia(a, quando) === 'valida'),
    [previas, quando],
  )
  const previaFora = useMemo(
    () =>
      previaValida
        ? undefined
        : previas.find(
            (a) => quando !== null && estadoAutorizacaoPrevia(a, quando) === 'fora_da_janela',
          ),
    [previas, previaValida, quando],
  )
  // "Morador" em outra unidade (ou sem vínculo válido) é tratado como visitante também no servidor
  const categoria = pessoa
    ? pessoa.categoria === 'morador'
      ? 'visitante'
      : pessoa.categoria
    : undefined
  const meiosPermitidos = categoria
    ? meiosAceitos(categoria, emArea ? 'area_comum' : 'unidade')
    : []
  const semCpf = !!pessoa?.semCpf
  // Seletor do tipo de visita: só para quem é cadastrado como visitante ou prestador ("morador" em outra unidade entra
  // como visitante com o padrão "Visita", decidido no servidor).
  const comPrazo = !!pessoa && temPrazoPermanencia(pessoa.categoria)
  const tipoEscolhido = comPrazo ? (tipoVisita ?? tipoVisitaPadrao(pessoa!.categoria)) : null

  const dados: DadosAutorizacao | null = pessoa
    ? {
        categoriaPessoa: categoria!,
        semCpf,
        unidadeDestinoId: unidadeAtual,
        areaComumId: areaAtual,
        autorizadoPorTipo: meio,
        autorizadoPorPessoaId: meioComMorador(meio) ? residenteId : null,
        autorizacaoPreviaId: meio === 'autorizacao_previa' ? (previaValida?.id ?? null) : null,
        justificativa,
      }
    : null
  // Mesma função pura que o "servidor" usa: o botão só habilita se a regra passar
  const regraOk =
    !!dados &&
    quando !== null &&
    podeConfirmarEntrada(dados, {
      quando,
      moradoresValidosIds: new Set(autorizadores.map((a) => a.pessoa.id)),
      autorizacoes: previas,
      funcionario: funcionario ?? undefined,
    })
  // Morador não registra entrada na própria unidade no MVP; em outra unidade segue como visitante
  const propriaUnidade =
    !!pessoa && !!unidadeAtual && pessoa.unidadesVinculadas.includes(unidadeAtual)
  // Com veículo, a placa é obrigatória e no padrão antigo ou Mercosul (a mesma regra da API)
  const placaNormalizada = veiculo.comVeiculo ? normalizarPlaca(veiculo.placa) : null
  const veiculoOk = !veiculo.comVeiculo || placaNormalizada !== null
  const pronto =
    !!pessoa &&
    !propriaUnidade &&
    regraOk &&
    retroValido &&
    (!retroativo || formulario.trim().length > 0) &&
    veiculoOk &&
    !carregandoUnidade &&
    !restricao &&
    !enviando

  const confirmar = useCallback(async () => {
    if (!pessoa || !dados || !pronto) return
    setEnviando(true)
    setErro('')
    try {
      const ev = await api.eventos.criar({
        pessoaId: pessoa.id,
        unidadeDestinoId: unidadeAtual,
        areaComumId: areaAtual,
        autorizadoPorTipo: dados.autorizadoPorTipo,
        autorizadoPorPessoaId: dados.autorizadoPorPessoaId,
        autorizacaoPreviaId: dados.autorizacaoPreviaId,
        justificativa: meio === 'excecao_porteiro' ? justificativa : null,
        retroativo,
        ocorridoEm: retroativo ? quando : null,
        formularioContingencia: retroativo ? formulario.trim() : null,
        // Só quando difere do padrão (que o servidor aplica sozinho): durante o deploy, o front novo diante da API anterior
        // (DTO estrito, sem o campo) não quebra a entrada comum.
        tipoVisita:
          pessoa && tipoEscolhido && tipoEscolhido !== tipoVisitaPadrao(pessoa.categoria)
            ? tipoEscolhido
            : null,
        veiculo: placaNormalizada
          ? { placa: placaNormalizada, modelo: veiculo.modelo, cor: veiculo.cor }
          : null,
      })
      const via = {
        interfone: 'via interfone',
        celular: 'pelo celular (WhatsApp ou ligação)',
        morador_presente: 'com o morador presente na portaria',
        autorizacao_previa: 'via autorização prévia',
        excecao_porteiro: 'por exceção do porteiro (justificativa registrada)',
        escala: 'por escala',
      }[meio!]
      const quem =
        ev.autorizadoPorTipo === 'excecao_porteiro' || ev.autorizadoPorTipo === 'escala'
          ? ''
          : `autorizada por ${ev.autorizadoPorNome ?? '—'} `
      avisar({
        tom: ev.autorizadoPorTipo === 'excecao_porteiro' ? 'ambar' : 'verde',
        titulo: retroativo ? 'Lançamento retroativo registrado' : 'Entrada registrada',
        texto: `${retroativo ? `Acesso de ${fmtData(ev.ocorridoEm)} ${fmtHora(ev.ocorridoEm)}, lançado` : 'Entrada registrada'} às ${fmtHora(ev.registradoEm)} por ${ROTULO_PAPEL[usuario!.papel]} ${usuario!.nome} — ${quem}${via} (${ev.codigo}).`,
      })
      void invalidar(APOS_EVENTO)
      nav('/painel')
    } catch (e) {
      if (ehApiError(e) && e.code === 'PESSOA_EM_RESTRICAO') {
        // O servidor já gravou o "negado": guarda o evento para o modal não gravar de novo
        const det = e.detalhes as { restricoes: RestricaoView[]; eventoId: string; codigo: string }
        setNegadoGravado({ eventoId: det.eventoId, codigo: det.codigo })
        setRestricao(det.restricoes)
        void invalidar(APOS_EVENTO) // o negado já está na trilha
      } else setErro(mensagemErro(e))
      setEnviando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pessoa,
    dados,
    pronto,
    api,
    unidadeAtual,
    areaAtual,
    meio,
    justificativa,
    retroativo,
    quando,
    formulario,
    usuario,
    tipoEscolhido,
    placaNormalizada,
    veiculo,
  ])

  // Correção 13: Enter confirma sempre que o registro estiver completo (exceto em campo de texto longo)
  const confirmarRef = useRef(confirmar)
  confirmarRef.current = confirmar
  const prontoRef = useRef(pronto)
  prontoRef.current = pronto
  const algoPreenchido = !!pessoa || novoModo || query.length > 0
  const algoRef = useRef(algoPreenchido)
  algoRef.current = algoPreenchido
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (temModalAberto()) return
      const alvo = e.target as HTMLElement
      if (e.key === 'Enter') {
        if (!prontoRef.current || alvo.tagName === 'TEXTAREA' || alvo.id === 'busca-pessoa') return
        e.preventDefault()
        e.stopPropagation()
        void confirmarRef.current()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (algoRef.current) limpar()
        else nav('/painel')
      }
    }
    document.addEventListener('keydown', tecla, true)
    return () => document.removeEventListener('keydown', tecla, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cadastrarNova(e: FormEvent) {
    e.preventDefault()
    setErroNp('')
    try {
      const input: NovaPessoaInput = {
        nome: np.nome,
        documento: np.semCpf ? undefined : np.documento,
        telefone: np.telefone,
        semCpf: np.semCpf,
        categoria: np.categoria,
        empresa: np.categoria === 'prestador' ? np.empresa : undefined,
        servico: np.categoria === 'prestador' ? np.servico : undefined,
      }
      const criada = await api.pessoas.criar(input)
      const tipo = np.tipoVisita
      setNovoModo(false)
      setNp(NP_VAZIA)
      await escolherPessoa({
        ...criada,
        ultimoAcesso: 'Sem acessos',
        unidadesVinculadas: [],
        unidadesVinculadasCodigos: [],
      })
      if (tipo !== tipoVisitaPadrao(criada.categoria)) setTipoVisita(tipo)
      avisar({
        texto: `${criada.nome} cadastrado(a) como ${ROTULO_CATEGORIA[criada.categoria].toLowerCase()}.`,
      })
    } catch (err) {
      setErroNp(mensagemErro(err))
    }
  }

  // Modal de restrição: ambos os caminhos gravam o evento "negado" (a gravação ocorre no servidor)
  // Se a restrição veio no 422 da confirmação, o servidor já gravou o negado: NÃO chamar eventos.criar de novo.
  async function resolverRestricao(registrarOcorrencia: boolean) {
    if (!pessoa) return
    let eventoId: string, codigo: string
    try {
      ;({ eventoId, codigo } = await garantirNegado(negadoGravado, async () => {
        try {
          await api.eventos.criar({
            pessoaId: pessoa.id,
            unidadeDestinoId: unidadeAtual,
            areaComumId: areaAtual,
            autorizadoPorTipo: null,
            retroativo,
            ocorridoEm: retroativo ? quando : null,
            formularioContingencia: retroativo ? formulario.trim() || null : null,
          })
          return { eventoId: '', codigo: '' }
        } catch (e) {
          if (ehApiError(e) && e.code === 'PESSOA_EM_RESTRICAO') {
            const d = e.detalhes as { eventoId: string; codigo: string }
            return { eventoId: d.eventoId, codigo: d.codigo }
          }
          throw e
        }
      }))
    } catch (e) {
      setErro(mensagemErro(e))
      setRestricao(null)
      return
    }
    void invalidar(APOS_EVENTO)
    const nome = pessoa.nome
    const onde = codUnidade
      ? `na ${codUnidade}`
      : areaAtual
        ? `na área comum ${catalogo.areaNome(areaAtual)}`
        : 'no condomínio'
    setRestricao(null)
    setNegadoGravado(null)
    avisar({
      tom: 'vermelho',
      titulo: 'Entrada negada',
      texto: `${nome} não entrou ${onde}. Tentativa gravada na trilha (${codigo}).`,
    })
    if (registrarOcorrencia) {
      nav(
        `/ocorrencias?novo=1&tipo=tentativa_acesso_indevido${codUnidade ? `&unidade=${codUnidade}` : ''}&envolvidos=${encodeURIComponent(nome)}&evento=${eventoId}`,
      )
    } else if (unidadeAtual || areaAtual) {
      setBloco(null)
      setNumero(null)
      setMeio(null)
      setAreaId('')
      setTimeout(() => pickerRef.current?.focusBloco(), 0)
    } else {
      limpar() // funcionário sem unidade: nada a refazer na unidade, recomeça pela pessoa
    }
  }

  // UC02 A4: o morador recusou a visita. Grava o evento "recusado" e limpa a tela.
  const podeRecusar =
    !!pessoa &&
    !!unidadeAtual &&
    meioComMorador(meio) &&
    !!residenteId &&
    retroValido &&
    (!retroativo || formulario.trim().length > 0) &&
    !carregandoUnidade &&
    !restricao &&
    !enviando &&
    !recusando
  async function registrarRecusa() {
    if (!podeRecusar || !pessoa || !unidadeAtual || !meioComMorador(meio)) return
    setRecusando(true)
    setErro('')
    try {
      const ev = await api.eventos.registrarRecusa({
        pessoaId: pessoa.id,
        unidadeDestinoId: unidadeAtual,
        meio,
        moradorPessoaId: residenteId!,
        retroativo,
        ocorridoEm: retroativo ? quando : null,
        formularioContingencia: retroativo ? formulario.trim() : null,
      })
      avisar({
        tom: 'ambar',
        titulo: 'Recusa registrada',
        texto: `${ev.autorizadoPorNome} recusou a visita de ${pessoa.nome} à ${codUnidade} (${ev.codigo}). Nenhuma entrada foi registrada.`,
      })
      void invalidar(APOS_EVENTO)
      limpar()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setRecusando(false)
    }
  }

  const pr = restricao?.[0]

  const residente = autorizadores.find((a) => a.pessoa.id === residenteId)?.pessoa.nome
  const autorizadoPor = textoAutorizadoPor({
    meio,
    nomeUsuario: usuario!.nome,
    previaValida,
    residente,
  })
  const faltas = listarFaltas({
    pessoa,
    propriaUnidade,
    emArea,
    areaAtual,
    unidadeAtual,
    carregandoUnidade,
    meio,
    residenteId,
    justificativa,
    retroativo,
    horaReal,
    retroValido,
    formulario,
    veiculoOk,
    pronto,
    enviando,
    restricao,
  })

  /** Motivo de um meio não valer para a pessoa ou o destino escolhidos (null = vale). */
  const motivoMeioBloqueado = (m: MeioAutorizacao): string | null => {
    if (!pessoa || meiosPermitidos.includes(m)) return null
    if (m === 'escala') return 'Só para funcionário'
    if (emArea) return 'Não vale para área comum'
    return 'Não vale para esta pessoa'
  }
  // Prazo de permanência pela MESMA regra do servidor (prazoInicial): tipo escolhido ou padrão da categoria efetiva
  // ("morador" em outra unidade entra como visitante) e, no serviço com autorização prévia, o fim da janela
  const tipoResumo =
    categoria && temPrazoPermanencia(categoria)
      ? (tipoEscolhido ?? tipoVisitaPadrao(categoria))
      : null
  const saiAte =
    tipoResumo && quando !== null && (!retroativo || horaReal)
      ? prazoInicial(
          tipoResumo,
          quando,
          meio === 'autorizacao_previa' ? previaValida?.horaFim : null,
        )
      : null

  const trocarDestino = (d: 'unidade' | 'area_comum') => {
    setDestino(d)
    setBloco(null)
    setNumero(null)
    setAreaId('')
    setPrevias([])
    setAutorizadores([])
    setMeio(null)
    setResidenteId(null)
    setRestricao(null)
  }
  const escolherArea = (id: string) => {
    setAreaId(id)
    setRestricao(null)
  }
  const mudarUnidade = (b: string | null, n: string | null) => {
    setBloco(b)
    setNumero(n)
    if (!n) {
      setPrevias([])
      setAutorizadores([])
      setMeio(null)
      setResidenteId(null)
    }
  }
  const escolherMeio = (m: MeioAutorizacao) => {
    setMeio(m)
    setResidenteId(null)
  }
  const cancelar = () => (algoPreenchido ? limpar() : nav('/painel'))
  const autorizacaoBloqueada =
    !pessoa ||
    (!unidadeAtual && !areaAtual && pessoa.categoria !== 'funcionario') ||
    carregandoUnidade

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
              dataReal={dataReal}
              setDataReal={setDataReal}
              horaReal={horaReal}
              setHoraReal={setHoraReal}
              formulario={formulario}
              setFormulario={setFormulario}
              retroValido={retroValido}
            />
          )}

          <CartaoPasso n={1} titulo="Pessoa">
            {!pessoa && !novoModo && (
              <BuscaPessoa
                buscaRef={buscaRef}
                enterPendente={enterPendente}
                query={query}
                setQuery={setQuery}
                sugestoes={sugestoes}
                idx={idx}
                setIdx={setIdx}
                mais={mais}
                buscando={buscando}
                dicaCpf={dicaCpf}
                previstosAgora={previstosAgora}
                idxPrevisto={idxPrevisto}
                setIdxPrevisto={setIdxPrevisto}
                escolherPrevisto={escolherPrevisto}
                escolherPessoa={escolherPessoa}
                agora={agora}
                iniciarCadastro={() => {
                  setNovoModo(true)
                  setNp({ ...NP_VAZIA, nome: query })
                }}
              />
            )}
            {novoModo && !pessoa && (
              <NovaPessoaForm
                np={np}
                setNp={setNp}
                erroNp={erroNp}
                cadastrarNova={cadastrarNova}
                voltar={() => {
                  setNovoModo(false)
                  setTimeout(() => buscaRef.current?.focus(), 0)
                }}
              />
            )}
            {pessoa && <PessoaEscolhida pessoa={pessoa} trocar={() => limpar()} />}
          </CartaoPasso>

          <CartaoPasso n={2} titulo="Unidade de destino">
            {!pessoa ? (
              <p className="text-[#56616B]">Escolha a pessoa primeiro.</p>
            ) : (
              <PassoUnidade
                pessoa={pessoa}
                comPrazo={comPrazo}
                tipoEscolhido={tipoEscolhido}
                setTipoVisita={setTipoVisita}
                destino={destino}
                trocarDestino={trocarDestino}
                emArea={emArea}
                catalogo={catalogo}
                areaId={areaId}
                escolherArea={escolherArea}
                pickerRef={pickerRef}
                bloco={bloco}
                numero={numero}
                mudarUnidade={mudarUnidade}
                limparUnidade={limparUnidade}
                propriaUnidade={propriaUnidade}
                veiculo={veiculo}
                setVeiculo={setVeiculo}
                ultimoVeiculo={ultimoVeiculo}
              />
            )}
          </CartaoPasso>

          <CartaoPasso n={3} titulo="Quem autorizou?">
            <PassoAutorizacao
              pessoa={pessoa}
              bloqueado={autorizacaoBloqueada}
              carregandoUnidade={carregandoUnidade}
              emArea={emArea}
              semCpf={semCpf}
              previaValida={previaValida}
              previaFora={previaFora}
              grupoMeioRef={grupoMeioRef}
              motivoMeioBloqueado={motivoMeioBloqueado}
              meio={meio}
              escolherMeio={escolherMeio}
              residenteId={residenteId}
              setResidenteId={setResidenteId}
              autorizadores={autorizadores}
              codUnidade={codUnidade}
              podeRecusar={podeRecusar}
              recusando={recusando}
              registrarRecusa={registrarRecusa}
              nomeUsuario={usuario!.nome}
              justificativa={justificativa}
              setJustificativa={setJustificativa}
              funcionario={funcionario}
              instante={quando ?? agora}
              erro={erro}
            />
          </CartaoPasso>
        </div>

        <ResumoRegistro
          usuario={usuario!}
          agora={agora}
          pessoa={pessoa}
          emArea={emArea}
          rotuloDestino={
            unidadeAtual
              ? catalogo.rotulo(unidadeAtual)
              : areaAtual
                ? catalogo.areaNome(areaAtual)
                : '—'
          }
          autorizadoPor={autorizadoPor}
          meio={meio}
          veiculo={veiculo}
          placaNormalizada={placaNormalizada}
          tipoResumo={tipoResumo}
          saiAte={saiAte}
          quando={quando}
          retroativo={retroativo}
          horaReal={horaReal}
          pronto={pronto}
          enviando={enviando}
          faltas={faltas}
          confirmar={confirmar}
          cancelar={cancelar}
        />
      </div>

      {restricao && pr && pessoa && (
        <ModalRestricao
          pr={pr}
          pessoa={pessoa}
          codUnidade={codUnidade}
          resolverRestricao={resolverRestricao}
        />
      )}
    </div>
  )
}
