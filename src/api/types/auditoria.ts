import type { CategoriaPessoa, MeioAutorizacao } from '@/domain/types'
import type { PosicaoTrilha } from './paginacao'

export interface FiltroAlteracoes {
  de?: number
  ate?: number
  usuarioId?: string
  acao?: string
  entidade?: string
}
/** Uma página da trilha de alterações (mais recentes primeiro). */
export interface FiltroAlteracoesPagina extends FiltroAlteracoes, PosicaoTrilha {}
/** Selo da cadeia de hashes (spec 4.6). `data` = início do dia BRT (ms). */
export interface SeloCadeia {
  id: string
  data: number
  tipo: 'diario' | 'manual'
  ultimoSeq: number
  ultimoHash: string
  criadoEm: number
  /** Destino da âncora externa; nulo enquanto o envio estiver pendente. */
  enviadoPara: string | null
  enviadoEm: number | null
}
export interface EstadoSelos {
  ultimo: SeloCadeia | null
  pendentesEnvio: number
  /** Destinos configurados para a âncora (vazio = sem destino). */
  destinos: string[]
  /** O agendador diário está ligado nesta API. */
  agendador: boolean
}
export interface ResultadoSelar {
  selo: SeloCadeia
  novo: boolean
  ancora: 'enviada' | 'pendente' | 'sem_destino'
}
export interface ConferenciaAncora {
  confere: boolean
  motivo: 'confere' | 'hash_divergente' | 'seq_descartado' | 'seq_inexistente'
  seq: number
  hashNoBanco: string | null
  seloRegistrado: boolean
}
export interface PacoteExportacao {
  nomeArquivo: string
  conteudo: string
  quantidade: number
}

/** Filtros dos relatórios (RF-30/RF-31). Sem `de`/`ate`: últimos 30 dias até hoje. `de`/`ate` são instantes; o servidor usa o dia inteiro. */
export interface FiltroRelatorio {
  de?: number
  ate?: number
  unidadeId?: string
  categoria?: CategoriaPessoa
  meio?: MeioAutorizacao
}

export interface RelatorioResumo {
  /** Período efetivamente aplicado (início do primeiro dia, fim do último). */
  periodo: { de: number; ate: number }
  acessosPorDia: { dia: number; entradas: number }[]
  acessosPorMeio: { meio: MeioAutorizacao; total: number }[]
  /** Agrupado por operadorId (autorização sem solicitante conta para quem a cadastrou). */
  excecoesPorPorteiro: { operadorId: string; operador: string; total: number }[]
  encomendasPorIdade: { faixa: string; total: number }[]
  cadastroCompleto: { unidadesCompletas: number; total: number }
  totais: {
    entradas: number
    negados: number
    recusados: number
    retroativos: number
    excecoes: number
  }
}
