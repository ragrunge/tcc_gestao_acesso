import type { Api, EncomendaView, FiltroEncomendas } from '@/api/types'
import type { AutorizacaoRetirada, Encomenda } from '@/domain/types'
import { type Rpc, paginaDe, posicao, respostaInvalida, semIndefinidos, todas } from '../portaria'
import { encomendaDe } from './conversores'

export function criarEncomendas(rpc: Rpc): Pick<Api, 'encomendas'> {
  const encomendasPagina = async (f: FiltroEncomendas = {}) =>
    paginaDe<EncomendaView>(
      await rpc('encomendas_listar', {
        p: semIndefinidos({
          ...posicao(f),
          status: f.status,
          unidadeId: f.unidadeId,
          atrasadasDias: f.atrasadasDias,
        }),
      }),
      encomendaDe,
    )

  return {
    encomendas: {
      async listar(f) {
        return todas(
          (cursor) => encomendasPagina({ status: f?.status, limite: 100, cursor }),
          'A lista de encomendas tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      listarPagina: encomendasPagina,
      async resumo(dias) {
        const r = await rpc<{
          aguardando: number
          atrasadas: number
          entregues: number
          diasAtraso: number
        }>('encomendas_resumo', dias !== undefined ? { p_dias: dias } : {})
        if (typeof r?.aguardando !== 'number' || typeof r.atrasadas !== 'number')
          throw respostaInvalida()
        return r
      },
      async obter(id) {
        return encomendaDe(await rpc<EncomendaView>('encomenda_obter', { p_id: id }))
      },
      async receber(i) {
        return encomendaDe(
          await rpc<EncomendaView>('encomenda_receber', {
            p: {
              unidadeId: i.unidadeId,
              destinatario: i.destinatario,
              transportadora: i.transportadora,
              codigoRastreio: i.codigoRastreio,
              unidadeConfirmada: i.unidadeConfirmada,
            },
          }),
        ) as Encomenda
      },
      async entregar(i) {
        return encomendaDe(
          await rpc<EncomendaView>('encomenda_entregar', { p_id: i.id, p_pessoa: i.pessoaId }),
        ) as Encomenda
      },
      async autorizarRetirada(i) {
        const a = await rpc<AutorizacaoRetirada>('encomenda_autorizar_retirada', {
          p_id: i.encomendaId,
          p: { pessoaId: i.pessoaId, solicitadaPorPessoaId: i.solicitadaPorPessoaId },
        })
        if (!a || typeof a.id !== 'string') throw respostaInvalida()
        return a
      },
    },
  }
}
