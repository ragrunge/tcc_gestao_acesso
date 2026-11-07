import { menosAnos } from '../time'
import type { Pessoa, VinculoUnidade } from '../types'

// ----- Retenção (RNF-09, spec 9.1) ----------------------------------------------------------------

export const ANOS_RETENCAO = 3

/** Término do vínculo para a retenção: encerrado_em; no rejeitado, a decisão. Vínculo ainda ativo não terminou. */
export function terminoVinculo(v: VinculoUnidade): number | null {
  if (v.status === 'encerrado') return v.encerradoEm ?? v.vigenciaFim
  if (v.status === 'rejeitado') return v.decididoEm ?? v.solicitadoEm
  return null
}

/**
 * Pessoa elegível para anonimização automática (RNF-09):
 * - visitante/prestador: último acesso (ou o cadastro, se nunca entrou) há mais de 3 anos;
 * - morador: nenhum vínculo ativo (pendente, aprovado ou legado) e o último terminou há mais de 3 anos.
 * Funcionário e pessoa já anonimizada ficam de fora.
 */
export function elegivelRetencao(
  p: Pick<Pessoa, 'categoria' | 'anonimizadaEm' | 'criadoEm'>,
  vinculosDaPessoa: readonly VinculoUnidade[],
  ultimoAcesso: number | null,
  agora: number,
): boolean {
  if (p.anonimizadaEm) return false
  const limite = menosAnos(agora, ANOS_RETENCAO)
  if (p.categoria === 'visitante' || p.categoria === 'prestador') {
    // Visitante que já teve vínculo ativo não é anonimizado como visitante
    if (vinculosDaPessoa.some((v) => terminoVinculo(v) === null)) return false
    return (ultimoAcesso ?? p.criadoEm) < limite
  }
  if (p.categoria === 'morador') {
    if (vinculosDaPessoa.length === 0) return (ultimoAcesso ?? p.criadoEm) < limite
    const terminos = vinculosDaPessoa.map(terminoVinculo)
    if (terminos.some((t) => t === null)) return false
    return Math.max(...(terminos as number[])) < limite
  }
  return false
}
