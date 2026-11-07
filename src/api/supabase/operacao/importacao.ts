import { type Api, ApiError, type LinhaPlanilha, type RelatorioImportacao } from '@/api/types'
import { type Rpc, respostaInvalida } from '../portaria'

export function criarImportacao(rpc: Rpc): Pick<Api, 'importacao'> {
  // As linhas da planilha (com CPF) só nesta aba, entre analisar e confirmar (o banco guarda só a impressão HMAC).
  const linhasImportacao = new Map<string, LinhaPlanilha[]>()

  return {
    importacao: {
      async analisar({ arquivo, linhas }) {
        const r = await rpc<RelatorioImportacao>('importacao_analisar', { p: { arquivo, linhas } })
        if (
          !r ||
          typeof r.id !== 'string' ||
          !Array.isArray(r.inconsistencias) ||
          typeof r.prazoRegularizacao !== 'number'
        )
          throw respostaInvalida()
        linhasImportacao.set(r.id, linhas)
        return { ...r, amostra: Array.isArray(r.amostra) ? r.amostra : [] }
      },
      async confirmar(id) {
        const linhas = linhasImportacao.get(id)
        if (!linhas)
          throw new ApiError(
            404,
            'IMPORTACAO_NAO_ENCONTRADA',
            'Análise de importação não encontrada. Envie o arquivo novamente.',
          )
        const r = await rpc<{
          importados: number
          reaproveitados: number
          prazoRegularizacao: number
        }>('importacao_confirmar', { p_id: id, p: { linhas } })
        if (typeof r?.importados !== 'number' || typeof r.prazoRegularizacao !== 'number')
          throw respostaInvalida()
        linhasImportacao.delete(id)
        return r
      },
    },
  }
}
