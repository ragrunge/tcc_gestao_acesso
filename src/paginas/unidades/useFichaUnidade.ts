import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi, type AutorizacaoView, type RestricaoView, type VinculoView } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { useToast } from '@/componentes/Toast'
import type { EventoView, Veiculo } from '@/domain/types'
import { acharUnidadePorTexto } from '@/domain/units'
import { mensagemErro } from '@/app/useAsync'
import { useCatalogo } from '@/app/catalogo'
import { APOS_AUTORIZACAO, useInvalidar } from '@/app/consultas'
import { useAcoesUnidade, useUnidadeDetalhe } from './useUnidades'

export type ModoFicha = null | 'vinculo' | 'morador' | 'previa' | 'restricao' | 'veiculo' | 'editar'

/** Estado, permissões e ações da ficha da unidade. `id`: uuid ou código "D-32". */
export function useFichaUnidade(id: string) {
  const api = useApi()
  const nav = useNavigate()
  const invalidar = useInvalidar()
  const { avisar } = useToast()
  const catalogo = useCatalogo()
  const acoes = useAcoesUnidade()
  const [modo, setModo] = useState<ModoFicha>(null)
  const [evento, setEvento] = useState<EventoView | null>(null)
  const [veiculoEditado, setVeiculoEditado] = useState<Veiculo | null>(null)
  const [revogando, setRevogando] = useState<AutorizacaoView | null>(null)
  const [encerrando, setEncerrando] = useState<VinculoView | null>(null)
  const [pendenteAviso, setPendenteAviso] = useState(false)
  const pode = {
    vinculo: useCan('vinculo.criar'),
    encerrar: useCan('vinculo.decidir'),
    cadastrarMorador: useCan('pessoa.cadastrar_morador'),
    previa: useCan('autorizacao.criar'),
    cadastrarExterno: useCan('pessoa.cadastrar_externo'),
    restricao: useCan('restricao.criar'),
    revogar: useCan('unidade.editar'),
    veiculo: useCan('veiculo.cadastrar'),
    editarUnidade: useCan('unidade.editar'),
  }
  const det = useUnidadeDetalhe(id)
  /** Vínculo, autorização ou restrição novos mudam o detalhe, o resumo do bloco, a fila de vínculos, a pessoa e o turno. */
  const recarregar = () => invalidar(APOS_AUTORIZACAO)

  // Dado anterior (placeholder) só vale se for a MESMA unidade (troca de "D-32" para o uuid). De outra unidade, não:
  // os botões agiriam sobre a unidade anterior enquanto a nova carrega.
  const bruto = det.data
  const mesma = !!bruto && (bruto.unidade.id === id || !!acharUnidadePorTexto([bruto.unidade], id))
  const d = det.isPlaceholderData && !mesma ? undefined : bruto
  const uid = d?.unidade.id ?? ''
  const ativa = !!d?.unidade.ativo
  const feito = (texto: string) => {
    setModo(null)
    avisar({ texto })
    void recarregar()
  }

  // RF-01: desativar/reativar (nunca excluir); a mutation invalida o catálogo, para o seletor de unidades refletir
  async function alternarAtivo() {
    if (!d) return
    const codigo = catalogo.codigo(uid)
    try {
      await acoes.alternarAtivo.mutateAsync({ id: uid, ativo: ativa })
      avisar({
        texto: ativa
          ? `Unidade ${codigo} desativada. O histórico continua disponível.`
          : `Unidade ${codigo} reativada.`,
      })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  async function revogarPrevia(a: AutorizacaoView) {
    await api.autorizacoes.revogar(a.id)
    setRevogando(null)
    avisar({ texto: 'Autorização prévia revogada.' })
    void recarregar()
  }
  async function encerrarVinculo(v: VinculoView, motivo: string) {
    await api.vinculos.encerrar(v.id, { motivo })
    setEncerrando(null)
    avisar({
      tom: 'ambar',
      texto: `Vínculo de ${v.pessoaNome} encerrado. Deixa de valer para acesso; o histórico é mantido.`,
    })
    void recarregar()
  }
  async function revogarRestricao(r: RestricaoView) {
    try {
      await api.restricoes.revogar(r.id)
      avisar({ texto: 'Restrição revogada.' })
      void recarregar()
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  return {
    nav,
    invalidar,
    avisar,
    catalogo,
    alternando: acoes.alternarAtivo.isPending,
    modo,
    setModo,
    evento,
    setEvento,
    veiculoEditado,
    setVeiculoEditado,
    revogando,
    setRevogando,
    encerrando,
    setEncerrando,
    pendenteAviso,
    setPendenteAviso,
    pode,
    erro: det.error,
    d,
    uid,
    ativa,
    feito,
    alternarAtivo,
    revogarPrevia,
    encerrarVinculo,
    revogarRestricao,
  }
}

export type FichaUnidade = ReturnType<typeof useFichaUnidade>
