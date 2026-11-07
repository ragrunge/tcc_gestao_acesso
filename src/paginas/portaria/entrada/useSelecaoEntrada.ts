import { useCallback, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useApi, type NovaPessoaInput, type PessoaBusca } from '@/api'
import { useToast } from '@/componentes/Toast'
import { ROTULO_CATEGORIA, type MeioAutorizacao } from '@/domain/types'
import { tipoVisitaPadrao } from '@/domain/rules'
import { mensagemErro } from '@/app/useAsync'
import { VEICULO_VAZIO } from './BlocoVeiculo'
import { NP_VAZIA } from './constantes'
import type { EntradaEstado } from './useEntradaEstado'

/** Escolha da pessoa, cadastro rápido e as trocas/limpezas de destino e meio. */
export function useSelecaoEntrada({
  s,
  setQuery,
  setSugestoes,
}: {
  s: EntradaEstado
  setQuery: Dispatch<SetStateAction<string>>
  setSugestoes: Dispatch<SetStateAction<PessoaBusca[]>>
}) {
  const api = useApi()
  const { avisar } = useToast()
  const { setPessoa, setFuncionario, setErro, setTipoVisita, setVeiculo, setUltimoVeiculo } = s
  const { pedidoVeiculo, pickerRef } = s

  const escolherPessoa = useCallback(
    async (p: PessoaBusca) => {
      setPessoa(p)
      setQuery('')
      setSugestoes([])
      setErro('')
      setTipoVisita(null)
      setVeiculo(VEICULO_VAZIO)
      setUltimoVeiculo(null)
      // Sugestão do último veículo: conveniência, falha não atrapalha a entrada
      // Resposta de uma pessoa anterior (trocou rápido) é descartada.
      pedidoVeiculo.current = p.id
      Promise.resolve()
        .then(() => api.eventos.ultimoVeiculo(p.id))
        .then(
          (v) => {
            if (pedidoVeiculo.current === p.id) setUltimoVeiculo(v)
          },
          () => undefined,
        )
      setFuncionario(p.categoria === 'funcionario' ? await api.pessoas.funcionario(p.id) : null)
      // Correção 12: após escolher a pessoa, o foco vai para a seleção de bloco
      setTimeout(() => pickerRef.current?.focusBloco(), 0)
    },
    [
      api,
      setQuery,
      setSugestoes,
      setPessoa,
      setFuncionario,
      setErro,
      setTipoVisita,
      setVeiculo,
      setUltimoVeiculo,
      pedidoVeiculo,
      pickerRef,
    ],
  )

  s.escolherPessoaRef.current = escolherPessoa

  function limpar(manterFoco = true) {
    s.setPessoa(null)
    s.setFuncionario(null)
    setQuery('')
    setSugestoes([])
    s.setNovoModo(false)
    s.setNp(NP_VAZIA)
    s.setErroNp('')
    s.setBloco(null)
    s.setNumero(null)
    s.setPrevias([])
    s.setAutorizadores([])
    s.setMeio(null)
    s.setResidenteId(null)
    s.setJustificativa('')
    s.setErro('')
    s.setFormulario('')
    s.setHoraReal('')
    s.setRestricao(null)
    s.setNegadoGravado(null)
    s.setDestino('unidade')
    s.setAreaId('')
    s.setTipoVisita(null)
    s.setVeiculo(VEICULO_VAZIO)
    s.setUltimoVeiculo(null)
    s.pedidoVeiculo.current = ''
    if (manterFoco) setTimeout(() => s.buscaRef.current?.focus(), 0)
  }
  const limparUnidade = () => {
    s.setRestricao(null)
    s.setNegadoGravado(null)
    s.setBloco(null)
    s.setNumero(null)
    s.setPrevias([])
    s.setAutorizadores([])
    s.setMeio(null)
    s.setResidenteId(null)
    s.setJustificativa('')
    setTimeout(() => s.pickerRef.current?.focusBloco(), 0)
  }
  const trocarDestino = (d: 'unidade' | 'area_comum') => {
    s.setDestino(d)
    s.setBloco(null)
    s.setNumero(null)
    s.setAreaId('')
    s.setPrevias([])
    s.setAutorizadores([])
    s.setMeio(null)
    s.setResidenteId(null)
    s.setRestricao(null)
  }
  const escolherArea = (id: string) => {
    s.setAreaId(id)
    s.setRestricao(null)
  }
  const mudarUnidade = (b: string | null, n: string | null) => {
    s.setBloco(b)
    s.setNumero(n)
    if (!n) {
      s.setPrevias([])
      s.setAutorizadores([])
      s.setMeio(null)
      s.setResidenteId(null)
    }
  }
  const escolherMeio = (m: MeioAutorizacao) => {
    s.setMeio(m)
    s.setResidenteId(null)
  }

  async function cadastrarNova(e: FormEvent) {
    e.preventDefault()
    s.setErroNp('')
    const np = s.np
    try {
      const input: NovaPessoaInput = {
        nome: np.nome,
        documento: np.semCpf ? undefined : np.documento,
        telefone: np.telefone,
        semCpf: np.semCpf,
        categoria: np.categoria,
        empresa: np.categoria === 'prestador' ? np.empresa : undefined,
        servico: np.categoria === 'prestador' ? np.servico : undefined,
      }
      const criada = await api.pessoas.criar(input)
      const tipo = np.tipoVisita
      s.setNovoModo(false)
      s.setNp(NP_VAZIA)
      await escolherPessoa({
        ...criada,
        ultimoAcesso: 'Sem acessos',
        unidadesVinculadas: [],
        unidadesVinculadasCodigos: [],
      })
      if (tipo !== tipoVisitaPadrao(criada.categoria)) s.setTipoVisita(tipo)
      avisar({
        texto: `${criada.nome} cadastrado(a) como ${ROTULO_CATEGORIA[criada.categoria].toLowerCase()}.`,
      })
    } catch (err) {
      s.setErroNp(mensagemErro(err))
    }
  }

  return {
    escolherPessoa,
    limpar,
    limparUnidade,
    trocarDestino,
    escolherArea,
    mudarUnidade,
    escolherMeio,
    cadastrarNova,
  }
}
