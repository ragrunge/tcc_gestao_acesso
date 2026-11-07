import { useRef, useState } from 'react'
import type { Autorizador, AutorizacaoView, PessoaBusca, RestricaoView } from '@/api'
import { type TowerUnitPickerHandle } from '@/componentes/TowerUnitPicker'
import type { Funcionario, MeioAutorizacao, TipoVisita, VeiculoAcesso } from '@/domain/types'
import { toInputDate } from '@/domain/time'
import { VEICULO_VAZIO, type VeiculoForm } from './BlocoVeiculo'
import { NP_VAZIA } from './constantes'

export function useEntradaEstado(agora: number) {
  // --- Passo 1: pessoa
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(null)
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null)
  const [novoModo, setNovoModo] = useState(false)
  const [np, setNp] = useState(NP_VAZIA)
  const [erroNp, setErroNp] = useState('')
  // --- Passo 2: unidade (ou área comum, só prestador: RF-36)
  const [destino, setDestino] = useState<'unidade' | 'area_comum'>('unidade')
  const [areaId, setAreaId] = useState('')
  const [bloco, setBloco] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [carregandoUnidade, setCarregandoUnidade] = useState(false)
  const [previas, setPrevias] = useState<AutorizacaoView[]>([])
  const [autorizadores, setAutorizadores] = useState<Autorizador[]>([])
  const [restricao, setRestricao] = useState<RestricaoView[] | null>(null)
  // Negado que o servidor JÁ gravou (422 PESSOA_EM_RESTRICAO na confirmação): o modal não pode gravar outro
  const [negadoGravado, setNegadoGravado] = useState<{ eventoId: string; codigo: string } | null>(
    null,
  )
  // --- Passo 3: autorização
  const [meio, setMeio] = useState<MeioAutorizacao | null>(null)
  const [residenteId, setResidenteId] = useState<string | null>(null)
  const [justificativa, setJustificativa] = useState('')
  /** Prazo de permanência (só visitante/prestador). Nulo = padrão da categoria. */
  const [tipoVisita, setTipoVisita] = useState<TipoVisita | null>(null)
  // --- Veículo (opcional; a pé é o padrão). Vai no evento de entrada e entra no hash.
  const [veiculo, setVeiculo] = useState<VeiculoForm>(VEICULO_VAZIO)
  /** Veículo da última entrada com veículo da pessoa ("mesmo veículo da última visita"). */
  const [ultimoVeiculo, setUltimoVeiculo] = useState<VeiculoAcesso | null>(null)
  const pedidoVeiculo = useRef('')
  // --- Retroativo
  const [dataReal, setDataReal] = useState(toInputDate(agora))
  const [horaReal, setHoraReal] = useState('')
  const [formulario, setFormulario] = useState('')
  // --- Envio
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [recusando, setRecusando] = useState(false)

  const buscaRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<TowerUnitPickerHandle>(null)
  const grupoMeioRef = useRef<HTMLFieldSetElement>(null)
  const escolherPessoaRef = useRef<(p: PessoaBusca) => Promise<void>>(async () => undefined)

  return {
    pessoa,
    setPessoa,
    funcionario,
    setFuncionario,
    novoModo,
    setNovoModo,
    np,
    setNp,
    erroNp,
    setErroNp,
    destino,
    setDestino,
    areaId,
    setAreaId,
    bloco,
    setBloco,
    numero,
    setNumero,
    carregandoUnidade,
    setCarregandoUnidade,
    previas,
    setPrevias,
    autorizadores,
    setAutorizadores,
    restricao,
    setRestricao,
    negadoGravado,
    setNegadoGravado,
    meio,
    setMeio,
    residenteId,
    setResidenteId,
    justificativa,
    setJustificativa,
    tipoVisita,
    setTipoVisita,
    veiculo,
    setVeiculo,
    ultimoVeiculo,
    setUltimoVeiculo,
    pedidoVeiculo,
    dataReal,
    setDataReal,
    horaReal,
    setHoraReal,
    formulario,
    setFormulario,
    enviando,
    setEnviando,
    erro,
    setErro,
    recusando,
    setRecusando,
    buscaRef,
    pickerRef,
    grupoMeioRef,
    escolherPessoaRef,
  }
}

export type EntradaEstado = ReturnType<typeof useEntradaEstado>
