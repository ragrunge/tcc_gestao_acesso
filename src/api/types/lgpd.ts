/** LGPD art. 18 (spec 9.3). */
export interface ResultadoAnonimizacao {
  pessoaId: string
  registrosRedigidos: number
  retido: string[]
  /** API real: o que a anonimização limpou (contagens) e se o nome foi procurado no texto livre. */
  limpeza?: { textoLivre: 'substituido' | 'nome_curto' | 'homonimo'; eventosComTexto: number }
  /** API real: eventos da pessoa que ficam retidos (só pelo id) e até quando (início do dia BRT, ms). */
  eventosRetidos?: number
  retidoAte?: number | null
  /** API real: arquivos da pessoa (foto) eliminados do storage. */
  documentosEliminados?: number
}
export interface ResultadoRetencao {
  visitantesPrestadores: number
  moradores: number
  registrosRedigidos: number
  pessoaIds: string[]
  // Além das pessoas, a retenção conta eventos, trilha e arquivos descartados:
  /** Eventos do prefixo da cadeia descartados (com selo no seq de corte). */
  eventosDescartados?: number
  /** Eventos com mais de 3 anos que ficaram por falta de selo no ponto de corte. */
  eventosVencidosSemSelo?: number
  /** Registros da trilha de alterações com mais de 3 anos descartados. */
  trilhaDescartada?: number
  fotosEliminadas?: number
  anexosEliminados?: number
  /** false: o prazo dos anexos de ocorrência não foi definido (decisão em aberto) e nenhum anexo foi eliminado. */
  prazoAnexosDefinido?: boolean
  arquivosOrfaosRemovidos?: number
  /** Registros de documento cujo arquivo não está no volume (só registrado em log; nada é alterado). */
  registrosSemArquivo?: number
  /** Veículos desativados há mais de 3 anos apagados. */
  veiculosEliminados?: number
  /** Operadores desativados há mais de 3 anos com nome e login genéricos. */
  operadoresAnonimizados?: number
  /** Sessões sem uso há mais de 90 dias com IP e navegador apagados. */
  sessoesLimpas?: number
  /** Anonimizações refeitas depois de um restore (registro fora do banco). */
  anonimizacoesReaplicadas?: number
  reaplicadasComVinculoValido?: string[]
  /** 'falhou': o registro das anonimizações fora do banco do condomínio não respondeu (fica para a próxima execução). */
  registroExterno?: 'ok' | 'falhou'
}
/** Última execução da retenção (agendador ou sob demanda). */
export interface ExecucaoRetencao {
  em: number
  porNome: string
  resultado: ResultadoRetencao
}
