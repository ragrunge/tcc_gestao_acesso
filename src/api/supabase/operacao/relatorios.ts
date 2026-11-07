import type { Api, FiltroRelatorio, RelatorioResumo } from '@/api/types'
import { csvRelatorio } from '@/domain/relatorio'
import { toInputDate } from '@/domain/time'
import { type Rpc, respostaInvalida } from '../portaria'
import { filtroRelatorio } from './conversores'

export function criarRelatorios(rpc: Rpc): Pick<Api, 'relatorios'> {
  const resumoRelatorio = async (f?: number | FiltroRelatorio) => {
    const r = await rpc<RelatorioResumo & { filtroUnidadeCodigo?: string | null }>(
      'relatorio_resumo',
      { p: filtroRelatorio(f) },
    )
    if (!r?.periodo || !Array.isArray(r.acessosPorDia) || !r.totais) throw respostaInvalida()
    const { filtroUnidadeCodigo, ...resumo } = r
    return { resumo: resumo as RelatorioResumo, codigoUnidade: filtroUnidadeCodigo ?? undefined }
  }

  return {
    relatorios: {
      async resumo(f) {
        return (await resumoRelatorio(f)).resumo
      },
      async exportarCsv(f) {
        const { resumo, codigoUnidade } = await resumoRelatorio(f)
        return csvRelatorio(
          resumo,
          { unidade: codigoUnidade, categoria: f?.categoria, meio: f?.meio },
          toInputDate(Date.now()),
        )
      },
    },
  }
}
