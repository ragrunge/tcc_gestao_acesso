import { useState } from 'react'
import { useApi, type PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { useToast } from '@/componentes/Toast'
import type { EventoView, ValoresCorrecao } from '@/domain/types'
import { MIN_JUSTIFICATIVA, justificativaValida } from '@/domain/rules'
import { fromInput } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'
import { APOS_EVENTO, useInvalidar } from '@/app/consultas'
import { useCatalogo } from '@/app/catalogo'
import { CamposCorrecao } from './CamposCorrecao'

export function CorrecaoEvento({
  ev,
  onClose,
  onCorrigido,
}: {
  ev: EventoView
  onClose: () => void
  onCorrigido?: () => void
}) {
  const api = useApi()
  const { avisar } = useToast()
  const catalogo = useCatalogo()
  const invalidar = useInvalidar()
  const [corrigindo, setCorrigindo] = useState(false)
  const [just, setJust] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  // Valores corrigidos (todos opcionais): só o que for preenchido substitui o original
  const [vUnidade, setVUnidade] = useState('')
  const [vData, setVData] = useState('')
  const [vHora, setVHora] = useState('')
  const [vPessoa, setVPessoa] = useState<PessoaBusca | null>(null)
  const [vAutorizador, setVAutorizador] = useState<PessoaBusca | null>(null)

  async function corrigir() {
    try {
      const valores: Partial<ValoresCorrecao> = {}
      if (vUnidade.trim()) {
        const un = catalogo.porTexto(vUnidade)
        if (!un) {
          setErro('Unidade inexistente. Use o formato D-32.')
          return
        }
        valores.unidadeDestinoId = un.id
      }
      if (vData || vHora) {
        const t = vData && vHora ? fromInput(vData, vHora) : null
        if (t === null) {
          setErro('Informe data e hora juntas para corrigir o horário.')
          return
        }
        valores.ocorridoEm = t
      }
      if (vPessoa) valores.pessoaId = vPessoa.id
      if (vAutorizador) valores.autorizadoPorPessoaId = vAutorizador.id // autorizador é pessoa (id), não nome livre
      const novo = await api.eventos.corrigir(ev.id, {
        justificativa: just,
        observacao: obs,
        valores: Object.keys(valores).length ? valores : undefined,
      })
      avisar({
        texto: `Correção ${novo.codigo} registrada. O registro original permanece inalterado.`,
      })
      void invalidar(APOS_EVENTO)
      onCorrigido?.()
      onClose()
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  if (!corrigindo)
    return (
      <Button pequeno className="self-start" onClick={() => setCorrigindo(true)}>
        Registrar correção…
      </Button>
    )
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[#DCE1E5] p-4">
      <p className="font-semibold">Registrar correção (novo evento, o original não é alterado)</p>
      <Field label={`Justificativa (mínimo ${MIN_JUSTIFICATIVA} caracteres)`}>
        <textarea
          className="input"
          rows={2}
          value={just}
          onChange={(e) => setJust(e.target.value)}
        />
      </Field>
      <Field label="O que deve ser corrigido (opcional)">
        <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Field>
      <CamposCorrecao
        temAutorizador={!!ev.autorizadoPorTipo}
        vUnidade={vUnidade}
        setVUnidade={setVUnidade}
        vData={vData}
        setVData={setVData}
        vHora={vHora}
        setVHora={setVHora}
        vPessoa={vPessoa}
        setVPessoa={setVPessoa}
        vAutorizador={vAutorizador}
        setVAutorizador={setVAutorizador}
      />
      {erro && (
        <Alert tom="vermelho" role="alert">
          {erro}
        </Alert>
      )}
      <div className="flex flex-wrap gap-[10px]">
        <Button
          variante="primario"
          disabled={!justificativaValida(just)}
          onClick={() => void corrigir()}
        >
          Gravar correção
        </Button>
        <Button onClick={() => setCorrigindo(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
