import type { EventoView } from '@/domain/types'

export type PassoLinhaTempo = { quando: number; texto: string }

const SEIS_HORAS = 6 * 3600 * 1000

/** Linha do tempo: entrada, saída, correções e retroativo. */
export function montarPassos(
  ev: EventoView,
  correcoes: EventoView[] | undefined,
): PassoLinhaTempo[] {
  const passos: PassoLinhaTempo[] = []
  if (ev.retroativo)
    passos.push({
      quando: ev.ocorridoEm,
      texto: `Acesso real (${ev.tipo}), anotado no formulário de contingência`,
    })
  else
    passos.push({
      quando: ev.ocorridoEm,
      texto:
        ev.tipo === 'entrada'
          ? 'Entrada registrada'
          : ev.tipo === 'saida'
            ? 'Saída registrada'
            : ev.tipo === 'negado'
              ? 'Entrada negada por restrição'
              : ev.tipo === 'recusado'
                ? 'Visita recusada pelo morador'
                : 'Correção registrada',
    })
  if (ev.retroativo)
    passos.push({ quando: ev.registradoEm, texto: 'Lançamento retroativo gravado na trilha' })
  if (ev.saida) passos.push({ quando: ev.saida.em, texto: 'Saída registrada' })
  for (const c of correcoes ?? [])
    passos.push({
      quando: c.ocorridoEm,
      texto: `Correção por ${c.operadorNome}: ${c.justificativa} (${c.codigo})`,
    })
  if (ev.entradaCodigo)
    passos.push({ quando: ev.ocorridoEm, texto: `Vinculado à entrada ${ev.entradaCodigo}` })
  passos.sort((a, b) => a.quando - b.quando)
  return passos
}

export function longeDoEvento(quando: number, ocorridoEm: number): boolean {
  return quando - ocorridoEm > SEIS_HORAS || ocorridoEm - quando > SEIS_HORAS
}
