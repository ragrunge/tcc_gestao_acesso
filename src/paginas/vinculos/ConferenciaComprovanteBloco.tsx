import { useState } from 'react'
import { Check } from 'lucide-react'
import { useApi, type VinculoView } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { useToast } from '@/componentes/Toast'
import { Field } from '@/componentes/Field'
import { ROTULO_COMPROVANTE, type TipoComprovante } from '@/domain/types'
import {
  MAX_DESCRICAO_COMPROVANTE,
  MAX_OBSERVACAO_CONFERENCIA,
  temNumeroDePessoa,
} from '@/domain/rules'
import { fmtData } from '@/domain/time'
import { mensagemErro } from '@/app/useAsync'

export /**
 * RF-05: conferência do comprovante de vínculo. A administração confere o documento (que chega por e-mail ou em mãos)
 * e registra só o tipo, a data e quem conferiu. O arquivo não entra no sistema (LGPD, art. 6º, III).
 */
function ConferenciaComprovanteBloco({
  vinculo,
  podeRegistrar,
  onRegistrado,
}: {
  vinculo: VinculoView
  podeRegistrar: boolean
  onRegistrado: () => Promise<unknown>
}) {
  const api = useApi()
  const { avisar } = useToast()
  const c = vinculo.conferencia
  const [editando, setEditando] = useState(!c)
  const [tipo, setTipo] = useState<TipoComprovante | ''>('')
  const [descricao, setDescricao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const numeroPessoal = temNumeroDePessoa(`${tipo === 'outro' ? descricao : ''} ${observacao}`)
  const ok =
    !!tipo && confirmado && (tipo !== 'outro' || descricao.trim().length > 0) && !numeroPessoal

  async function registrar() {
    if (!tipo) return
    setSalvando(true)
    setErro('')
    try {
      await api.vinculos.registrarConferencia(vinculo.id, {
        tipo,
        ...(tipo === 'outro' ? { descricao } : {}),
        ...(observacao.trim() ? { observacao } : {}),
      })
      avisar({
        tom: 'verde',
        texto: `Conferência do comprovante de ${vinculo.pessoaNome} registrada. O arquivo não é guardado no sistema.`,
      })
      setEditando(false)
      setConfirmado(false)
      await onRegistrado()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  const rot = 'text-[13px] text-[#56616B]'
  return (
    <section
      aria-labelledby={`conf-${vinculo.id}`}
      className="flex flex-col gap-[14px] rounded-lg border border-[#DCE1E5] bg-[#F7F9FA] p-[18px]"
    >
      <h3 id={`conf-${vinculo.id}`} className="text-[15px] font-semibold">
        Conferência do comprovante
      </h3>
      <p className="text-[13px] text-[#56616B]">
        O comprovante (escritura ou contrato) é conferido pela administração e não é anexado: o
        sistema registra só o tipo, a data e quem conferiu.
      </p>
      {c && !editando && (
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-start gap-[10px] text-[#05603A]">
            <Check className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2.6} aria-hidden />
            <span className="font-semibold">Comprovante conferido</span>
          </div>
          <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <span className={rot}>Documento</span>
              <span>
                {ROTULO_COMPROVANTE[c.tipoDocumento]}
                {c.descricao ? ` — ${c.descricao}` : ''}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={rot}>Data da conferência</span>
              <span>{fmtData(c.data)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className={rot}>Conferido por</span>
              <span>{vinculo.conferidoPorNome ?? '—'}</span>
            </div>
            {c.observacao && (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <span className={rot}>Observação</span>
                <span>{c.observacao}</span>
              </div>
            )}
          </div>
          {podeRegistrar && (
            <div>
              <Button pequeno onClick={() => setEditando(true)}>
                Refazer conferência
              </Button>
            </div>
          )}
        </div>
      )}
      {!c && !podeRegistrar && (
        <span className="text-[#56616B]">Nenhuma conferência registrada.</span>
      )}
      {podeRegistrar && editando && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Field label="Tipo do documento conferido">
                <select
                  className="input"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoComprovante | '')}
                >
                  <option value="">Selecione…</option>
                  {(Object.keys(ROTULO_COMPROVANTE) as TipoComprovante[]).map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_COMPROVANTE[t]}
                    </option>
                  ))}
                </select>
              </Field>
              {tipo === 'outro' && (
                <Field
                  label="Descrição do documento"
                  dica="Só o tipo do documento (ex.: formal de partilha). Sem nomes ou números."
                >
                  <input
                    className="input"
                    maxLength={MAX_DESCRICAO_COMPROVANTE}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <Field
              label="Observação (opcional)"
              erro={
                numeroPessoal ? 'Não escreva CPF, telefone ou outro número pessoal.' : undefined
              }
              dica={`Curta e sem dado pessoal: não escreva CPF, telefone ou nomes. Até ${MAX_OBSERVACAO_CONFERENCIA} caracteres.`}
            >
              <textarea
                className="input"
                rows={2}
                maxLength={MAX_OBSERVACAO_CONFERENCIA}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: recebido por e-mail; firma reconhecida."
              />
            </Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-[14px] font-medium">
            <input
              type="checkbox"
              className="h-[18px] w-[18px]"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            Conferi o comprovante apresentado
          </label>
          {erro && (
            <Alert tom="vermelho" role="alert">
              {erro}
            </Alert>
          )}
          <div className="flex flex-col gap-[10px] sm:flex-row">
            <Button
              variante="primario"
              disabled={!ok}
              carregando={salvando}
              onClick={() => void registrar()}
            >
              Registrar conferência
            </Button>
            {c && (
              <Button
                onClick={() => {
                  setEditando(false)
                  setErro('')
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
