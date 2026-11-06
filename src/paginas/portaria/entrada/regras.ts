import type { AutorizacaoView, PessoaBusca } from '@/api'
import { justificativaValida, meioComMorador, MIN_JUSTIFICATIVA } from '@/domain/rules'
import type { MeioAutorizacao } from '@/domain/types'

export function textoAutorizadoPor({
  meio,
  nomeUsuario,
  previaValida,
  residente,
}: {
  meio: MeioAutorizacao | null
  nomeUsuario: string
  previaValida: AutorizacaoView | undefined
  residente: string | undefined
}): string {
  return !meio
    ? '—'
    : meio === 'excecao_porteiro'
      ? `${nomeUsuario} (exceção do porteiro)`
      : meio === 'escala'
        ? 'Escala do condomínio'
        : meio === 'autorizacao_previa'
          ? previaValida
            ? ((previaValida.areaComumId
                ? `Área comum — cadastrada por ${previaValida.cadastradaPorNome}`
                : previaValida.semSolicitante
                  ? `Sem solicitante — cadastrada por ${previaValida.cadastradaPorNome}`
                  : previaValida.solicitadaPorNome) ?? '—')
            : '—'
          : (residente ?? '—')
}

export function listarFaltas({
  pessoa,
  propriaUnidade,
  emArea,
  areaAtual,
  unidadeAtual,
  carregandoUnidade,
  meio,
  residenteId,
  justificativa,
  retroativo,
  horaReal,
  retroValido,
  formulario,
  veiculoOk,
  pronto,
  enviando,
  restricao,
}: {
  pessoa: PessoaBusca | null
  propriaUnidade: boolean
  emArea: boolean
  areaAtual: string | null
  unidadeAtual: string | null
  carregandoUnidade: boolean
  meio: MeioAutorizacao | null
  residenteId: string | null
  justificativa: string
  retroativo: boolean
  horaReal: string
  retroValido: boolean
  formulario: string
  veiculoOk: boolean
  pronto: boolean
  enviando: boolean
  restricao: unknown
}): string[] {
  const faltas: string[] = []
  if (!pessoa) faltas.push('pessoa')
  else {
    if (propriaUnidade)
      faltas.push('outra unidade de destino (morador não registra entrada na própria)')
    else if (emArea && !areaAtual) faltas.push('área comum')
    else if (!emArea && !unidadeAtual && pessoa.categoria !== 'funcionario') faltas.push('unidade')
    else if (carregandoUnidade) faltas.push('verificação da unidade')
    if (
      !meio &&
      !carregandoUnidade &&
      (unidadeAtual || areaAtual || pessoa.categoria === 'funcionario')
    )
      faltas.push('quem autorizou')
    else if (meioComMorador(meio) && !residenteId) faltas.push('morador que autorizou')
    else if (meio === 'excecao_porteiro' && !justificativaValida(justificativa))
      faltas.push(`justificativa (mín. ${MIN_JUSTIFICATIVA} caracteres)`)
  }
  if (retroativo) {
    if (!horaReal) faltas.push('hora real do acesso')
    else if (!retroValido) faltas.push('hora real anterior ao momento atual')
    if (!formulario.trim()) faltas.push('nº do formulário de papel')
  }
  if (pessoa && !veiculoOk)
    faltas.push('placa do veículo (padrão antigo ou Mercosul), ou marque “A pé”')
  if (faltas.length === 0 && !pronto && !enviando && !restricao)
    faltas.push('autorização válida para este momento')
  return faltas
}
