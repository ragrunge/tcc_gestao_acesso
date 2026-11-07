import { AlertTriangle } from 'lucide-react'
import { justificativaValida, MIN_JUSTIFICATIVA } from '@/domain/rules'
import { SUGESTOES_EXCECAO } from './constantes'

export function ExcecaoPorteiro({
  nomeUsuario,
  justificativa,
  setJustificativa,
}: {
  nomeUsuario: string
  justificativa: string
  setJustificativa: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[#FEC84B] bg-[#FEF0C7] p-4 text-[#93370D]">
      <div className="flex items-start gap-[10px]">
        <AlertTriangle className="h-[22px] w-[22px] shrink-0" strokeWidth={2.2} aria-hidden />
        <div>
          <div className="text-[16px] font-semibold">Liberação por exceção</div>
          <div className="text-[14px] text-[#7A2E0E]">
            Esta entrada ficará marcada como exceção, com {nomeUsuario} como responsável, e
            aparecerá no relatório de exceções.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGESTOES_EXCECAO.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setJustificativa(s)}
            className="h-[44px] rounded-full border border-[#F5B54A] bg-white px-3 text-[14px] text-[#7A2E0E] hover:bg-[#FFF8E6] lg:mouse:h-9"
          >
            {s}
          </button>
        ))}
      </div>
      <label
        htmlFor="just"
        className="flex flex-col gap-1.5 text-[14px] font-medium text-[#7A2E0E]"
      >
        Justificativa (obrigatória, mínimo {MIN_JUSTIFICATIVA} caracteres)
        <textarea
          id="just"
          rows={3}
          className="input !border-[#F5B54A] font-normal"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
        />
      </label>
      <span className="text-[13px] text-[#7A2E0E]">
        {justificativa.trim().length} de {MIN_JUSTIFICATIVA} caracteres
        {justificativaValida(justificativa) ? ' — suficiente' : ''}
      </span>
    </div>
  )
}
