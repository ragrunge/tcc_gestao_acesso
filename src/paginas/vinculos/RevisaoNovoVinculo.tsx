import { ROTULO_VINCULO } from '@/domain/types'
import { fmtData, fromInput } from '@/domain/time'
import { Alert } from '@/componentes/ui/alert'
import type { NovoVinculoEstado } from './useNovoVinculo'

export function RevisaoNovoVinculo({ s }: { s: NovoVinculoEstado }) {
  const { pessoa, ini, fim } = s
  return (
    <div className="flex flex-col gap-[14px]">
      <p ref={s.resumoRef} tabIndex={-1} className="text-[18px] font-semibold outline-none">
        {s.resumo}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border border-[#DCE1E5] px-4 py-3 text-[15px]">
        <dt className="text-[#56616B]">Pessoa</dt>
        <dd className="min-w-0">
          <span className="font-medium">{pessoa?.nome}</span> ·{' '}
          <span className="font-mono">{pessoa?.documentoMascarado}</span>
        </dd>
        <dt className="text-[#56616B]">Unidade</dt>
        <dd className="min-w-0 font-medium">{s.rotulo}</dd>
        <dt className="text-[#56616B]">Tipo</dt>
        <dd className="min-w-0 font-medium">{ROTULO_VINCULO[s.tipo]}</dd>
        <dt className="text-[#56616B]">Vigência</dt>
        <dd className="min-w-0">
          {ini ? `de ${fmtData(fromInput(ini)!)}` : 'sem data de início'}{' '}
          {fim ? `até ${fmtData(fromInput(fim)!)}` : '· indeterminada'}
        </dd>
      </dl>
      <Alert variant="ambar" title="Fica pendente de aprovação">
        Depois de confirmar, falta na tela <strong>Vínculos</strong>: registrar a conferência do
        comprovante (sem guardar arquivo) e aprovar. Enquanto pendente, não dá acesso de morador; a
        pessoa só passa a “Morador” na aprovação.
      </Alert>
      {s.erroApi && (
        <Alert variant="vermelho" role="alert">
          {s.erroApi}
        </Alert>
      )}
    </div>
  )
}
