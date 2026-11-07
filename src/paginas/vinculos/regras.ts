import type { FiltroVinculos, VinculoView } from '@/api'
import type { Pessoa, StatusVinculo, TipoVinculo, Unidade } from '@/domain/types'
import { codigoUnidade } from '@/domain/units'

export type Aba = 'pendentes' | 'decididos' | 'legados'

/** Uma fila por aba, paginada no servidor. Legados por prazo: os vencidos vêm primeiro (RN-09). */
export const FILAS: Record<Aba, Pick<FiltroVinculos, 'status' | 'ordem'>> = {
  pendentes: { status: ['pendente'], ordem: 'recentes' },
  legados: { status: ['legado'], ordem: 'prazo' },
  decididos: { status: ['aprovado', 'rejeitado', 'encerrado'], ordem: 'decisao' },
}

/** Status que impedem um vínculo novo da mesma pessoa com a mesma unidade (índice parcial vinculo_ativo_uq). */
export const STATUS_QUE_BLOQUEIAM: readonly StatusVinculo[] = ['pendente', 'aprovado', 'legado']
export const TIPOS: readonly TipoVinculo[] = ['proprietario', 'inquilino', 'dependente']
export const DICA_TIPO: Record<TipoVinculo, string> = {
  proprietario: 'Fim da vigência opcional.',
  inquilino: 'Exige data de fim da vigência.',
  dependente: 'Menor de idade dispensa CPF e telefone na aprovação.',
}

/** Vínculo já existente (pendente, aprovado ou legado) da pessoa com a unidade: a API recusaria com 409. */
export function vinculoQueBloqueia(
  vinculos: readonly VinculoView[] | null | undefined,
  pessoaId: string,
  unidadeId: string,
) {
  return vinculos?.find(
    (v) =>
      v.pessoaId === pessoaId &&
      v.unidadeId === unidadeId &&
      STATUS_QUE_BLOQUEIAM.includes(v.status),
  )
}

/** Motivo para não oferecer a combinação pessoa + unidade; null = pode. `unidadesValidas`: o que a busca de pessoas devolve. */
export function motivoConflito(
  vinculos: readonly VinculoView[] | null | undefined,
  pessoaId: string,
  unidadeId: string,
  unidadesValidas?: readonly string[],
): string | null {
  const v = vinculoQueBloqueia(vinculos, pessoaId, unidadeId)
  if (v) return `Já tem vínculo ${v.status} com esta unidade`
  if (unidadesValidas?.includes(unidadeId)) return 'Já tem vínculo válido com esta unidade'
  return null
}

export interface RascunhoVinculo {
  pessoa: Pick<Pessoa, 'id' | 'desativadaEm' | 'anonimizadaEm'> | null
  unidade: Pick<Unidade, 'id' | 'ativo' | 'bloco' | 'numero'> | null
  tipo: TipoVinculo
  /** "AAAA-MM-DD" ou vazio. */
  inicio: string
  fim: string
  conflito: string | null
}
export type ErrosVinculo = Partial<Record<'pessoa' | 'unidade' | 'fim', string>>

/** As mesmas recusas da API (422/409), em texto para o campo. Vazio = pode seguir para a revisão. */
export function validarNovoVinculo(r: RascunhoVinculo): ErrosVinculo {
  const e: ErrosVinculo = {}
  if (!r.pessoa) e.pessoa = 'Escolha a pessoa.'
  else if (r.pessoa.anonimizadaEm) e.pessoa = 'Cadastro anonimizado não recebe vínculo.'
  else if (r.pessoa.desativadaEm)
    e.pessoa = 'Cadastro desativado: reative a pessoa antes de vincular.'
  if (!r.unidade) e.unidade = 'Escolha a unidade.'
  else if (!r.unidade.ativo) e.unidade = `A unidade ${codigoUnidade(r.unidade)} está desativada.`
  else if (r.conflito) e.unidade = `${r.conflito}: não dá para duplicar.`
  if (r.tipo === 'inquilino' && !r.fim) e.fim = 'Inquilino exige data de fim da vigência.'
  else if (r.inicio && r.fim && r.fim < r.inicio)
    e.fim = 'O fim da vigência não pode ser anterior ao início.'
  return e
}
