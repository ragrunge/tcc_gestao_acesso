import { hhmmParaMin, minutosDoDia, partes } from '../time'
import type {
  AutorizacaoPrevia,
  CategoriaPessoa,
  Escala,
  Funcionario,
  MeioAutorizacao,
} from '../types'
import { estadoAutorizacaoPrevia } from './autorizacao'
import { type ErroRegra, MIN_JUSTIFICATIVA, justificativaValida } from './comum'
import { e422 } from './interno'

// ----- Meios de autorização -------------------------------------------------------------------

export type Destino = 'unidade' | 'area_comum'

/**
 * Meios em que um morador identificado (com vínculo válido na unidade) autoriza a entrada ou recusa a visita (RN-01,
 * UC02 A4). Mesmo conjunto dos CHECKs evento_morador_identificado_ck e evento_recusa_meio_ck no banco.
 */
export const MEIOS_COM_MORADOR = [
  'interfone',
  'celular',
  'morador_presente',
] as const satisfies readonly MeioAutorizacao[]
export type MeioComMorador = (typeof MEIOS_COM_MORADOR)[number]
export const meioComMorador = (m: MeioAutorizacao | null | undefined): m is MeioComMorador =>
  !!m && (MEIOS_COM_MORADOR as readonly string[]).includes(m)

export function meiosAceitos(
  categoria: CategoriaPessoa,
  destino: Destino = 'unidade',
): MeioAutorizacao[] {
  // RF-36: área comum (só prestador) não tem morador para autorizar: autorização prévia da administração ou exceção.
  if (destino === 'area_comum') return ['autorizacao_previa', 'excecao_porteiro']
  const base: MeioAutorizacao[] = [
    'interfone',
    'celular',
    'morador_presente',
    'autorizacao_previa',
    'excecao_porteiro',
  ]
  // Escala só existe para funcionário do condomínio (correção 5)
  return categoria === 'funcionario' ? [...base, 'escala'] : base
}

/** RF-09: escala válida (mesmos CHECKs de `funcionario`): 1 a 7 dias entre 0 e 6, horas HH:MM diferentes. */
export function validarEscala(e: Escala): string | null {
  if (!Array.isArray(e.diasSemana) || e.diasSemana.length < 1 || e.diasSemana.length > 7)
    return 'Escolha de 1 a 7 dias da semana.'
  if (
    new Set(e.diasSemana).size !== e.diasSemana.length ||
    e.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    return 'Dias da semana inválidos.'
  const hh = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!hh.test(e.horaInicio) || !hh.test(e.horaFim)) return 'Informe início e fim no formato HH:MM.'
  if (e.horaInicio === e.horaFim) return 'O início e o fim da escala devem ser diferentes.'
  return null
}

/**
 * RF-09: escala vigente no instante. Escala que atravessa a meia-noite (ex.: 22:00–06:00) vale no dia do
 * início do turno: a madrugada seguinte ainda pertence ao turno do dia anterior.
 */
export function escalaVigente(f: Funcionario | undefined, agora: number): boolean {
  if (!f || !f.ativo) return false
  const p = partes(agora)
  const m = minutosDoDia(agora)
  const ini = hhmmParaMin(f.escala.horaInicio)
  const fim = hhmmParaMin(f.escala.horaFim)
  if (fim >= ini) return f.escala.diasSemana.includes(p.dow) && m >= ini && m <= fim
  // Atravessa a meia-noite: parte da noite (dia do início) ou parte da madrugada (dia anterior ao atual)
  return (
    (f.escala.diasSemana.includes(p.dow) && m >= ini) ||
    (f.escala.diasSemana.includes((p.dow + 6) % 7) && m <= fim)
  )
}

// ----- Entrada (RN-01, RF-13, RF-17, RN-07) ---------------------------------------------------

export interface DadosAutorizacao {
  categoriaPessoa: CategoriaPessoa
  unidadeDestinoId?: string | null
  /** RF-36: destino área comum (só prestador). */
  areaComumId?: string | null
  autorizadoPorTipo?: MeioAutorizacao | null
  autorizadoPorPessoaId?: string | null
  autorizacaoPreviaId?: string | null
  justificativa?: string | null
  /** Pessoa cadastrada sem CPF: só entra por exceção do porteiro. */
  semCpf?: boolean
}

