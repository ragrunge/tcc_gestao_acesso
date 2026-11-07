import type { Api, ResumoUnidades, UnidadeDetalhe, UnidadeResumo } from '@/api/types'
import type { Unidade, Veiculo } from '@/domain/types'
import { encomendasDaUnidade, eventoDe, unidadeDe, veiculoDe } from './conversores'
import {
  type Rpc,
  contagens,
  lista,
  paginaDe,
  respostaInvalida,
  semIndefinidos,
  todas,
} from './rpc'

export function criarUnidades(rpc: Rpc): Pick<Api, 'unidades' | 'veiculos'> {
  const unidadesPagina = async (
    f: { bloco?: string; cursor?: string | null; limite?: number } = {},
  ) =>
    paginaDe<UnidadeResumo>(
      await rpc('unidades_listar', {
        p: semIndefinidos({
          limite: f.limite ?? 50,
          bloco: f.bloco,
          cursor: f.cursor ?? undefined,
        }),
      }),
    )

  return {
    unidades: {
      async listar() {
        return todas(
          (cursor) => unidadesPagina({ limite: 100, cursor }),
          'A lista de unidades tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      listarPagina: (f = {}) => unidadesPagina(f),
      async resumo(): Promise<ResumoUnidades> {
        return contagens(await rpc('unidades_resumo'), [
          'total',
          'ativas',
          'inativas',
          'ocupadas',
          'alugadas',
          'vazias',
          'cadastroCompleto',
          'veiculosAtivos',
        ] as const)
      },
      async detalhe(ref) {
        const d = await rpc<UnidadeDetalhe>('unidade_detalhe', { p_ref: ref })
        if (!d?.unidade || !Array.isArray(d.veiculos)) throw respostaInvalida()
        return {
          unidade: unidadeDe(d.unidade),
          veiculos: d.veiculos.map(veiculoDe),
          vinculos: lista(d.vinculos),
          autorizacoes: lista(d.autorizacoes),
          restricoes: lista(d.restricoes),
          eventos: lista(d.eventos, eventoDe),
          encomendas: encomendasDaUnidade(d.encomendas),
        }
      },
      async criar(i) {
        return unidadeDe(
          await rpc<Unidade>('unidade_criar', { p: { bloco: i.bloco, numero: i.numero } }),
        )
      },
      async editar(i) {
        return unidadeDe(
          await rpc<Unidade>('unidade_editar', {
            p_id: i.id,
            p: { bloco: i.bloco, numero: i.numero },
          }),
        )
      },
      async desativar(id) {
        return unidadeDe(await rpc<Unidade>('unidade_desativar', { p_id: id }))
      },
      async reativar(id) {
        return unidadeDe(await rpc<Unidade>('unidade_reativar', { p_id: id }))
      },
    },
    veiculos: {
      async criar(i) {
        return veiculoDe(
          await rpc<Veiculo>('veiculo_criar', {
            p: { unidadeId: i.unidadeId, placa: i.placa, modelo: i.modelo, cor: i.cor },
          }),
        )
      },
      async editar({ id, ...resto }) {
        return veiculoDe(
          await rpc<Veiculo>('veiculo_editar', { p_id: id, p: semIndefinidos(resto) }),
        )
      },
    },
  }
}
