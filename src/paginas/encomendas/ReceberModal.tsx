import { useAcoesEncomenda } from './consultas'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApi, type Autorizador } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { TowerUnitPicker } from '@/componentes/TowerUnitPicker'
import { ROTULO_VINCULO, type Encomenda } from '@/domain/types'
import { useCatalogo } from '@/app/catalogo'
import { oAgrupamento } from '@/domain/units'
import { mensagemErro } from '@/app/useAsync'
import { TRANSPORTADORAS } from './constants'

export function ReceberModal({
  onClose,
  onFeito,
}: {
  onClose: () => void
  onFeito: (e: Encomenda) => void
}) {
  const api = useApi()
  const acoes = useAcoesEncomenda()
  const catalogo = useCatalogo()
  const [bloco, setBloco] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [f, setF] = useState({ destinatario: '', transportadora: '', codigoRastreio: '' })
  const [moradores, setMoradores] = useState<Autorizador[]>([])
  const [etapa, setEtapa] = useState<'form' | 'confirmar'>('form')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  // `salvando` só vale depois do re-render: dois Enter no mesmo tick criariam duas encomendas.
  const emVoo = useRef(false)
  const destRef = useRef<HTMLInputElement>(null)
  const unidade = bloco && numero ? (catalogo.porBlocoNumero(bloco, numero)?.id ?? null) : null

  // Destinatários sugeridos: moradores com vínculo válido na unidade (o campo continua editável)
  useEffect(() => {
    if (!unidade) {
      setMoradores([])
      return
    }
    let vivo = true
    api.vinculos
      .autorizadores(unidade)
      .then((r) => vivo && setMoradores(r))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [unidade, api])

  // Erro de validação some assim que o porteiro corrige o campo
  useEffect(() => {
    setErro('')
  }, [unidade, f.destinatario, f.transportadora])

  function revisar(e: FormEvent) {
    e.preventDefault()
    if (!unidade) {
      setErro(`Escolha ${oAgrupamento(catalogo.agrupamento).toLowerCase()} e a unidade.`)
      return
    }
    if (!f.destinatario.trim()) {
      setErro('Informe o destinatário.')
      return
    }
    if (!f.transportadora) {
      setErro('Escolha a transportadora.')
      return
    }
    setErro('')
    setEtapa('confirmar')
  }
  async function salvar() {
    if (!unidade || emVoo.current) return
    emVoo.current = true
    setSalvando(true)
    try {
      onFeito(await acoes.receber({ ...f, unidadeId: unidade, unidadeConfirmada: true }))
    } catch (e) {
      setErro(mensagemErro(e))
      setEtapa('form')
      setSalvando(false)
      emVoo.current = false
    }
  }

  // Enter confirma na etapa de conferência mesmo se o foco não estiver no botão
  useEffect(() => {
    if (etapa !== 'confirmar') return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' || ev.defaultPrevented || salvando) return
      if ((ev.target as HTMLElement | null)?.tagName === 'BUTTON') return // o próprio botão já trata
      ev.preventDefault()
      void salvar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (etapa === 'confirmar' && unidade) {
    return (
      <Modal
        titulo="Conferir a unidade de destino"
        tituloOculto
        tom="petroleo"
        onClose={() => setEtapa('form')}
        rodape={
          <>
            <Button
              variante="primario"
              grande
              className="flex-1"
              atalho="Enter"
              data-autofocus
              disabled={salvando}
              onClick={() => void salvar()}
            >
              Sim, registrar
            </Button>
            <Button grande atalho="Esc" onClick={() => setEtapa('form')}>
              Voltar e corrigir
            </Button>
          </>
        }
      >
        {/* my-auto: em tela cheia (celular) a pergunta fica no meio, não colada no topo; pt deixa folga para o X */}
        <div className="my-auto flex flex-col gap-[18px] pt-8 text-center sm:pt-4">
          <div className="text-[18px] text-[#33424B]">Confirma que a encomenda é para</div>
          <div className="font-mono text-[34px] font-bold tracking-[0.02em] text-[#0B3F49] sm:text-[48px]">
            {catalogo.rotulo(unidade)}?
          </div>
          <div className="text-[16px]">
            Destinatário: <strong>{f.destinatario}</strong> · {f.transportadora}
          </div>
          {erro && (
            <Alert tom="vermelho" role="alert">
              {erro}
            </Alert>
          )}
        </div>
      </Modal>
    )
  }
  return (
    <Modal
      titulo="Receber encomenda"
      tamanho="g"
      onClose={onClose}
      rodape={
        <>
          <Button
            type="submit"
            form="form-encomenda"
            variante="primario"
            grande
            className="flex-1"
            atalho="Enter"
          >
            Continuar
          </Button>
          <Button grande atalho="Esc" onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id="form-encomenda" onSubmit={revisar} className="flex flex-col gap-4">
        <TowerUnitPicker
          autoFocusBloco
          variante="modal"
          bloco={bloco}
          numero={numero}
          onChange={(b, n) => {
            setBloco(b)
            setNumero(n)
          }}
          onComplete={() => setTimeout(() => destRef.current?.focus(), 0)}
        />
        {unidade && moradores.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium">Destinatário (moradores da unidade)</span>
            <div className="flex flex-wrap gap-2">
              {moradores.map((m) => (
                <button
                  key={m.pessoa.id}
                  type="button"
                  aria-pressed={f.destinatario === m.pessoa.nome}
                  onClick={() => setF({ ...f, destinatario: m.pessoa.nome })}
                  className={`flex h-11 items-center gap-2 rounded-lg border-2 px-[14px] max-lg:h-[44px] ${f.destinatario === m.pessoa.nome ? 'border-[#0B5563] bg-[#F0F8F9]' : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'}`}
                >
                  <span className="font-medium">{m.pessoa.nome}</span>
                  <span className="text-[13px] text-[#56616B]">
                    {ROTULO_VINCULO[m.vinculo.tipo]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Destinatário">
          <input
            ref={destRef}
            className="input"
            value={f.destinatario}
            onChange={(e) => setF({ ...f, destinatario: e.target.value })}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id="rot-transp" className="text-[14px] font-medium">
            Transportadora
          </span>
          <div role="radiogroup" aria-labelledby="rot-transp" className="flex flex-wrap gap-1.5">
            {TRANSPORTADORAS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={f.transportadora === t}
                onClick={() => setF({ ...f, transportadora: t })}
                className={`h-[44px] rounded-full border px-[14px] text-[14px] lg:mouse:h-10 ${f.transportadora === t ? 'border-[#0B5563] bg-[#0B5563] text-white' : 'border-[#B9C3CA] bg-white text-ink hover:bg-[#EEF2F4]'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Field label="Código de rastreio">
          <input
            className="input font-mono"
            value={f.codigoRastreio}
            onChange={(e) => setF({ ...f, codigoRastreio: e.target.value })}
          />
        </Field>
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
