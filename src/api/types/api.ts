import type { ResultadoIntegridade } from '@/domain/hashChain'
import type {
  AutorizacaoPrevia,
  AutorizacaoRetirada,
  Encomenda,
  EventoView,
  Funcionario,
  Ocorrencia,
  PermanenciaView,
  Pessoa,
  RegistroAlteracao,
  Restricao,
  StatusOcorrencia,
  StatusVinculo,
  Unidade,
  UsuarioSistema,
  ValoresCorrecao,
  Veiculo,
  VeiculoAcesso,
  VinculoUnidade,
} from '@/domain/types'
import type {
  ConferenciaAncora,
  EstadoSelos,
  FiltroAlteracoes,
  FiltroAlteracoesPagina,
  FiltroRelatorio,
  PacoteExportacao,
  RelatorioResumo,
  ResultadoSelar,
} from './auditoria'
import type { LinhaPlanilha, RelatorioImportacao, ResultadoImportacao } from './importacao'
import type { ExecucaoRetencao, ResultadoAnonimizacao, ResultadoRetencao } from './lgpd'
import type {
  ArquivoBaixado,
  AutorizarRetiradaInput,
  EncomendaView,
  FiltroEncomendas,
  FiltroOcorrencias,
  NovaEncomendaInput,
  NovaOcorrenciaInput,
  OcorrenciaView,
  ResumoEncomendas,
  ResumoOcorrencias,
} from './operacao'
import type { Pagina, PaginaEventos } from './paginacao'
import type {
  EditarFuncionarioInput,
  EditarPessoaInput,
  FichaPessoa,
  FiltroPessoas,
  FuncionarioView,
  NovaPessoaInput,
  NovoFuncionarioInput,
  PessoaBusca,
  PessoaLista,
  ResultadoBuscaGlobal,
  ResumoPessoas,
} from './pessoas'
import type {
  AutorizacaoView,
  FiltroEventos,
  FiltroEventosPagina,
  NovaAutorizacaoInput,
  NovaRecusaInput,
  NovaRestricaoInput,
  NovoEventoInput,
  OpcoesSaida,
  PrevistoView,
  RestricaoView,
  ResultadoRestricao,
  ResumoTurno,
} from './portaria'
import type {
  EdicaoUsuarioInput,
  EventoSessao,
  FiltroUsuarios,
  LoginInput,
  NovoUsuarioInput,
  ResumoUsuarios,
  TrocarSenhaInput,
  UsuarioComSenhaTemporaria,
  UsuarioSessao,
} from './sessao'
import type {
  Autorizador,
  Catalogo,
  EditarVeiculoInput,
  FiltroUnidades,
  NovaUnidadeInput,
  ResumoUnidades,
  UnidadeDetalhe,
  UnidadeResumo,
} from './unidades'
import type {
  ConferenciaInput,
  EncerrarVinculoInput,
  FiltroVinculos,
  NovoVinculoInput,
  ResumoVinculos,
  VinculoView,
} from './vinculos'

