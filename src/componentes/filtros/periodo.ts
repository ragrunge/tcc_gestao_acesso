import { DIA, agora, toInputDate } from '@/domain/time'
import { dataOk, naUrl, useFiltrosUrl } from './url'

/** "Últimos N dias", contando hoje (1 = hoje). Datas no formato do input date. */
export function ultimosDias(n: number) {
  return { de: toInputDate(agora() - (n - 1) * DIA), ate: toInputDate(agora()) }
}

/** Período nos parâmetros `de` e `ate`. Vazio é válido (sem limite) e vai como parâmetro vazio. */
export function usePeriodoUrl(diasPadrao: number) {
  const { params, gravar } = useFiltrosUrl()
  const padrao = ultimosDias(diasPadrao)
  const ler = (k: 'de' | 'ate') => {
    const v = params.get(k)
    return v === null ? padrao[k] : v === '' ? '' : dataOk(v) ? v : padrao[k]
  }
  const de = ler('de')
  const ate = ler('ate')
  const alterar = (novoDe: string, novoAte: string) =>
    gravar({ de: naUrl(novoDe, padrao.de), ate: naUrl(novoAte, padrao.ate) })
  return {
    de,
    ate,
    alterar,
    ativo: de !== padrao.de || ate !== padrao.ate,
    limpar: () => gravar({ de: undefined, ate: undefined }),
  }
}
