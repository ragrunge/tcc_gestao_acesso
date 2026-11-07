import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ROTULO_VINCULO, type TipoVinculo } from '@/domain/types'
import { agora, fromInput, toInputDate } from '@/domain/time'
import { rotuloUnidade } from '@/domain/units'
import type { PessoaBusca } from '@/api'
import { useCatalogo } from '@/app/catalogo'
import { mensagemErro } from '@/app/useAsync'
import { useAcoesVinculo } from './consultas'
import { motivoConflito, validarNovoVinculo, type ErrosVinculo } from './regras'
import type { NovoVinculoProps } from './NovoVinculo'

/** Estado do formulário -> revisão -> envio do vínculo novo. */
export function useNovoVinculo({
  pessoaFixa,
  unidadeFixa,
  vinculosConhecidos,
  onFeito,
}: Pick<NovoVinculoProps, 'pessoaFixa' | 'unidadeFixa' | 'vinculosConhecidos' | 'onFeito'>) {
  const acoes = useAcoesVinculo()
  const catalogo = useCatalogo()
  const [pessoaBusca, setPessoaBusca] = useState<PessoaBusca | null>(null)
  const [unidadeId, setUnidadeId] = useState<string | null>(unidadeFixa?.id ?? null)
  const [tipo, setTipo] = useState<TipoVinculo>('proprietario')
  const [ini, setIni] = useState(toInputDate(agora()))
  const [fim, setFim] = useState('')
  const [erros, setErros] = useState<ErrosVinculo>({})
  const [passo, setPasso] = useState<'form' | 'revisao'>('form')
  const [erroApi, setErroApi] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [cadastrando, setCadastrando] = useState<string | null>(null)
  const resumoRef = useRef<HTMLParagraphElement>(null)

  const pessoa = pessoaFixa ?? pessoaBusca
  const unidade = unidadeFixa ?? catalogo.porId(unidadeId) ?? null
  const conflito =
    pessoa && unidadeId
      ? motivoConflito(vinculosConhecidos, pessoa.id, unidadeId, pessoaBusca?.unidadesVinculadas)
      : null
  const rotulo = unidade
    ? rotuloUnidade(unidade, catalogo.agrupamento, false)
    : catalogo.codigo(unidadeId)
  const resumo = pessoa ? `Vincular ${pessoa.nome} a ${rotulo} como ${ROTULO_VINCULO[tipo]}` : ''

  useEffect(() => {
    if (passo === 'revisao') resumoRef.current?.focus()
  }, [passo])

  function continuar(e: FormEvent) {
    e.preventDefault()
    const v = validarNovoVinculo({ pessoa, unidade, tipo, inicio: ini, fim, conflito })
    setErros(v)
    setErroApi('')
    if (Object.keys(v).length) return
    setPasso('revisao')
  }
  async function confirmar() {
    if (!pessoa || !unidadeId || enviando) return
    setEnviando(true)
    setErroApi('')
    try {
      const v = await acoes.criar({
        pessoaId: pessoa.id,
        unidadeId,
        tipo,
        vigenciaInicio: fromInput(ini)!,
        vigenciaFim: fim ? fromInput(fim) : null,
        solicitadoPor: '', // sem anexo: o comprovante é conferido e registrado na tela de Vínculos (RF-05) antes da aprovação
      })
      onFeito(v, resumo)
    } catch (err) {
      setErroApi(mensagemErro(err))
      setEnviando(false)
    }
  }

  return {
    pessoaBusca,
    setPessoaBusca,
    unidadeId,
    setUnidadeId,
    tipo,
    setTipo,
    ini,
    setIni,
    fim,
    setFim,
    erros,
    setErros,
    passo,
    setPasso,
    erroApi,
    setErroApi,
    enviando,
    cadastrando,
    setCadastrando,
    resumoRef,
    pessoa,
    rotulo,
    resumo,
    continuar,
    confirmar,
  }
}

export type NovoVinculoEstado = ReturnType<typeof useNovoVinculo>