export interface Api {
  /** Assina avisos de sessão (401 fora do login, 403 TROCA_DE_SENHA_OBRIGATORIA). Devolve o cancelamento. */
  aoEventoSessao?(cb: (e: EventoSessao) => void): () => void
  /**
   * Migração por fases (desenho §6): a rota (Rota de @/domain/rbac) tem backend nesta versão? Ausente = tudo
   * suportado (telas de fases ainda não migradas). O menu esconde o que não é suportado e a guarda de rota mostra o aviso.
   */
  suporta?(rota: string): boolean
  auth: {
    // 2FA fica para a fase de segurança (pós-MVP).
    login(i: LoginInput): Promise<UsuarioSessao>
    logout(): Promise<void>
    me(): Promise<UsuarioSessao | null>
    /** Troca a própria senha (mínimo de 12). Libera quem estava com troca obrigatória. */
    trocarSenha(i: TrocarSenhaInput): Promise<UsuarioSessao>
  }
  busca: { global(q: string): Promise<ResultadoBuscaGlobal> }
  pessoas: {
    /** `limite`: máximo de resultados (padrão 8). A portaria pede 9 para saber se há mais que 8. */
    /** `incluirDesativadas`: só a tela Cadastro ("mostrar desativados"); a portaria e os seletores nunca. */
    buscar(
      q: string,
      opts?: { semMoradores?: boolean; limite?: number; incluirDesativadas?: boolean },
    ): Promise<PessoaBusca[]>
    listar(): Promise<PessoaBusca[]>
    /** Uma página (cursor), em ordem alfabética; `categoria` filtra no servidor. Texto livre vai por `buscar` (pode ser CPF). */
    listarPagina(f?: FiltroPessoas): Promise<Pagina<PessoaLista>>
    resumo(): Promise<ResumoPessoas>
    ficha(id: string): Promise<FichaPessoa>
    criar(i: NovaPessoaInput): Promise<Pessoa>
    /** pessoa.editar (SI/AD): completa ou corrige o cadastro, com antes/depois na trilha. */
    editar(i: EditarPessoaInput): Promise<Pessoa>
    funcionario(pessoaId: string): Promise<Funcionario | null>
    /** RF-02, pessoa.desativar (SI/AD): não exclui; revoga junto as autorizações prévias vigentes. */
    desativar(id: string, motivo: string): Promise<Pessoa & { autorizacoesRevogadas: number }>
    reativar(id: string): Promise<Pessoa>
  }
  catalogo: { obter(): Promise<Catalogo> }
  unidades: {
    /** Todas as unidades com resumo (percorre as páginas). A tela usa `listarPagina`. */
    listar(): Promise<UnidadeResumo[]>
    /** Uma página (cursor), na ordem bloco/número; `bloco` filtra. Padrão de 50 por página. */
    listarPagina(f?: FiltroUnidades): Promise<Pagina<UnidadeResumo>>
    resumo(): Promise<ResumoUnidades>
    /** `id` aceita o uuid ou o código "D-32". */
    detalhe(id: string): Promise<UnidadeDetalhe>
    criar(i: NovaUnidadeInput): Promise<Unidade>
    /** Só bloco/número; unidade já referenciada (vínculo, evento etc.) não muda de número (422 UNIDADE_REFERENCIADA). */
    editar(i: NovaUnidadeInput & { id: string }): Promise<Unidade>
    desativar(id: string): Promise<Unidade>
    reativar(id: string): Promise<Unidade>
  }
  funcionarios: {
    listar(): Promise<FuncionarioView[]>
    criar(i: NovoFuncionarioInput): Promise<FuncionarioView>
    editar(i: EditarFuncionarioInput): Promise<FuncionarioView>
  }
  veiculos: {
    criar(i: { unidadeId: string; placa: string; modelo: string; cor: string }): Promise<Veiculo>
    /** RF-08: corrige placa/modelo/cor ou desativa (`ativo: false`, some do detalhe). Placa ativa é única. */
    editar(i: EditarVeiculoInput): Promise<Veiculo>
  }
  vinculos: {
    listar(f?: { status?: StatusVinculo }): Promise<VinculoView[]>
    /** Uma página (cursor). `status` aceita vários (aba Decididos). */
    listarPagina(f?: FiltroVinculos): Promise<Pagina<VinculoView>>
    /** Quantos vínculos há no status (badge "Vínculos pendentes" do menu). */
    contar(status: StatusVinculo): Promise<number>
    resumo(): Promise<ResumoVinculos>
    criar(i: NovoVinculoInput): Promise<VinculoUnidade>
    /** RF-05: registra (ou refaz, enquanto pendente/legado) a conferência do comprovante. Só síndico/administração. */
    registrarConferencia(id: string, i: ConferenciaInput): Promise<VinculoUnidade>
    /** Aprovar exige conferência registrada (422 CONFERENCIA_OBRIGATORIA) e cadastro completo (422 CADASTRO_INCOMPLETO). */
    decidir(i: {
      id: string
      decisao: 'aprovar' | 'rejeitar'
      justificativa?: string
    }): Promise<VinculoUnidade>
    /** RN-09: legado -> aprovado, com conferência registrada e cadastro completo. */
    regularizar(id: string, opcoes?: { vigenciaFim?: number | null }): Promise<VinculoUnidade>
    /** RF-07: aprovado ou legado -> encerrado, com motivo (>= 15 caracteres). */
    encerrar(id: string, i: EncerrarVinculoInput): Promise<VinculoUnidade>
    autorizadores(unidadeId: string): Promise<Autorizador[]>
  }
  autorizacoes: {
    criar(i: NovaAutorizacaoInput): Promise<AutorizacaoPrevia>
    revogar(id: string): Promise<void>
    /** Destino: id da unidade ou, com `areaComum`, id da área comum. */
    vigentes(
      pessoaId: string,
      destinoId: string,
      opcoes?: { areaComum?: boolean },
    ): Promise<AutorizacaoView[]>
    hoje(): Promise<AutorizacaoView[]>
    /** Quem tem autorização que vale nas próximas `horas` h (1 a 24) e não está dentro. */
    previstas(horas: number): Promise<PrevistoView[]>
  }
  restricoes: {
    /** `unidadeId` null: só restrições de escopo condomínio (funcionário sem unidade de destino). */
    verificar(pessoaId: string, unidadeId: string | null): Promise<ResultadoRestricao>
    criar(i: NovaRestricaoInput): Promise<Restricao>
    aprovar(id: string): Promise<Restricao>
    revogar(id: string): Promise<void>
    pendentes(): Promise<RestricaoView[]>
  }
  eventos: {
    criar(i: NovoEventoInput): Promise<EventoView>
    registrarRecusa(i: NovaRecusaInput): Promise<EventoView>
    registrarSaida(entradaId: string, opcoes?: OpcoesSaida): Promise<EventoView>
    corrigir(
      id: string,
      i: { justificativa: string; observacao?: string; valores?: Partial<ValoresCorrecao> },
    ): Promise<EventoView>
    /** Lista inteira (percorre as páginas, com teto). As telas usam `listarPagina`. */
    listar(f?: FiltroEventos): Promise<EventoView[]>
    /** Uma página (cursor), mais recentes primeiro (seq decrescente). Padrão de 50. */
    listarPagina(f?: FiltroEventosPagina): Promise<PaginaEventos>
    /** Correções registradas para o evento (linha do tempo da gaveta), da mais antiga para a mais nova. */
    correcoesDe(id: string): Promise<EventoView[]>
    obter(id: string): Promise<EventoView>
    presentes(): Promise<EventoView[]>
    /** "+1h" no prazo de permanência (tabela à parte; o evento não muda). */
    prorrogarPermanencia(entradaId: string): Promise<PermanenciaView & { eventoId: string }>
    /** Veículo da última entrada com veículo da pessoa ("mesmo veículo da última visita"); null se não houver. */
    ultimoVeiculo(pessoaId: string): Promise<VeiculoAcesso | null>
  }
  encomendas: {
    /** Lista inteira (percorre as páginas). As telas usam `listarPagina`. */
    listar(f?: { status?: 'aguardando' | 'entregue' }): Promise<EncomendaView[]>
    /** Uma página, mais recentes primeiro (recebimento). Padrão de 50. */
    listarPagina(f?: FiltroEncomendas): Promise<Pagina<EncomendaView>>
    /** Aguardando, atrasadas (há mais de `dias`, padrão 7) e entregues. */
    resumo(dias?: number): Promise<ResumoEncomendas>
    obter(id: string): Promise<EncomendaView>
    receber(i: NovaEncomendaInput): Promise<Encomenda>
    /** RN-08: quem tem vínculo válido na unidade, ou quem foi autorizado (autorizarRetirada). */
    entregar(i: { id: string; pessoaId: string }): Promise<Encomenda>
    autorizarRetirada(i: AutorizarRetiradaInput): Promise<AutorizacaoRetirada>
  }
  ocorrencias: {
    listar(): Promise<OcorrenciaView[]>
    /** Uma página, mais recentes primeiro (abertura). Padrão de 50. */
    listarPagina(f?: FiltroOcorrencias): Promise<Pagina<OcorrenciaView>>
    resumo(): Promise<ResumoOcorrencias>
    obter(id: string): Promise<OcorrenciaView>
    criar(i: NovaOcorrenciaInput): Promise<Ocorrencia>
    alterarStatus(id: string, status: StatusOcorrencia): Promise<Ocorrencia>
    /** RF-28: acrescenta eventos (repetidos são ignorados). Encerrada não muda. */
    vincularEventos(id: string, eventoIds: string[]): Promise<OcorrenciaView>
    /** Anexo (JPEG, PNG ou PDF, até 4 MiB, até 5). Porteiro só na que abriu; encerrada não recebe. */
    anexar(id: string, arquivo: File): Promise<OcorrenciaView>
    baixarAnexo(id: string, documentoId: string): Promise<ArquivoBaixado>
  }
  turno: { resumo(): Promise<ResumoTurno> }
  relatorios: {
    /** Número = últimos N dias (atalho); objeto = filtros completos. */
    resumo(f?: number | FiltroRelatorio): Promise<RelatorioResumo>
    /** Mesmo conteúdo do resumo, em CSV (UTF-8 com BOM, separador ;). */
    exportarCsv(f?: FiltroRelatorio): Promise<PacoteExportacao>
  }
  auditoria: {
    verificarIntegridade(): Promise<ResultadoIntegridade>
    /** Trilha de alterações do sistema (mais recentes primeiro). */
    alteracoes(f?: FiltroAlteracoes): Promise<RegistroAlteracao[]>
    /** Uma página da trilha de alterações (cursor). Padrão de 50. */
    alteracoesPagina(f?: FiltroAlteracoesPagina): Promise<Pagina<RegistroAlteracao>>
    exportar(f?: FiltroEventos): Promise<PacoteExportacao>
    /** Último selo da cadeia e estado da âncora externa (spec 4.6). Só na API real. */
    selos(): Promise<EstadoSelos>
    /** Sela a cabeça da cadeia agora e envia a âncora (SI/AU). */
    selar(): Promise<ResultadoSelar>
    /** Confere seq + hash recebidos por fora (e-mail da âncora) contra o banco. */
    conferirAncora(i: { seq: number; hash: string }): Promise<ConferenciaAncora>
  }
  usuarios: {
    /** Uma página em ordem alfabética (usuario.ver). A busca `q` vai no corpo; anonimizados não aparecem. */
    listarPagina(f?: FiltroUsuarios): Promise<Pagina<UsuarioSistema>>
    resumo(): Promise<ResumoUsuarios>
    criar(i: NovoUsuarioInput): Promise<UsuarioComSenhaTemporaria>
    /** Nome, login e papel (usuario.gerenciar). Mudar o papel encerra as sessões do alvo; o próprio papel não muda. */
    editar(id: string, i: EdicaoUsuarioInput): Promise<UsuarioSistema>
    desativar(id: string): Promise<UsuarioSistema>
    reativar(id: string): Promise<UsuarioSistema>
    /** Gera senha temporária, derruba as sessões do alvo e exige troca no próximo login. */
    redefinirAcesso(id: string): Promise<UsuarioComSenhaTemporaria>
  }
  lgpd: {
    /** spec 9.3: JSON com cadastro mascarado, vínculos, veículos, eventos e encomendas. SI/AD. */
    exportarPessoa(pessoaId: string): Promise<PacoteExportacao>
    /** Eliminação a pedido (SI): só sem vínculo válido; informa o que fica retido. */
    anonimizar(pessoaId: string): Promise<ResultadoAnonimizacao>
    /** RNF-09 (SI): anonimiza quem passou do prazo de 3 anos. Na API real também descarta eventos selados e arquivos vencidos. */
    aplicarRetencao(): Promise<ResultadoRetencao>
    /** Última execução da retenção, ou null se nunca rodou. SI. */
    ultimaRetencao(): Promise<ExecucaoRetencao | null>
  }
  importacao: {
    analisar(i: { arquivo: string; linhas: LinhaPlanilha[] }): Promise<RelatorioImportacao>
    confirmar(id: string): Promise<ResultadoImportacao>
  }
}
