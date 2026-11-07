import { HORA } from '../time'

// ----- Senha temporária (spec §5.1) ---------------------------------------------------------------------------------
// Criada pela administração (cadastro ou redefinição) e enviada por mensagem: vale 72 h. Constante de regra, não
// configuração de ambiente. A API grava o fim em usuario_sistema.senha_temporaria_expira_em.
export const SENHA_TEMPORARIA_VALIDADE_MS = 72 * HORA

/**
 * Senha temporária vencida: troca pendente e prazo passado. Troca pendente SEM prazo gravado também conta como vencida
 * (falha fechada: linha escrita fora da API não vira senha eterna). Sem troca pendente, nunca.
 */
export function senhaTemporariaVencida(
  u: { deveTrocarSenha?: boolean; senhaTemporariaExpiraEm?: number | null },
  agora: number,
): boolean {
  if (!u.deveTrocarSenha) return false
  return u.senhaTemporariaExpiraEm == null || u.senhaTemporariaExpiraEm <= agora
}
