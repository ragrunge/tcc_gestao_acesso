import { type ErroRegra, MIN_JUSTIFICATIVA, justificativaValida } from './comum'

// ----- Desativação do cadastro (RF-02) ----------------------------------------------------------------------------

/** Desativado: não entra, não recebe vínculo nem autorização prévia, some das buscas. O histórico continua. */
export const pessoaDesativada = (p: { desativadaEm?: number | null }) => p.desativadaEm != null

export const ERRO_PESSOA_DESATIVADA: ErroRegra = {
  status: 422,
  code: 'PESSOA_DESATIVADA',
  message:
    'Cadastro desativado: peça à administração ou ao síndico para reativá-lo antes de registrar.',
}

/**
 * Pode desativar? Ordem: estado do cadastro (409) -> motivo (422) -> o que prende a pessoa ao condomínio (422).
 * Autorizações prévias vigentes NÃO bloqueiam: são revogadas junto (spec §14, 2026-10-22).
 */
export function validarDesativacaoPessoa(
  p: { anonimizada: boolean; desativada: boolean },
  motivo: string | null | undefined,
  prende: { vinculoValido: boolean; dentro: boolean; funcionarioAtivo: boolean },
): ErroRegra | null {
  if (p.anonimizada)
    return {
      status: 409,
      code: 'PESSOA_ANONIMIZADA',
      message: 'Cadastro anonimizado não pode ser desativado.',
    }
  if (p.desativada)
    return {
      status: 409,
      code: 'PESSOA_JA_DESATIVADA',
      message: 'Este cadastro já está desativado.',
    }
  if (!justificativaValida(motivo))
    return {
      status: 422,
      code: 'MOTIVO_OBRIGATORIO',
      message: `Informe o motivo da desativação (pelo menos ${MIN_JUSTIFICATIVA} caracteres).`,
    }
  if (prende.dentro)
    return {
      status: 422,
      code: 'PESSOA_DENTRO',
      message: 'A pessoa consta como dentro do condomínio: registre a saída antes de desativar.',
    }
  if (prende.vinculoValido)
    return {
      status: 422,
      code: 'PESSOA_COM_VINCULO_VALIDO',
      message: 'A pessoa tem vínculo válido com uma unidade: encerre o vínculo antes de desativar.',
    }
  if (prende.funcionarioAtivo)
    return {
      status: 422,
      code: 'FUNCIONARIO_ATIVO',
      message: 'A pessoa é funcionário ativo: desative-a em Funcionários antes.',
    }
  return null
}
