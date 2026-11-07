import {
  type Api,
  ApiError,
  type FiltroEventosPagina,
  type PaginaEventos,
  type RestricaoView,
} from '@/api/types'
import type { EventoView, PermanenciaView, VeiculoAcesso } from '@/domain/types'
import { TIPOS_EVENTO, eventoDe, filtroEventos } from './conversores'
import {
  type Rpc,
  contagens,
  lista,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from './rpc'

export function criarEventos(rpc: Rpc): Pick<Api, 'eventos'> {
  const eventosPagina = async (f: FiltroEventosPagina = {}): Promise<PaginaEventos> => {
    const r = await rpc<{ porTipo?: unknown }>('eventos_listar', {
      p: { ...filtroEventos(f), ...posicao(f) },
    })
    const pagina = paginaDe<EventoView>(r, eventoDe)
    return r?.porTipo ? { ...pagina, porTipo: contagens(r.porTipo, TIPOS_EVENTO) } : pagina
  }

  return {
    eventos: {
      async criar(i) {
        const r = await rpc<{
          resultado: string
          evento: EventoView
          restricoes?: RestricaoView[]
          mensagem?: string
        }>('evento_entrada', {
          p: semIndefinidos({
            pessoaId: i.pessoaId,
            unidadeDestinoId: i.unidadeDestinoId,
            areaComumId: i.areaComumId ?? undefined,
            autorizadoPorTipo: i.autorizadoPorTipo ?? null,
            autorizadoPorPessoaId: i.autorizadoPorPessoaId ?? undefined,
            autorizacaoPreviaId: i.autorizacaoPreviaId ?? undefined,
            justificativa: i.justificativa ?? undefined,
            retroativo: i.retroativo || undefined,
            ocorridoEm: i.retroativo && i.ocorridoEm ? Math.trunc(i.ocorridoEm) : undefined,
            observacao: i.observacao ?? undefined,
            formularioContingencia: i.retroativo
              ? (i.formularioContingencia ?? undefined)
              : undefined,
            tipoVisita: i.tipoVisita ?? undefined,
            veiculo: i.veiculo
              ? {
                  placa: i.veiculo.placa,
                  modelo: i.veiculo.modelo?.trim() || undefined,
                  cor: i.veiculo.cor?.trim() || undefined,
                }
              : undefined,
          }),
        })
        if (!r || !r.evento) throw respostaInvalida()
        // O negado é GRAVADO e a RPC responde sucesso (um RAISE o desfaria); a tela espera o 422 de sempre.
        if (r.resultado === 'negado') {
          const v = eventoDe(r.evento)
          throw new ApiError(
            422,
            'PESSOA_EM_RESTRICAO',
            r.mensagem ?? 'Entrada não permitida: pessoa com restrição.',
            {
              eventoId: v.id,
              codigo: v.codigo,
              restricoes: r.restricoes ?? [],
            },
          )
        }
        if (r.resultado !== 'entrada') throw respostaInvalida()
        return eventoDe(r.evento)
      },
      async registrarRecusa(i) {
        return eventoDe(
          await rpc<EventoView>('evento_recusa', {
            p: semIndefinidos({
              pessoaId: i.pessoaId,
              unidadeDestinoId: i.unidadeDestinoId,
              meio: i.meio,
              moradorPessoaId: i.moradorPessoaId,
              observacao: i.observacao ?? undefined,
              retroativo: i.retroativo || undefined,
              ocorridoEm: i.retroativo && i.ocorridoEm ? Math.trunc(i.ocorridoEm) : undefined,
              formularioContingencia: i.retroativo
                ? (i.formularioContingencia ?? undefined)
                : undefined,
            }),
          }),
        )
      },
      async registrarSaida(entradaId, o = {}) {
        return eventoDe(
          await rpc<EventoView>('evento_saida', {
            p_entrada: entradaId,
            p: semIndefinidos({
              observacao: o.observacao?.trim() || undefined,
              retroativo: o.retroativo || undefined,
              ocorridoEm: o.retroativo && o.ocorridoEm ? Math.trunc(o.ocorridoEm) : undefined,
              formularioContingencia: o.retroativo
                ? (o.formularioContingencia ?? undefined)
                : undefined,
            }),
          }),
        )
      },
      async corrigir(id, i) {
        const v = i.valores
        const valores = v
          ? semIndefinidos({
              unidadeDestinoId: v.unidadeDestinoId,
              ocorridoEm: v.ocorridoEm !== undefined ? Math.trunc(v.ocorridoEm) : undefined,
              pessoaId: v.pessoaId,
              autorizadoPorPessoaId: v.autorizadoPorPessoaId,
            })
          : undefined
        return eventoDe(
          await rpc<EventoView>('evento_corrigir', {
            p_evento: id,
            p: semIndefinidos({
              justificativa: i.justificativa,
              observacao: i.observacao?.trim() || undefined,
              valores: valores && Object.keys(valores).length ? valores : undefined,
            }),
          }),
        )
      },
      listarPagina: eventosPagina,
      async listar(f = {}) {
        return todas(
          (cursor) => eventosPagina({ ...f, limite: 100, cursor }),
          'A listagem tem mais páginas do que esta tela consegue mostrar. Use filtros.',
        )
      },
      async correcoesDe(id) {
        return lista(await rpc<EventoView[]>('evento_correcoes', { p_id: id }), eventoDe)
      },
      async obter(id) {
        return eventoDe(await rpc<EventoView>('evento_obter', { p_id: id }))
      },
      async presentes() {
        return lista(await rpc<EventoView[]>('eventos_presentes'), eventoDe)
      },
      async prorrogarPermanencia(entradaId) {
        const p = await rpc<PermanenciaView & { eventoId: string }>('evento_prorrogar', {
          p_entrada: entradaId,
        })
        if (!p || typeof p.prazoAte !== 'number' || typeof p.prorrogacoes !== 'number')
          throw respostaInvalida()
        return p
      },
      async ultimoVeiculo(pessoaId) {
        const v = await rpc<VeiculoAcesso | null>('evento_ultimo_veiculo', { p_pessoa: pessoaId })
        return v && typeof v.placa === 'string' ? v : null
      },
    },
  }
}
