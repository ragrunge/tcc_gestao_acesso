import { Ban, Check, TriangleAlert } from 'lucide-react'
import type { ResultadoIntegridade } from '@/domain/hashChain'
import { Badge } from '@/componentes/Badge'
import { ROTULO_MEIO_CURTO, type EventoView } from '@/domain/types'
import { fmtHora } from '@/domain/time'
import { textoAutorizacao } from '@/paginas/common/evento'

/** Autorização em texto ("Interfone · Ana Ribeiro"); exceção e entrada sem solicitante mantêm o selo âmbar, que é alerta. */
export function Autorizacao({ ev }: { ev: EventoView }) {
  const alerta =
    ev.tipo === 'entrada' &&
    (ev.autorizadoPorTipo === 'excecao_porteiro' || ev.autorizacaoSemSolicitante)
  const texto =
    ev.tipo === 'entrada' && ev.autorizadoPorTipo && !alerta && ev.autorizadoPorTipo !== 'escala'
      ? `${ROTULO_MEIO_CURTO[ev.autorizadoPorTipo]} · ${textoAutorizacao(ev)}`
      : ev.tipo === 'saida' && ev.entradaCodigo
        ? `Saída registrada · entrada ${ev.entradaCodigo}`
        : textoAutorizacao(ev)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {alerta && (
        <Badge tom="ambar" icone={TriangleAlert}>
          {ev.autorizadoPorTipo === 'excecao_porteiro' ? 'Exceção' : 'Sem solicitante'}
        </Badge>
      )}
      <span className="min-w-0 text-[14px] [overflow-wrap:anywhere]">{texto}</span>
      {/* Quebra linha dentro da coluna em vez de invadir "Registrado por" */}
      {ev.retroativo && (
        <Badge tom="petroleo" tamanho="sm" className="!h-auto max-w-full !whitespace-normal py-0.5">
          Retroativo · Hora real {fmtHora(ev.ocorridoEm)} · lançado às {fmtHora(ev.registradoEm)}
        </Badge>
      )}
    </span>
  )
}

/**
 * Coluna Integridade: só diz "Verificado" depois de rodar a verificação, e só até onde ela chegou. Antes disso não
 * há resultado por registro (a API verifica a cadeia inteira, sob demanda), então a célula fica vazia.
 */
export function Integridade({ seq, integ }: { seq: number; integ: ResultadoIntegridade | null }) {
  if (!integ)
    return (
      <span className="text-[#8A97A0]" title="Use Verificar integridade da trilha">
        —<span className="sr-only">Não verificado</span>
      </span>
    )
  if (!integ.valido && seq === integ.primeiroSeqInvalido)
    return (
      <Badge tom="vermelho" tamanho="sm" icone={Ban}>
        Adulterado
      </Badge>
    )
  // Depois do primeiro registro quebrado a verificação para; registrado depois dela, ainda não foi conferido. Cadeia que
  // não bate com o selo (recalculada inteira) não tem primeiro inválido: nenhum registro pode ser dado como verificado.
  const ok = integ.valido
    ? seq <= integ.ultimoSeq
    : integ.primeiroSeqInvalido !== undefined && seq < integ.primeiroSeqInvalido
  return ok ? (
    <Badge tom="verde" tamanho="sm" icone={Check}>
      Verificado
    </Badge>
  ) : (
    <span className="text-[13px] text-[#56616B]">Não conferido</span>
  )
}
