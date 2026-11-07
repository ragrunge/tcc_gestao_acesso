import type { Papel } from './pessoas'

export type StatusImportacao = 'analisada' | 'confirmada' | 'cancelada'

/** Importação da planilha (RF-11). As linhas não ficam aqui: só contagens (como no schema). */
export interface Importacao {
  id: string
  arquivoNome: string
  arquivoSha256: string
  status: StatusImportacao
  lidas: number
  importaveis: number
  rejeitadas: number
  avisos: number
  importados: number | null
  reaproveitados: number | null
  prazoRegularizacao: number
  executadaPorId: string
  analisadaEm: number
  confirmadaEm: number | null
}

/** Trilha de alterações do sistema (append-only), distinta da trilha de acessos com hash. */
export interface RegistroAlteracao {
  id: string
  seq: number
  em: number
  usuarioId: string | null // null: falha de login com usuário inexistente
  usuarioNome: string
  usuarioPapel: Papel | null
  acao: string // ex.: 'pessoa.criar'
  entidade: string
  registroId: string
  /** Snapshots com CPF/telefone mascarados. */
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  /** Preenchido pela redação LGPD (única alteração permitida, como `lgpd_redigir_audit_pessoa`). */
  redigidoEm?: number | null
}
