import type { PermanenciaView } from './permanencia'
import type { CategoriaPessoa, Papel } from './pessoas'

export type TipoEvento = 'entrada' | 'saida' | 'negado' | 'correcao' | 'recusado'
// 'celular': WhatsApp ou ligação para o celular do morador quando ele não atende o interfone (questionário 22/10/2026).
// Mesma regra do interfone (morador identificado, com vínculo válido); não é exceção.
export type MeioAutorizacao =
  | 'interfone'
  | 'celular'
  | 'morador_presente'
  | 'autorizacao_previa'
  | 'excecao_porteiro'
  | 'escala'
export const ROTULO_MEIO: Record<MeioAutorizacao, string> = {
  interfone: 'Interfone',
  celular: 'Celular (WhatsApp ou ligação)',
  morador_presente: 'Morador presente na portaria',
  autorizacao_previa: 'Autorização prévia',
  excecao_porteiro: 'Exceção do porteiro',
  escala: 'Escala',
}
export const ROTULO_MEIO_CURTO: Record<MeioAutorizacao, string> = {
  interfone: 'Interfone',
  celular: 'Celular',
  morador_presente: 'Morador presente',
  autorizacao_previa: 'Autorização prévia',
  excecao_porteiro: 'Exceção',
  escala: 'Escala',
}

/**
 * Valores que uma correção substitui (spec 4.4). Mesmo conjunto de `correcao_valores` no banco, em camelCase e
 * com instante em epoch ms; a serialização canônica (hashChain.ts) converte para snake_case e ISO.
 */
export interface ValoresCorrecao {
  unidadeDestinoId: string | null
  ocorridoEm: number
  pessoaId: string
  autorizadoPorPessoaId: string | null
}
/** Ordem canônica (igual a CHAVES_CORRECAO_V1 em snake_case). */
export const CAMPOS_CORRIGIVEIS = [
  'unidadeDestinoId',
  'ocorridoEm',
  'pessoaId',
  'autorizadoPorPessoaId',
] as const

/**
 * Evento de acesso: APPEND-ONLY. Nunca é alterado; saída e correção são novos eventos.
 * Mesmas colunas de `evento_acesso`. Não há código nem nome copiado: o código de exibição deriva de `seq`
 * (`codigoEvento`) e os nomes vêm das views.
 */
export interface EventoAcesso {
  id: string
  seq: number
  /** Versão da serialização canônica do hash: 1 sem veículo, 2 entrada com veículo (hashChain.ts). */
  formatoHash: number
  tipo: TipoEvento
  categoriaPessoa: CategoriaPessoa
  pessoaId: string
  /** Destino: unidade OU área comum (área comum só para prestador, RF-36). */
  unidadeDestinoId: string | null
  areaComumId: string | null
  pontoAcessoId: string
  autorizadoPorTipo: MeioAutorizacao | null
  autorizadoPorPessoaId: string | null
  autorizacaoPreviaId: string | null
  justificativa: string | null
  restricaoId: string | null
  operadorId: string
  /** Papel do operador no momento do registro (entra no hash). */
  operadorPapel: Papel
  ocorridoEm: number
  registradoEm: number
  retroativo: boolean
  /** Saída aponta para a entrada. */
  refereEventoId: string | null
  /** Correção aponta para o evento corrigido (RN-04). */
  corrigeEventoId: string | null
  observacao: string | null
  /** Nº do formulário de papel (contingência). Obrigatório em registro retroativo; entra no hash. */
  formularioContingencia: string | null
  /** Correção: valores substituídos (acumulado das correções anteriores), ou null se for só anotação. */
  correcaoValores: Partial<ValoresCorrecao> | null
  /** Só prestador: copiados do cadastro no momento da entrada (RF-36). */
  empresa: string | null
  servico: string | null
  /**
   * Veículo com que a pessoa chegou (só entrada; entra no hash, formato 2). Placa em maiúsculas sem hífen
   * (antiga ou Mercosul); modelo e cor opcionais. A pé: os três nulos. Não é corrigível (fora de correcao_valores).
   */
  veiculoPlaca: string | null
  veiculoModelo: string | null
  veiculoCor: string | null
  hashAnterior: string
  hash: string
}

/** Veículo de um acesso, para exibição (placa sem hífen, como gravada). */
export interface VeiculoAcesso {
  placa: string
  modelo: string | null
  cor: string | null
}

/** Evento com nomes resolvidos para exibição (a trilha guarda apenas IDs). */
export interface EventoView extends EventoAcesso {
  /** Código de exibição derivado de `seq` (EV-000123). Não é gravado. */
  codigo: string
  pessoaNome: string
  operadorNome: string
  /** Código da unidade ("A-32") ou nome da área comum. */
  unidadeRotulo: string | null
  areaComumNome: string | null
  pontoAcessoNome: string
  /**
   * Quem autorizou, resolvido pelo id (interfone, celular, morador presente, recusa e autorização prévia com solicitante).
   * Autorização sem solicitante: "Sem solicitante — cadastrada por <usuário>"; área comum: "Área comum — cadastrada por <usuário>".
   */
  autorizadoPorNome: string | null
  /**
   * Veículo do acesso: o da própria entrada ou, numa saída, o da entrada a que ela se refere (a saída não grava
   * veículo). Nulo a pé e nos demais tipos.
   */
  veiculo: VeiculoAcesso | null
  /** Para entradas: a saída vinculada, se houver. */
  saida: { id: string; codigo: string; em: number } | null
  /** Para entradas sem saída ainda. */
  dentro: boolean
  /** Para saídas: código da entrada. */
  entradaCodigo: string | null
  /** Se houver correção com valores, os campos acima já vêm EFETIVOS; aqui ficam os valores originais substituídos. */
  valoresOriginais: Partial<ValoresCorrecao> | null
  /** Última correção aplicada a este evento (original + última correção). */
  correcao: {
    id: string
    codigo: string
    em: number
    justificativa: string | null
    observacao: string | null
    operadorNome: string
  } | null
  /** Para eventos de correção: os valores que ela substitui. */
  valoresCorrigidos: Partial<ValoresCorrecao> | null
  /** Nomes para exibir a pessoa original (evento corrigido) e a pessoa corrigida (evento de correção). */
  pessoaNomeOriginal: string | null
  pessoaNomeCorrigida: string | null
  /** Nomes do autorizador original (evento corrigido) e corrigido (evento de correção). */
  autorizadoPorNomeOriginal: string | null
  autorizadoPorNomeCorrigido: string | null
  /** Entrada por autorização prévia cadastrada sem solicitante (conta como exceção). */
  autorizacaoSemSolicitante: boolean
  /**
   * Prazo de permanência vigente (tabela `permanencia`, fora da cadeia de hash). Só na listagem de presentes
   * (`GET /acessos/presentes`); nulo para morador, funcionário e entradas anteriores à migração 0011.
   */
  permanencia?: PermanenciaView | null
}
