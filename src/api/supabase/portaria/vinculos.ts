import type { Api, Autorizador, ResumoVinculos, VinculoView } from '@/api/types'
import type { Pessoa, VinculoUnidade } from '@/domain/types'
import { dia, pessoaDe, vinculoDe } from './conversores'
import {
  type Rpc,
  contagem,
  contagens,
  lista,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from './rpc'

export function criarVinculos(rpc: Rpc): Pick<Api, 'vinculos'> {
  const vinculosPagina = async (
    f: {
      status?: string[]
      unidadeId?: string
      pessoaId?: string
      ordem?: string
      cursor?: string | null
      limite?: number
      deslocamento?: number
    } = {},
  ) =>
    paginaDe<VinculoView>(
      await rpc('vinculos_listar', {
        p: semIndefinidos({
          ...posicao(f),
          status: f.status?.length ? f.status : undefined,
          unidadeId: f.unidadeId,
          pessoaId: f.pessoaId,
          ordem: f.ordem,
        }),
      }),
    )

  return {
    vinculos: {
      async listar(f) {
        return todas(
          (cursor) =>
            vinculosPagina({ limite: 100, cursor, status: f?.status ? [f.status] : undefined }),
          'A lista de vínculos tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      listarPagina: (f = {}) => vinculosPagina(f),
      async contar(status) {
        const n = await rpc<number>('vinculos_contar', { p_status: status })
        if (typeof n !== 'number') throw respostaInvalida()
        return n
      },
      async resumo(): Promise<ResumoVinculos> {
        const r = await rpc<Record<string, unknown>>('vinculos_resumo')
        if (!r) throw respostaInvalida()
        return {
          porStatus: contagens(r.porStatus, [
            'pendente',
            'aprovado',
            'legado',
            'rejeitado',
            'encerrado',
          ] as const),
          legadosVencidos: contagem(r.legadosVencidos),
          validosPorTipo: contagens(r.validosPorTipo, [
            'proprietario',
            'inquilino',
            'dependente',
          ] as const),
          pessoasComVinculoValido: contagem(r.pessoasComVinculoValido),
        }
      },
      async autorizadores(unidadeId) {
        const r = await rpc<{ pessoa: Pessoa; vinculo: VinculoUnidade }[]>(
          'vinculos_autorizadores',
          { p_unidade: unidadeId },
        )
        return lista<{ pessoa: Pessoa; vinculo: VinculoUnidade }>(r).map((a): Autorizador => ({
          pessoa: pessoaDe(a.pessoa),
          vinculo: a.vinculo,
        }))
      },
      // Escrita (F3, 0025). Datas de calendário vão como 'AAAA-MM-DD' (dia BRT); o banco devolve a VinculoView em ms.
      async criar(i) {
        return vinculoDe(
          await rpc<VinculoView>('vinculo_criar', {
            p: {
              pessoaId: i.pessoaId,
              unidadeId: i.unidadeId,
              tipo: i.tipo,
              vigenciaInicio: dia(i.vigenciaInicio),
              vigenciaFim: dia(i.vigenciaFim),
            },
          }),
        )
      },
      async registrarConferencia(id, i) {
        return vinculoDe(
          await rpc<VinculoView>('vinculo_conferir', {
            p_id: id,
            p: semIndefinidos({
              tipo: i.tipo,
              descricao: i.descricao,
              observacao: i.observacao,
              data: i.data !== undefined ? dia(i.data) : undefined,
            }),
          }),
        )
      },
      async decidir({ id, decisao, justificativa }) {
        return vinculoDe(
          decisao === 'aprovar'
            ? await rpc<VinculoView>('vinculo_aprovar', { p_id: id })
            : await rpc<VinculoView>('vinculo_rejeitar', {
                p_id: id,
                p: { justificativa: justificativa ?? '' },
              }),
        )
      },
      async regularizar(id, opcoes) {
        return vinculoDe(
          await rpc<VinculoView>('vinculo_regularizar', {
            p_id: id,
            p: opcoes?.vigenciaFim !== undefined ? { vigenciaFim: dia(opcoes.vigenciaFim) } : {},
          }),
        )
      },
      async encerrar(id, i) {
        return vinculoDe(
          await rpc<VinculoView>('vinculo_encerrar', {
            p_id: id,
            p: semIndefinidos({
              motivo: i.motivo,
              data: i.data !== undefined ? dia(i.data) : undefined,
            }),
          }),
        )
      },
    },
  }
}
