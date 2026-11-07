import type { EventoView, ValoresCorrecao } from '@/domain/types'
import { fmtDataHora } from '@/domain/time'

export const ROTULO_CAMPO: Record<keyof ValoresCorrecao, string> = {
  unidadeDestinoId: 'Unidade',
  ocorridoEm: 'Data e hora',
  pessoaId: 'Pessoa',
  autorizadoPorPessoaId: 'Autorizado por',
}

export function formatarValor(
  campo: keyof ValoresCorrecao,
  v: unknown,
  codigo: (id: string) => string,
): string {
  if (v === null || v === undefined || v === '') return '—'
  if (campo === 'ocorridoEm') return fmtDataHora(Number(v))
  if (campo === 'unidadeDestinoId') return codigo(String(v))
  return String(v)
}

/** [campo, original, corrigido] para os campos que a última correção substituiu. Nomes vêm resolvidos pela view. */
export function linhasCorrecao(
  ev: EventoView,
  codigo: (id: string) => string,
): [string, string, string][] {
  const orig = ev.valoresOriginais ?? {}
  return (Object.keys(orig) as (keyof ValoresCorrecao)[]).map((k) => [
    ROTULO_CAMPO[k],
    k === 'pessoaId'
      ? (ev.pessoaNomeOriginal ?? String(orig[k]))
      : k === 'autorizadoPorPessoaId'
        ? (ev.autorizadoPorNomeOriginal ?? '—')
        : formatarValor(k, orig[k], codigo),
    k === 'pessoaId'
      ? ev.pessoaNome
      : k === 'autorizadoPorPessoaId'
        ? (ev.autorizadoPorNome ?? '—')
        : formatarValor(k, ev[k], codigo),
  ])
}
