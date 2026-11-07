import type { FiltroEventos, UnidadeDetalhe, VinculoView } from '@/api/types'
import { toInputDate } from '@/domain/time'
import type { EventoView, Funcionario, Pessoa, Unidade, Veiculo } from '@/domain/types'
import { respostaInvalida, semIndefinidos } from './rpc'

// O adaptador monta o detalhe campo a campo: sem repassar `encomendas`, a seção da ficha nunca aparece.
export function encomendasDaUnidade(e: UnidadeDetalhe['encomendas']): UnidadeDetalhe['encomendas'] {
  if (e == null) return null
  if (
    typeof e.aguardando !== 'number' ||
    typeof e.atrasadas !== 'number' ||
    !Array.isArray(e.itens)
  )
    throw respostaInvalida()
  if (e.itens.some((x) => typeof x?.id !== 'string' || typeof x.recebidaEm !== 'number'))
    throw respostaInvalida()
  return { aguardando: e.aguardando, atrasadas: e.atrasadas, itens: e.itens }
}
/** 'ABC1D23' -> 'ABC-1D23' (como a tela exibe o veículo da unidade). */
export const formatarPlaca = (p: string) =>
  /^[A-Z0-9]{7}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p
/** Início do dia BRT (ms) -> 'AAAA-MM-DD'. */
export const dia = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? null : toInputDate(ms)

/** Pessoa do banco: `telefoneMascarado` nulo some (como o pessoaDe do cliente HTTP antigo); o telefone completo nunca vem. */
export function pessoaDe<T extends object>(p: T): T & Pessoa {
  if (!p || typeof (p as { id?: unknown }).id !== 'string') throw respostaInvalida()
  const { telefoneMascarado, ...resto } = p as T & { telefoneMascarado?: string | null }
  return {
    ...resto,
    documentoTipo: 'cpf',
    ...(telefoneMascarado ? { telefoneMascarado } : {}),
  } as unknown as T & Pessoa
}
export function eventoDe(e: EventoView): EventoView {
  if (
    !e ||
    typeof e.id !== 'string' ||
    typeof e.seq !== 'number' ||
    typeof e.ocorridoEm !== 'number'
  )
    throw respostaInvalida()
  return e
}
export const TIPOS_EVENTO = ['entrada', 'saida', 'negado', 'recusado', 'correcao'] as const
export const unidadeDe = (u: Unidade): Unidade => {
  if (!u || typeof u.id !== 'string') throw respostaInvalida()
  return { id: u.id, bloco: u.bloco, numero: u.numero, ativo: u.ativo }
}
export function vinculoDe(v: VinculoView): VinculoView {
  if (!v || typeof v.id !== 'string' || typeof v.status !== 'string') throw respostaInvalida()
  return v
}
export const veiculoDe = (v: Veiculo): Veiculo => {
  if (!v || typeof v.id !== 'string' || typeof v.placa !== 'string') throw respostaInvalida()
  return { ...v, placa: formatarPlaca(v.placa) }
}
export const funcionarioBase = (f: Funcionario): Funcionario => ({
  pessoaId: f.pessoaId,
  funcao: f.funcao,
  escala: f.escala,
  ativo: f.ativo,
})
/** Filtros de evento no corpo (o nome e a placa são dado pessoal: nunca em URL). */
export function filtroEventos(f: FiltroEventos): Record<string, unknown> {
  return semIndefinidos({
    eventoId: f.eventoId,
    de: f.de !== undefined ? Math.trunc(f.de) : undefined,
    ate: f.ate !== undefined ? Math.trunc(f.ate) : undefined,
    unidadeId: f.unidadeId,
    pessoaId: f.pessoaId,
    pessoa: f.pessoa?.trim() || undefined,
    placa: f.placa?.trim() || undefined,
    operadorId: f.operadorId,
    tipo: f.tipo,
    meio: f.meio,
    somenteExcecoes: f.somenteExcecoes || undefined,
    somenteRetroativos: f.somenteRetroativos || undefined,
    excluirTipos: f.excluirTipos?.length ? f.excluirTipos : undefined,
  })
}
