import type { VinculoView } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { fmtData } from '@/domain/time'
import type { DecisaoVinculo } from './useDecisaoVinculo'

/** Legado (RN-09): regularizar passa a aprovado; exige comprovante conferido e cadastro completo. */
export function RegularizarLegado({
  atual,
  d,
  podeDecidir,
  onAbrirFicha,
}: {
  atual: VinculoView
  d: DecisaoVinculo
  podeDecidir: boolean
  onAbrirFicha: (pessoaId: string) => void
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div
        className={`rounded-lg border px-3 py-[10px] text-[14px] ${atual.legadoVencido ? 'border-[#FDA29B] bg-[#FEE4E2] text-[#912018]' : 'border-[#D5DDE2] bg-[#EEF2F4] text-[#33424B]'}`}
      >
        {atual.legadoVencido ? (
          <strong>Prazo de regularização vencido em {fmtData(atual.prazoRegularizacao!)}.</strong>
        ) : (
          <>Legado válido até {fmtData(atual.prazoRegularizacao!)}.</>
        )}{' '}
        Regularizar passa o vínculo a aprovado; exige o comprovante conferido (RF-05) e cadastro
        completo (CPF e telefone).
      </div>
      {!d.conferido && (
        <Alert tom="ambar">
          Registre a conferência do comprovante (acima) antes de regularizar.
        </Alert>
      )}
      {!atual.pessoaCadastroCompleto && (
        <Alert tom="ambar">
          Cadastro incompleto: complete CPF e telefone pela ficha da pessoa antes de regularizar.
        </Alert>
      )}
      {atual.tipo === 'inquilino' && !atual.vigenciaFim && (
        <label className="flex flex-col gap-1.5 text-[14px] font-medium">
          Fim da vigência (obrigatório para inquilino)
          <input
            type="date"
            className="input font-normal"
            value={d.fimInquilino}
            onChange={(e) => d.setFimInquilino(e.target.value)}
          />
        </label>
      )}
      {d.erro && (
        <Alert tom="vermelho" role="alert">
          {d.erro}
        </Alert>
      )}
      {podeDecidir && (
        <div className="flex flex-col gap-[10px] sm:flex-row">
          <Button
            variante="primario"
            grande
            className="sm:flex-1"
            disabled={!d.conferido}
            carregando={d.salvando}
            onClick={() => void d.regularizar()}
          >
            Regularizar
          </Button>
          <Button grande onClick={() => onAbrirFicha(atual.pessoaId)}>
            Abrir ficha / completar cadastro
          </Button>
        </div>
      )}
    </div>
  )
}
