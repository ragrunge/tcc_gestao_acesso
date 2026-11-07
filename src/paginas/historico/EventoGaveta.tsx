import { useApi } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { Button } from '@/componentes/Button'
import { Gaveta } from '@/componentes/Modal'
import { useToast } from '@/componentes/Toast'
import type { EventoView } from '@/domain/types'
import { fmtDataHora } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'
import { baixarArquivo } from './download'
import { useCorrecoesDe, useIntegridadeTrilha } from './consultas'
import { ValoresCorrigidos, ValoresOriginais } from './gaveta/BlocosCorrecao'
import { CabecalhoEvento } from './gaveta/CabecalhoEvento'
import { CorrecaoEvento } from './gaveta/CorrecaoEvento'
import { DadosEvento, NotasEvento } from './gaveta/DadosEvento'
import { DetalhesTecnicos } from './gaveta/DetalhesTecnicos'
import { LinhaDoTempo } from './gaveta/LinhaDoTempo'
import { montarPassos } from './gaveta/regras'
import { SeloIntegridade } from './gaveta/SeloIntegridade'

/** Gaveta de detalhe do evento (prototipo: painel lateral de 560px com integridade e linha do tempo). */
export function EventoGaveta({
  ev,
  onClose,
  onCorrigido,
}: {
  ev: EventoView
  onClose: () => void
  onCorrigido?: () => void
}) {
  const api = useApi()
  const { avisar } = useToast()
  const podeCorrigir = useCan('evento.corrigir')
  const podeExportar = useCan('auditoria.exportar')
  const podeSaida = useCan('evento.registrar')
  const integ = useIntegridadeTrilha()
  const correcoes = useCorrecoesDe(ev)
  // Selo por registro: íntegro se a cadeia está válida ou se o primeiro registro inválido vem depois dele
  const r = integ.data
  const ok = r ? r.valido || (r.primeiroSeqInvalido ?? 0) > ev.seq : null
  const passos = montarPassos(ev, correcoes.data)

  // RF-32: arquivo verificável só com este evento (manifesto + evento + resumo)
  async function exportarEvento() {
    try {
      const p = await api.auditoria.exportar({ eventoId: ev.id })
      baixarArquivo(p.nomeArquivo, p.conteudo)
      avisar({ titulo: 'Evento exportado', texto: `${ev.codigo} com hashes em ${p.nomeArquivo}.` })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  return (
    <Gaveta titulo={`Evento ${ev.codigo}`} onClose={onClose}>
      <CabecalhoEvento ev={ev} onClose={onClose} />

      <SeloIntegridade ok={ok} />

      {ev.retroativo && (
        <div className="rounded-lg border border-[#A9D2D8] bg-[#E3F0F2] px-3 py-[10px] text-[14px] text-[#0B4450]">
          <strong>Retroativo.</strong> Hora real {fmtDataHora(ev.ocorridoEm)} · lançado às{' '}
          {fmtDataHora(ev.registradoEm)}. Lançado por contingência.
        </div>
      )}

      <DadosEvento ev={ev} podeSaida={podeSaida} />

      <ValoresOriginais ev={ev} />
      <ValoresCorrigidos ev={ev} />
      <NotasEvento ev={ev} />

      <LinhaDoTempo passos={passos} ocorridoEm={ev.ocorridoEm} />

      {podeCorrigir && ev.tipo !== 'correcao' && (
        <CorrecaoEvento ev={ev} onClose={onClose} onCorrigido={onCorrigido} />
      )}

      {podeExportar && (
        <Button pequeno className="self-start" onClick={() => void exportarEvento()}>
          Exportar este evento
        </Button>
      )}

      {podeCorrigir && (
        <p className="border-t border-[#E6EAED] pt-2 text-[13px] text-[#56616B]">
          Registros de acesso não podem ser editados ou excluídos. Correções são feitas por novo
          registro com justificativa.
        </p>
      )}

      <DetalhesTecnicos ev={ev} />
    </Gaveta>
  )
}
