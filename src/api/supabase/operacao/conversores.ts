import type { EncomendaView, FiltroRelatorio, FuncionarioView, OcorrenciaView } from '@/api/types'
import { toInputDate } from '@/domain/time'
import { pessoaDe, respostaInvalida, semIndefinidos } from '../portaria'

const DIA_MS = 86_400_000
export function encomendaDe(e: EncomendaView): EncomendaView {
  if (
    !e ||
    typeof e.id !== 'string' ||
    typeof e.recebidaEm !== 'number' ||
    !Array.isArray(e.autorizacoes)
  )
    throw respostaInvalida()
  return e
}
export function ocorrenciaDe(o: OcorrenciaView): OcorrenciaView {
  if (
    !o ||
    typeof o.id !== 'string' ||
    typeof o.abertaEm !== 'number' ||
    !Array.isArray(o.historicoStatus) ||
    !Array.isArray(o.eventoIds)
  )
    throw respostaInvalida()
  return {
    ...o,
    anexos: Array.isArray(o.anexos) ? o.anexos : [],
    documentos: Array.isArray(o.documentos) ? o.documentos : [],
  }
}
export function funcionarioDe(f: FuncionarioView): FuncionarioView {
  if (!f || typeof f.pessoaId !== 'string' || !f.pessoa || !f.escala) throw respostaInvalida()
  return {
    pessoaId: f.pessoaId,
    funcao: f.funcao,
    escala: f.escala,
    ativo: f.ativo,
    pessoa: pessoaDe(f.pessoa),
    emEscalaAgora: f.emEscalaAgora === true,
  }
}

/** Filtro de relatório: instantes -> dias de calendário BRT (o cliente HTTP antigo mandava o mesmo na query). */
export function filtroRelatorio(f?: number | FiltroRelatorio): Record<string, string> {
  if (typeof f === 'number') return { de: toInputDate(Date.now() - (f - 1) * DIA_MS) }
  return semIndefinidos({
    de: f?.de !== undefined ? toInputDate(f.de) : undefined,
    ate: f?.ate !== undefined ? toInputDate(f.ate) : undefined,
    unidadeId: f?.unidadeId,
    categoria: f?.categoria,
    meio: f?.meio,
  }) as Record<string, string>
}