export interface ContextoAutorizacao {
  /** Instante do acesso (no retroativo, a hora real informada). */
  quando: number
  /** Pessoas com vínculo válido na unidade de destino. */
  moradoresValidosIds: ReadonlySet<string>
  /** Autorizações prévias da pessoa para o destino (unidade ou área comum). */
  autorizacoes: readonly AutorizacaoPrevia[]
  funcionario?: Funcionario
}
/** Valida o autorizador de uma entrada. Retorna null se estiver tudo certo. */
export function validarAutorizacaoEntrada(
  d: DadosAutorizacao,
  ctx: ContextoAutorizacao,
): ErroRegra | null {
  if (d.unidadeDestinoId && d.areaComumId)
    return e422('DESTINO_DUPLO', 'Informe a unidade OU a área comum, não as duas.')
  if (d.areaComumId && d.categoriaPessoa !== 'prestador') {
    return e422(
      'AREA_COMUM_SO_PRESTADOR',
      'Área comum só é destino de prestador de serviço (RF-36).',
    )
  }
  if (d.categoriaPessoa !== 'funcionario' && !d.unidadeDestinoId && !d.areaComumId) {
    return e422('UNIDADE_OBRIGATORIA', 'Informe a unidade de destino.')
  }
  if (d.categoriaPessoa === 'morador') return null
  const tipo = d.autorizadoPorTipo
  if (!tipo) return e422('AUTORIZADO_POR_OBRIGATORIO', 'Informe quem autorizou a entrada (RN-01).')
  if (d.semCpf && tipo !== 'excecao_porteiro') {
    return e422(
      'SEM_CPF_SO_EXCECAO',
      'Pessoa cadastrada sem CPF só pode entrar por exceção do porteiro, com justificativa.',
    )
  }
  if (!meiosAceitos(d.categoriaPessoa, d.areaComumId ? 'area_comum' : 'unidade').includes(tipo)) {
    return e422(
      'MEIO_INVALIDO_PARA_TIPO',
      d.areaComumId
        ? 'Na área comum a entrada é por autorização prévia da administração ou exceção do porteiro.'
        : 'Este meio de autorização não se aplica ao tipo de pessoa.',
    )
  }
  switch (tipo) {
    case 'interfone':
    case 'celular':
    case 'morador_presente':
      if (!d.autorizadoPorPessoaId) {
        return e422(
          'AUTORIZADO_POR_SEM_IDENTIFICACAO',
          'Informe o morador que autorizou (nome obrigatório).',
        )
      }
      if (!ctx.moradoresValidosIds.has(d.autorizadoPorPessoaId)) {
        return e422(
          'AUTORIZADOR_SEM_VINCULO',
          'O autorizador não tem vínculo válido (aprovado ou legado no prazo) com a unidade.',
        )
      }
      return null
    case 'excecao_porteiro':
      return justificativaValida(d.justificativa)
        ? null
        : e422(
            'JUSTIFICATIVA_OBRIGATORIA',
            `A exceção exige justificativa de pelo menos ${MIN_JUSTIFICATIVA} caracteres (RF-17).`,
          )
    case 'autorizacao_previa': {
      const ap = ctx.autorizacoes.find((a) => a.id === d.autorizacaoPreviaId)
      if (!ap || estadoAutorizacaoPrevia(ap, ctx.quando) !== 'valida') {
        return e422(
          'AUTORIZACAO_PREVIA_INVALIDA',
          'Autorização prévia inexistente, vencida ou fora da janela de dias/horário (RN-07).',
        )
      }
      return null
    }
    case 'escala':
      return escalaVigente(ctx.funcionario, ctx.quando)
        ? null
        : e422('ESCALA_FORA_DO_HORARIO', 'O funcionário não está em horário de escala.')
  }
}

/** Ajuda para a UI: pode habilitar "Confirmar entrada"? */
export const podeConfirmarEntrada = (d: DadosAutorizacao, ctx: ContextoAutorizacao) =>
  validarAutorizacaoEntrada(d, ctx) === null
