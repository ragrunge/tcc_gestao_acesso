import { ROTULO_CATEGORIA, ROTULO_TIPO_VISITA, type EventoView } from '@/domain/types'
import { descreverVeiculo } from '@/paginas/common/evento'
import { destinoDe } from '../saida'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_DIGITOS_CPF = 3

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const compacto = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

/** Termo só de dígitos e separadores de CPF ("123", "123.45", "123.45*.***-**", o antigo "***.456.789-**"). */
export function digitosCpf(q: string): string | null {
  if (!/^[\d.\-*\s]+$/.test(q.trim())) return null
  const d = q.replace(/\D/g, '')
  return d.length >= MIN_DIGITOS_CPF ? d : null
}

/** Filtro local: todas as palavras precisam aparecer (nome, categoria, tipo de visita, destino, empresa, serviço). */
export function casaPresente(e: EventoView, q: string): boolean {
  const termo = norm(q).trim()
  if (!termo) return true
  const destino = destinoDe(e)
  const texto = norm(
    [
      e.pessoaNome,
      ROTULO_CATEGORIA[e.categoriaPessoa],
      e.permanencia ? ROTULO_TIPO_VISITA[e.permanencia.tipoVisita] : '',
      destino,
      e.areaComumNome ?? '',
      e.empresa ?? '',
      e.servico ?? '',
      // placa como gravada (ABC1D23) e como exibida (ABC-1D23)
      e.veiculo ? `${e.veiculo.placa} ${descreverVeiculo(e.veiculo)}` : '',
    ].join(' '),
  )
  if (compacto(termo) && compacto(destino) === compacto(termo)) return true // "d32", "D 32"
  return termo.split(/\s+/).every((t) => texto.includes(t))
}
