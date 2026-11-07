import type { Papel, UsuarioSistema } from '@/domain/types'
import type { PosicaoPagina } from './paginacao'

export interface LoginInput {
  login: string
  senha: string
  /** "Manter conectado neste computador" (sessão longa). A API ignora para o porteiro. */
  manterConectado?: boolean
}
export interface TrocarSenhaInput {
  senhaAtual: string
  novaSenha: string
}
export interface NovoUsuarioInput {
  nome: string
  login: string
  papel: Papel
}
/** Edição de usuário (0039): campo ausente não muda. */
export type EdicaoUsuarioInput = Partial<NovoUsuarioInput>
/** Usuário da sessão: o de sistema + a marca de troca obrigatória (senha temporária). */
/** Condomínio da sessão, como login e /auth/me devolvem: só o nome (cabeçalho e exportações). */
export interface CondominioSessao {
  nome: string
}

/** `condominio` ausente ou null: resposta sem o nome (o layout cai no nome padrão). */
export interface UsuarioSessao extends UsuarioSistema {
  deveTrocarSenha: boolean
  condominio?: CondominioSessao | null
}

/**
 * Criação e redefinição devolvem a senha temporária UMA vez. Quem recebe mostra e descarta: não vai para estado
 * global, cache do React Query nem storage.
 */
export interface UsuarioComSenhaTemporaria {
  usuario: UsuarioSistema
  senhaTemporaria: string
}

/** Avisos de sessão que a camada HTTP emite para o AuthContext. */
export type EventoSessao = 'expirada' | 'troca_obrigatoria'
export type SituacaoUsuario = 'ativos' | 'desativados'
export interface FiltroUsuarios extends PosicaoPagina {
  q?: string
  papel?: Papel
  situacao?: SituacaoUsuario
}
/** `porPapel` conta só os ativos. */
export interface ResumoUsuarios {
  ativos: number
  desativados: number
  porPapel: Record<Papel, number>
}
