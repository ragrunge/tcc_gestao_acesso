import type { VinculoView } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import type { DecisaoVinculo } from './useDecisaoVinculo'

/** Vínculo pendente: aprovar (exige cadastro completo e comprovante conferido) ou rejeitar com justificativa. */
export function DecisaoPendente({ atual, d }: { atual: VinculoView; d: DecisaoVinculo }) {
  return (
    <>
      {!atual.pessoaCadastroCompleto && (
        <Alert tom="ambar">
          Cadastro incompleto: a pessoa precisa ter CPF válido (não “sem CPF”) e telefone para o
          vínculo ser aprovado. Complete o cadastro ou rejeite.
        </Alert>
      )}
      {d.rejeitando ? (
        <div className="flex flex-col gap-[10px]">
          <label htmlFor="just-vinc" className="flex flex-col gap-1.5 text-[14px] font-medium">
            Justificativa da rejeição (obrigatória)
            <textarea
              id="just-vinc"
              data-autofocus
              autoFocus
              className="input font-normal"
              rows={3}
              value={d.just}
              onChange={(e) => d.setJust(e.target.value)}
              placeholder="Ex.: Comprovante apresentado não corresponde à unidade; proprietária não confirmou a locação."
            />
          </label>
          <span className="text-[13px] text-[#56616B]">{d.just.trim().length} caracteres</span>
          {d.erro && (
            <Alert tom="vermelho" role="alert">
              {d.erro}
            </Alert>
          )}
          <div className="flex flex-col gap-[10px] sm:flex-row">
            <Button
              variante="perigo"
              grande
              className="sm:flex-1"
              disabled={!d.justOk}
              carregando={d.salvando}
              onClick={() => void d.decidir('rejeitar')}
            >
              Confirmar rejeição
            </Button>
            <Button
              grande
              onClick={() => {
                d.setRejeitando(false)
                d.setJust('')
                d.setErro('')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-[10px] sm:flex-row">
            <Button
              variante="primario"
              grande
              className="sm:flex-1"
              disabled={!atual.pessoaCadastroCompleto || !d.conferido}
              onClick={() => void d.decidir('aprovar')}
              carregando={d.salvando}
            >
              Aprovar
            </Button>
            <button
              type="button"
              onClick={() => d.setRejeitando(true)}
              className="h-12 rounded-lg border-2 border-[#B42318] bg-white font-semibold text-[#B42318] hover:bg-[#FEF3F2] sm:flex-1"
            >
              Rejeitar
            </button>
          </div>
          {/* RN-02: o selo do topo já diz "não conferido"; aqui só o motivo do Aprovar desligado */}
          {!d.conferido && (
            <span className="text-[13px] text-[#56616B]">
              Para aprovar, registre antes a conferência do comprovante (RN-02).
            </span>
          )}
          {d.erro && (
            <span role="alert" className="text-[14px] font-medium text-[#B42318]">
              {d.erro}
            </span>
          )}
        </div>
      )}
    </>
  )
}
