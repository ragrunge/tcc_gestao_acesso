import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, ehApiError, type RestricaoView } from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { useToast } from '@/componentes/Toast'
import { ROTULO_PAPEL } from '@/domain/types'
import { tipoVisitaPadrao } from '@/domain/rules'
import { fmtData, fmtHora } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'
import { APOS_EVENTO, useInvalidar } from '@/app/consultas'
import type { EntradaDerivados } from './useEntradaDerivados'
import type { EntradaEstado } from './useEntradaEstado'

/** Confirma a entrada; o 422 PESSOA_EM_RESTRICAO abre o modal com o negado que o servidor já gravou. */
export function useRegistrarEntrada({
  s,
  d,
  retroativo,
}: {
  s: EntradaEstado
  d: EntradaDerivados
  retroativo: boolean
}) {
  const api = useApi()
  const nav = useNavigate()
  const { usuario } = useAuth()
  const { avisar } = useToast()
  const invalidar = useInvalidar()
  const { pessoa, meio, justificativa, formulario, veiculo } = s
  const { setEnviando, setErro, setNegadoGravado, setRestricao } = s
  const { dados, pronto, unidadeAtual, areaAtual, quando, tipoEscolhido, placaNormalizada } = d

  return useCallback(async () => {
    if (!pessoa || !dados || !pronto) return
    setEnviando(true)
    setErro('')
    try {
      const ev = await api.eventos.criar({
        pessoaId: pessoa.id,
        unidadeDestinoId: unidadeAtual,
        areaComumId: areaAtual,
        autorizadoPorTipo: dados.autorizadoPorTipo,
        autorizadoPorPessoaId: dados.autorizadoPorPessoaId,
        autorizacaoPreviaId: dados.autorizacaoPreviaId,
        justificativa: meio === 'excecao_porteiro' ? justificativa : null,
        retroativo,
        ocorridoEm: retroativo ? quando : null,
        formularioContingencia: retroativo ? formulario.trim() : null,
        // Só quando difere do padrão (que o servidor aplica sozinho): durante o deploy, o front novo diante da API anterior
        // (DTO estrito, sem o campo) não quebra a entrada comum.
        tipoVisita:
          pessoa && tipoEscolhido && tipoEscolhido !== tipoVisitaPadrao(pessoa.categoria)
            ? tipoEscolhido
            : null,
        veiculo: placaNormalizada
          ? { placa: placaNormalizada, modelo: veiculo.modelo, cor: veiculo.cor }
          : null,
      })
      const via = {
        interfone: 'via interfone',
        celular: 'pelo celular (WhatsApp ou ligação)',
        morador_presente: 'com o morador presente na portaria',
        autorizacao_previa: 'via autorização prévia',
        excecao_porteiro: 'por exceção do porteiro (justificativa registrada)',
        escala: 'por escala',
      }[meio!]
      const quem =
        ev.autorizadoPorTipo === 'excecao_porteiro' || ev.autorizadoPorTipo === 'escala'
          ? ''
          : `autorizada por ${ev.autorizadoPorNome ?? '—'} `
      avisar({
        tom: ev.autorizadoPorTipo === 'excecao_porteiro' ? 'ambar' : 'verde',
        titulo: retroativo ? 'Lançamento retroativo registrado' : 'Entrada registrada',
        texto: `${retroativo ? `Acesso de ${fmtData(ev.ocorridoEm)} ${fmtHora(ev.ocorridoEm)}, lançado` : 'Entrada registrada'} às ${fmtHora(ev.registradoEm)} por ${ROTULO_PAPEL[usuario!.papel]} ${usuario!.nome} — ${quem}${via} (${ev.codigo}).`,
      })
      void invalidar(APOS_EVENTO)
      nav('/painel')
    } catch (e) {
      if (ehApiError(e) && e.code === 'PESSOA_EM_RESTRICAO') {
        // O servidor já gravou o "negado": guarda o evento para o modal não gravar de novo
        const det = e.detalhes as { restricoes: RestricaoView[]; eventoId: string; codigo: string }
        setNegadoGravado({ eventoId: det.eventoId, codigo: det.codigo })
        setRestricao(det.restricoes)
        void invalidar(APOS_EVENTO) // o negado já está na trilha
      } else setErro(mensagemErro(e))
      setEnviando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pessoa,
    dados,
    pronto,
    api,
    unidadeAtual,
    areaAtual,
    meio,
    justificativa,
    retroativo,
    quando,
    formulario,
    usuario,
    tipoEscolhido,
    placaNormalizada,
    veiculo,
  ])
}
