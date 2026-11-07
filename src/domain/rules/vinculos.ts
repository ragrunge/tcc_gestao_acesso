import { DIA } from '../time'
import type { ConferenciaComprovante, Pessoa, VinculoUnidade } from '../types'
import type { ErroRegra } from './comum'

// ----- Vínculo --------------------------------------------------------------------------------

/**
 * Vínculo válido = aprovado dentro da vigência OU legado dentro do prazo de regularização (RN-09).
 * Mesma regra para autorizar visitante por interfone ou celular e para retirar encomenda.
 * Datas de fim/prazo valem até o fim do dia.
 */
export function vinculoValido(v: VinculoUnidade, agora: number): boolean {
  if (v.status === 'aprovado') {
    if (v.vigenciaInicio !== null && agora < v.vigenciaInicio) return false
    if (v.vigenciaFim !== null && agora >= v.vigenciaFim + DIA) return false
    return true
  }
  if (v.status === 'legado')
    return v.prazoRegularizacao !== null && agora < v.prazoRegularizacao + DIA
  return false
}

export const vinculosValidosDaUnidade = (
  vs: readonly VinculoUnidade[],
  unidadeId: string,
  agora: number,
) => vs.filter((v) => v.unidadeId === unidadeId && vinculoValido(v, agora))

export const pessoaTemVinculoValido = (
  vs: readonly VinculoUnidade[],
  pessoaId: string,
  unidadeId: string,
  agora: number,
) => vs.some((v) => v.pessoaId === pessoaId && v.unidadeId === unidadeId && vinculoValido(v, agora))

/**
 * RN-08: encomenda só é entregue a pessoa com vínculo válido na unidade de destino OU autorizada a retirar
 * por um morador com vínculo válido (`autorizada`). `rotulo` é o código da unidade, só para a mensagem.
 */
export function podeEntregarEncomenda(
  vs: readonly VinculoUnidade[],
  pessoaId: string,
  unidadeId: string,
  agora: number,
  autorizada = false,
  rotulo = 'unidade',
): { ok: true; por: 'vinculo' | 'autorizacao' } | { ok: false; motivo: string } {
  if (pessoaTemVinculoValido(vs, pessoaId, unidadeId, agora)) return { ok: true, por: 'vinculo' }
  if (autorizada) return { ok: true, por: 'autorizacao' }
  return {
    ok: false,
    motivo: `Esta pessoa não tem vínculo com a ${rotulo} nem autorização de retirada. Contate a unidade.`,
  }
}

/**
 * Cadastro completo (pré-requisito para aprovar ou regularizar vínculo): CPF (não "sem CPF"), telefone e não anonimizado.
 * Dependente menor de idade (LGPD art. 14) num vínculo de `dependente` dispensa CPF e telefone.
 */
export const cadastroCompleto = (
  p?: Pick<
    Pessoa,
    'semCpf' | 'documentoBusca' | 'telefone' | 'anonimizadaEm' | 'menorIdade'
  > | null,
  tipoVinculo?: string,
) =>
  !!p &&
  !p.semCpf &&
  !p.anonimizadaEm &&
  ((!!p.documentoBusca && /^\d{10,11}$/.test((p.telefone ?? '').replace(/\D/g, ''))) ||
    (!!p.menorIdade && tipoVinculo === 'dependente'))

/** Legado com prazo de regularização vencido (RN-09): continua listado, em destaque, para revisão da administração. */
export const legadoVencido = (v: VinculoUnidade, agora: number) =>
  v.status === 'legado' && v.prazoRegularizacao !== null && agora >= v.prazoRegularizacao + DIA

// Conferência do comprovante (RF-05). Mesmos limites dos CHECKs vinculo_conferencia_* do banco.
export const MAX_DESCRICAO_COMPROVANTE = 80
export const MAX_OBSERVACAO_CONFERENCIA = 200
/** Heurística anti-dado-pessoal (CHECK vinculo_conferencia_sem_numero_ck): 9+ dígitos seguidos, ignorando ". -", é CPF ou telefone. */
export const temNumeroDePessoa = (t: string) => /[0-9]{9}/.test(t.replace(/[. -]/g, ''))

export function validarConferencia(
  i: { tipo: string; descricao?: string; observacao?: string; data: number },
  agora: number,
): ErroRegra | null {
  const e = (code: string, message: string): ErroRegra => ({ status: 422, code, message })
  if (!['escritura', 'contrato_compra_venda', 'contrato_locacao', 'outro'].includes(i.tipo))
    return e('TIPO_COMPROVANTE_INVALIDO', 'Tipo de comprovante inválido.')
  const desc = (i.descricao ?? '').trim()
  const obs = (i.observacao ?? '').trim()
  if (i.tipo === 'outro' && !desc)
    return e('DESCRICAO_OBRIGATORIA', 'Descreva o comprovante quando o tipo for “Outro”.')
  if (desc.length > MAX_DESCRICAO_COMPROVANTE)
    return e(
      'DESCRICAO_LONGA',
      `A descrição tem no máximo ${MAX_DESCRICAO_COMPROVANTE} caracteres.`,
    )
  if (obs.length > MAX_OBSERVACAO_CONFERENCIA)
    return e(
      'OBSERVACAO_LONGA',
      `A observação tem no máximo ${MAX_OBSERVACAO_CONFERENCIA} caracteres.`,
    )
  if (temNumeroDePessoa(`${i.tipo === 'outro' ? desc : ''} ${obs}`)) {
    return e(
      'DADO_PESSOAL_NA_CONFERENCIA',
      'Não escreva CPF, telefone ou outro número pessoal na conferência: registre só o tipo do documento.',
    )
  }
  if (i.data > agora) return e('DATA_FUTURA', 'A data da conferência não pode ser futura.')
  return null
}

/** RN-02: aprovar exige conferência registrada (o cadastro completo é checado à parte); rejeitar exige justificativa. */
export function validarDecisaoVinculo(
  decisao: 'aprovar' | 'rejeitar',
  justificativa: string | undefined,
  conferencia: ConferenciaComprovante | null,
): ErroRegra | null {
  const j = (justificativa ?? '').trim()
  if (decisao === 'rejeitar' && j.length === 0) {
    return {
      status: 422,
      code: 'JUSTIFICATIVA_OBRIGATORIA',
      message: 'Rejeitar um vínculo exige justificativa.',
    }
  }
  if (decisao === 'aprovar' && !conferencia) {
    return {
      status: 422,
      code: 'CONFERENCIA_OBRIGATORIA',
      message: 'Registre a conferência do comprovante (RF-05) antes de aprovar o vínculo.',
    }
  }
  return null
}
