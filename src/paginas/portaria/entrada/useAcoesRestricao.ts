import { useNavigate } from 'react-router-dom'
import { useApi, ehApiError } from '@/api'
import { useToast } from '@/componentes/Toast'
import { meioComMorador } from '@/domain/rules'
import { mensagemErro } from '@/app/useAsync'
import { useCatalogo } from '@/app/catalogo'
import { APOS_EVENTO, useInvalidar } from '@/app/consultas'
import { garantirNegado } from '../negado'
import type { EntradaDerivados } from './useEntradaDerivados'
import type { EntradaEstado } from './useEntradaEstado'

/** Saídas sem entrada: o "negado" do modal de restrição e a recusa do morador. */
export function useAcoesRestricao({
  s,
  d,
  retroativo,
  limpar,
}: {
  s: EntradaEstado
  d: EntradaDerivados
  retroativo: boolean
  limpar: () => void
}) {
  const api = useApi()
  const nav = useNavigate()
  const { avisar } = useToast()
  const catalogo = useCatalogo()
  const invalidar = useInvalidar()
  const { pessoa, formulario, meio, residenteId } = s
  const { unidadeAtual, areaAtual, codUnidade, quando } = d

  // Modal de restrição: ambos os caminhos gravam o evento "negado" (a gravação ocorre no servidor)
  // Se a restrição veio no 422 da confirmação, o servidor já gravou o negado: NÃO chamar eventos.criar de novo.
  async function resolverRestricao(registrarOcorrencia: boolean) {
    if (!pessoa) return
    let eventoId: string, codigo: string
    try {
      ;({ eventoId, codigo } = await garantirNegado(s.negadoGravado, async () => {
        try {
          await api.eventos.criar({
            pessoaId: pessoa.id,
            unidadeDestinoId: unidadeAtual,
            areaComumId: areaAtual,
            autorizadoPorTipo: null,
            retroativo,
            ocorridoEm: retroativo ? quando : null,
            formularioContingencia: retroativo ? formulario.trim() || null : null,
          })
          return { eventoId: '', codigo: '' }
        } catch (e) {
          if (ehApiError(e) && e.code === 'PESSOA_EM_RESTRICAO') {
            const det = e.detalhes as { eventoId: string; codigo: string }
            return { eventoId: det.eventoId, codigo: det.codigo }
          }
          throw e
        }
      }))
    } catch (e) {
      s.setErro(mensagemErro(e))
      s.setRestricao(null)
      return
    }
    void invalidar(APOS_EVENTO)
    const nome = pessoa.nome
    const onde = codUnidade
      ? `na ${codUnidade}`
      : areaAtual
        ? `na área comum ${catalogo.areaNome(areaAtual)}`
        : 'no condomínio'
    s.setRestricao(null)
    s.setNegadoGravado(null)
    avisar({
      tom: 'vermelho',
      titulo: 'Entrada negada',
      texto: `${nome} não entrou ${onde}. Tentativa gravada na trilha (${codigo}).`,
    })
    if (registrarOcorrencia) {
      nav(
        `/ocorrencias?novo=1&tipo=tentativa_acesso_indevido${codUnidade ? `&unidade=${codUnidade}` : ''}&envolvidos=${encodeURIComponent(nome)}&evento=${eventoId}`,
      )
    } else if (unidadeAtual || areaAtual) {
      s.setBloco(null)
      s.setNumero(null)
      s.setMeio(null)
      s.setAreaId('')
      setTimeout(() => s.pickerRef.current?.focusBloco(), 0)
    } else {
      limpar() // funcionário sem unidade: nada a refazer na unidade, recomeça pela pessoa
    }
  }

  // UC02 A4: o morador recusou a visita. Grava o evento "recusado" e limpa a tela.
  async function registrarRecusa() {
    if (!d.podeRecusar || !pessoa || !unidadeAtual || !meioComMorador(meio)) return
    s.setRecusando(true)
    s.setErro('')
    try {
      const ev = await api.eventos.registrarRecusa({
        pessoaId: pessoa.id,
        unidadeDestinoId: unidadeAtual,
        meio,
        moradorPessoaId: residenteId!,
        retroativo,
        ocorridoEm: retroativo ? quando : null,
        formularioContingencia: retroativo ? formulario.trim() : null,
      })
      avisar({
        tom: 'ambar',
        titulo: 'Recusa registrada',
        texto: `${ev.autorizadoPorNome} recusou a visita de ${pessoa.nome} à ${codUnidade} (${ev.codigo}). Nenhuma entrada foi registrada.`,
      })
      void invalidar(APOS_EVENTO)
      limpar()
    } catch (e) {
      s.setErro(mensagemErro(e))
    } finally {
      s.setRecusando(false)
    }
  }

  return { resolverRestricao, registrarRecusa }
}
