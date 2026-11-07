import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { ROTULO_COMPROVANTE, type TipoComprovante } from '@/domain/types'
import { MAX_DESCRICAO_COMPROVANTE, MAX_OBSERVACAO_CONFERENCIA } from '@/domain/rules'
import type { ConferenciaComprovante } from './useConferenciaComprovante'

export function FormConferencia({
  f,
  podeCancelar,
}: {
  f: ConferenciaComprovante
  podeCancelar: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Tipo do documento conferido">
            <select
              className="input"
              value={f.tipo}
              onChange={(e) => f.setTipo(e.target.value as TipoComprovante | '')}
            >
              <option value="">Selecione…</option>
              {(Object.keys(ROTULO_COMPROVANTE) as TipoComprovante[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULO_COMPROVANTE[t]}
                </option>
              ))}
            </select>
          </Field>
          {f.tipo === 'outro' && (
            <Field
              label="Descrição do documento"
              dica="Só o tipo do documento (ex.: formal de partilha). Sem nomes ou números."
            >
              <input
                className="input"
                maxLength={MAX_DESCRICAO_COMPROVANTE}
                value={f.descricao}
                onChange={(e) => f.setDescricao(e.target.value)}
              />
            </Field>
          )}
        </div>
        <Field
          label="Observação (opcional)"
          erro={f.numeroPessoal ? 'Não escreva CPF, telefone ou outro número pessoal.' : undefined}
          dica={`Curta e sem dado pessoal: não escreva CPF, telefone ou nomes. Até ${MAX_OBSERVACAO_CONFERENCIA} caracteres.`}
        >
          <textarea
            className="input"
            rows={2}
            maxLength={MAX_OBSERVACAO_CONFERENCIA}
            value={f.observacao}
            onChange={(e) => f.setObservacao(e.target.value)}
            placeholder="Ex.: recebido por e-mail; firma reconhecida."
          />
        </Field>
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-[14px] font-medium">
        <input
          type="checkbox"
          className="h-[18px] w-[18px]"
          checked={f.confirmado}
          onChange={(e) => f.setConfirmado(e.target.checked)}
        />
        Conferi o comprovante apresentado
      </label>
      {f.erro && (
        <Alert tom="vermelho" role="alert">
          {f.erro}
        </Alert>
      )}
      <div className="flex flex-col gap-[10px] sm:flex-row">
        <Button
          variante="primario"
          disabled={!f.ok}
          carregando={f.salvando}
          onClick={() => void f.registrar()}
        >
          Registrar conferência
        </Button>
        {podeCancelar && (
          <Button
            onClick={() => {
              f.setEditando(false)
              f.setErro('')
            }}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
