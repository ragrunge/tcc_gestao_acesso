import type { Api, FiltroOcorrencias, OcorrenciaView, ResumoOcorrencias } from '@/api/types'
import type { Ocorrencia } from '@/domain/types'
import {
  type Rpc,
  contagem,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from '../portaria'
import { ocorrenciaDe } from './conversores'

export function criarOcorrencias(
  rpc: Rpc,
  anexos: Pick<Api['ocorrencias'], 'anexar' | 'baixarAnexo'>,
): Pick<Api, 'ocorrencias'> {
  const ocorrenciasPagina = async (f: FiltroOcorrencias = {}) =>
    paginaDe<OcorrenciaView>(
      await rpc('ocorrencias_listar', {
        p: semIndefinidos({
          ...posicao(f),
          status: f.status?.length ? f.status : undefined,
          tipo: f.tipo,
          unidadeId: f.unidadeId,
        }),
      }),
      ocorrenciaDe,
    )

  return {
    ocorrencias: {
      async listar() {
        return todas(
          (cursor) => ocorrenciasPagina({ limite: 100, cursor }),
          'A lista de ocorrências tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      listarPagina: ocorrenciasPagina,
      async resumo(): Promise<ResumoOcorrencias> {
        const r = await rpc<Record<string, unknown>>('ocorrencias_resumo')
        if (!r) throw respostaInvalida()
        return {
          total: contagem(r.total),
          aberta: contagem(r.aberta),
          emAndamento: contagem(r.emAndamento),
          encerrada: contagem(r.encerrada),
        }
      },
      async obter(id) {
        return ocorrenciaDe(await rpc<OcorrenciaView>('ocorrencia_obter', { p_id: id }))
      },
      // Os anexos não vão aqui: a tela envia cada arquivo por `anexar` depois de criar (Edge anexos, anexos.ts).
      async criar(i) {
        return ocorrenciaDe(
          await rpc<OcorrenciaView>('ocorrencia_criar', {
            p: {
              tipo: i.tipo,
              descricao: i.descricao,
              unidadeId: i.unidadeId,
              envolvidos: i.envolvidos ?? '',
              eventoIds: i.eventoIds ?? [],
            },
          }),
        ) as Ocorrencia
      },
      async alterarStatus(id, status) {
        return ocorrenciaDe(
          await rpc<OcorrenciaView>('ocorrencia_alterar_status', { p_id: id, p_status: status }),
        ) as Ocorrencia
      },
      async vincularEventos(id, eventoIds) {
        return ocorrenciaDe(
          await rpc<OcorrenciaView>('ocorrencia_vincular_eventos', { p_id: id, p: { eventoIds } }),
        )
      },
      ...anexos,
    },
  }
}
