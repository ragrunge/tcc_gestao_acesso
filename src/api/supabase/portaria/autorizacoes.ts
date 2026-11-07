import type {
  Api,
  AutorizacaoView,
  PrevistoView,
  RestricaoView,
  ResultadoRestricao,
  ResumoTurno,
} from '@/api/types'
import type { AutorizacaoPrevia, Restricao } from '@/domain/types'
import { dia } from './conversores'
import { type Rpc, lista, respostaInvalida, semIndefinidos } from './rpc'

export function criarAutorizacoes(rpc: Rpc): Pick<Api, 'autorizacoes' | 'restricoes'> {
  return {
    autorizacoes: {
      async criar(i) {
        return rpc<AutorizacaoPrevia>('autorizacao_criar', {
          p: semIndefinidos({
            unidadeId: i.unidadeId,
            areaComumId: i.areaComumId ?? undefined,
            pessoaId: i.pessoaId,
            validaDe: i.validaDe !== undefined ? dia(i.validaDe) : undefined,
            validaAte: dia(i.validaAte),
            diasSemana: i.diasSemana,
            horaInicio: i.horaInicio,
            horaFim: i.horaFim,
            solicitadaPorPessoaId: i.solicitadaPorPessoaId,
            justificativa: i.justificativa ?? undefined,
          }),
        })
      },
      async revogar(id) {
        await rpc('autorizacao_revogar', { p_id: id })
      },
      async vigentes(pessoaId, destinoId, o) {
        return lista(
          await rpc<AutorizacaoView[]>('autorizacoes_vigentes', {
            p_pessoa: pessoaId,
            p_destino: destinoId,
            p_area_comum: !!o?.areaComum,
          }),
        )
      },
      async hoje() {
        return lista(await rpc<AutorizacaoView[]>('autorizacoes_hoje'))
      },
      async previstas(horas) {
        return lista(await rpc<PrevistoView[]>('autorizacoes_previstas', { p_horas: horas }))
      },
    },
    restricoes: {
      async verificar(pessoaId, unidadeId) {
        const r = await rpc<ResultadoRestricao>('restricao_verificar', {
          p_pessoa: pessoaId,
          p_unidade: unidadeId,
        })
        if (!r || typeof r.restrita !== 'boolean' || !Array.isArray(r.alertas))
          throw respostaInvalida()
        return r
      },
      async criar(i) {
        return rpc<Restricao>('restricao_criar', {
          p: semIndefinidos({
            pessoaId: i.pessoaId,
            unidadeId: i.unidadeId,
            motivo: i.motivo,
            validaAte: dia(i.validaAte),
            solicitadaPorPessoaId: i.solicitadaPorPessoaId,
            paraTodoCondominio: i.paraTodoCondominio || undefined,
          }),
        })
      },
      async aprovar(id) {
        return rpc<Restricao>('restricao_aprovar', { p_id: id })
      },
      async revogar(id) {
        await rpc('restricao_revogar', { p_id: id })
      },
      async pendentes() {
        return lista(await rpc<RestricaoView[]>('restricoes_pendentes'))
      },
    },
  }
}

export function criarTurno(rpc: Rpc): Pick<Api, 'turno'> {
  return {
    turno: {
      async resumo() {
        const r = await rpc<ResumoTurno>('turno_resumo')
        if (typeof r?.pessoasDentro !== 'number') throw respostaInvalida()
        return r
      },
    },
  }
}
