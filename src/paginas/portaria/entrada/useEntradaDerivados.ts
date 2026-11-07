import { useMemo } from 'react'
import type { useCatalogo } from '@/app/catalogo'
import type { MeioAutorizacao } from '@/domain/types'
import {
  meioComMorador,
  prazoInicial,
  temPrazoPermanencia,
  tipoVisitaPadrao,
  estadoAutorizacaoPrevia,
  meiosAceitos,
  podeConfirmarEntrada,
  type DadosAutorizacao,
} from '@/domain/rules'
import { fromInput } from '@/domain/time'
import { normalizarPlaca } from '@/domain/cpf'
import { listarFaltas, textoAutorizadoPor } from './regras'
import type { EntradaEstado } from './useEntradaEstado'

export function useEntradaDerivados({
  s,
  catalogo,
  agora,
  retroativo,
  nomeUsuario,
}: {
  s: EntradaEstado
  catalogo: ReturnType<typeof useCatalogo>
  agora: number
  retroativo: boolean
  nomeUsuario: string
}) {
  const { pessoa, destino, areaId, bloco, numero, previas, autorizadores, meio, residenteId } = s
  const { justificativa, veiculo, horaReal, formulario, carregandoUnidade, restricao } = s
  const { enviando, recusando, funcionario, tipoVisita, dataReal } = s

  // Ao escolher a unidade: restrições (RF-16), autorizações prévias e moradores aptos a autorizar
  const emArea = destino === 'area_comum' && pessoa?.categoria === 'prestador'
  const unidadeAtual =
    !emArea && bloco && numero ? (catalogo.porBlocoNumero(bloco, numero)?.id ?? null) : null
  const areaAtual = emArea && areaId ? areaId : null
  const codUnidade = unidadeAtual ? catalogo.codigo(unidadeAtual) : null

  // --- instante do acesso (retroativo usa a hora real informada)
  const quando = retroativo ? fromInput(dataReal, horaReal || '00:00') : agora
  const retroValido = !retroativo || (!!horaReal && quando !== null && quando < agora)

  const previaValida = useMemo(
    () => previas.find((a) => quando !== null && estadoAutorizacaoPrevia(a, quando) === 'valida'),
    [previas, quando],
  )
  const previaFora = useMemo(
    () =>
      previaValida
        ? undefined
        : previas.find(
            (a) => quando !== null && estadoAutorizacaoPrevia(a, quando) === 'fora_da_janela',
          ),
    [previas, previaValida, quando],
  )
  // "Morador" em outra unidade (ou sem vínculo válido) é tratado como visitante também no servidor
  const categoria = pessoa
    ? pessoa.categoria === 'morador'
      ? 'visitante'
      : pessoa.categoria
    : undefined
  const meiosPermitidos = categoria
    ? meiosAceitos(categoria, emArea ? 'area_comum' : 'unidade')
    : []
  const semCpf = !!pessoa?.semCpf
  // Seletor do tipo de visita: só para quem é cadastrado como visitante ou prestador ("morador" em outra unidade entra
  // como visitante com o padrão "Visita", decidido no servidor).
  const comPrazo = !!pessoa && temPrazoPermanencia(pessoa.categoria)
  const tipoEscolhido = comPrazo ? (tipoVisita ?? tipoVisitaPadrao(pessoa!.categoria)) : null

  const dados: DadosAutorizacao | null = pessoa
    ? {
        categoriaPessoa: categoria!,
        semCpf,
        unidadeDestinoId: unidadeAtual,
        areaComumId: areaAtual,
        autorizadoPorTipo: meio,
        autorizadoPorPessoaId: meioComMorador(meio) ? residenteId : null,
        autorizacaoPreviaId: meio === 'autorizacao_previa' ? (previaValida?.id ?? null) : null,
        justificativa,
      }
    : null
  // Mesma função pura que o "servidor" usa: o botão só habilita se a regra passar
  const regraOk =
    !!dados &&
    quando !== null &&
    podeConfirmarEntrada(dados, {
      quando,
      moradoresValidosIds: new Set(autorizadores.map((a) => a.pessoa.id)),
      autorizacoes: previas,
      funcionario: funcionario ?? undefined,
    })
  // Morador não registra entrada na própria unidade no MVP; em outra unidade segue como visitante
  const propriaUnidade =
    !!pessoa && !!unidadeAtual && pessoa.unidadesVinculadas.includes(unidadeAtual)
  // Com veículo, a placa é obrigatória e no padrão antigo ou Mercosul (a mesma regra da API)
  const placaNormalizada = veiculo.comVeiculo ? normalizarPlaca(veiculo.placa) : null
  const veiculoOk = !veiculo.comVeiculo || placaNormalizada !== null
  const pronto =
    !!pessoa &&
    !propriaUnidade &&
    regraOk &&
    retroValido &&
    (!retroativo || formulario.trim().length > 0) &&
    veiculoOk &&
    !carregandoUnidade &&
    !restricao &&
    !enviando

  // UC02 A4: o morador recusou a visita (grava o evento "recusado")
  const podeRecusar =
    !!pessoa &&
    !!unidadeAtual &&
    meioComMorador(meio) &&
    !!residenteId &&
    retroValido &&
    (!retroativo || formulario.trim().length > 0) &&
    !carregandoUnidade &&
    !restricao &&
    !enviando &&
    !recusando

  const residente = autorizadores.find((a) => a.pessoa.id === residenteId)?.pessoa.nome
  const autorizadoPor = textoAutorizadoPor({ meio, nomeUsuario, previaValida, residente })
  const faltas = listarFaltas({
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
  })

  /** Motivo de um meio não valer para a pessoa ou o destino escolhidos (null = vale). */
  const motivoMeioBloqueado = (m: MeioAutorizacao): string | null => {
    if (!pessoa || meiosPermitidos.includes(m)) return null
    if (m === 'escala') return 'Só para funcionário'
    if (emArea) return 'Não vale para área comum'
    return 'Não vale para esta pessoa'
  }
  // Prazo de permanência pela MESMA regra do servidor (prazoInicial): tipo escolhido ou padrão da categoria efetiva
  // ("morador" em outra unidade entra como visitante) e, no serviço com autorização prévia, o fim da janela
  const tipoResumo =
    categoria && temPrazoPermanencia(categoria)
      ? (tipoEscolhido ?? tipoVisitaPadrao(categoria))
      : null
  const saiAte =
    tipoResumo && quando !== null && (!retroativo || horaReal)
      ? prazoInicial(
          tipoResumo,
          quando,
          meio === 'autorizacao_previa' ? previaValida?.horaFim : null,
        )
      : null
  const autorizacaoBloqueada =
    !pessoa ||
    (!unidadeAtual && !areaAtual && pessoa.categoria !== 'funcionario') ||
    carregandoUnidade
  const rotuloDestino = unidadeAtual
    ? catalogo.rotulo(unidadeAtual)
    : areaAtual
      ? catalogo.areaNome(areaAtual)
      : '—'

  return {
    emArea,
    unidadeAtual,
    areaAtual,
    codUnidade,
    quando,
    retroValido,
    previaValida,
    previaFora,
    semCpf,
    comPrazo,
    tipoEscolhido,
    dados,
    propriaUnidade,
    placaNormalizada,
    pronto,
    podeRecusar,
    autorizadoPor,
    faltas,
    motivoMeioBloqueado,
    tipoResumo,
    saiAte,
    autorizacaoBloqueada,
    rotuloDestino,
  }
}

export type EntradaDerivados = ReturnType<typeof useEntradaDerivados>
