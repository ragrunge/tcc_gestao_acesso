import { ShieldCheck } from 'lucide-react'
import type { ResultadoIntegridade } from '@/domain/hashChain'
import { Alert } from '@/componentes/Alert'

export function AvisoIntegridade({
  verificando,
  integ,
}: {
  verificando: boolean
  integ: ResultadoIntegridade | null
}) {
  return (
    <>
      {verificando && (
        <div
          role="status"
          className="rounded-lg border border-[#D5DDE2] bg-[#EEF2F4] px-4 py-3 text-[#33424B]"
        >
          Verificando a cadeia de hashes…
        </div>
      )}
      {integ &&
        (integ.valido ? (
          <div
            role="status"
            className="flex items-center gap-[10px] rounded-lg border border-[#75E0A7] bg-[#DCFAE6] px-4 py-3 font-medium text-[#05603A]"
          >
            <ShieldCheck className="h-[22px] w-[22px] shrink-0" aria-hidden />
            <span>
              Integridade verificada: {integ.verificados} registros em ordem de sequência. Último
              registro: seq {integ.ultimoSeq}, hash{' '}
              <span className="font-mono text-[13px]">{integ.ultimoHash.slice(0, 16)}…</span>
            </span>
          </div>
        ) : (
          <Alert tom="vermelho" role="alert" titulo="ADULTERAÇÃO DETECTADA NA TRILHA">
            O primeiro registro inconsistente é o de sequência{' '}
            <strong>{integ.primeiroSeqInvalido}</strong> (
            {integ.motivo === 'hash_divergente'
              ? 'o conteúdo não bate com o hash gravado'
              : integ.motivo === 'hash_anterior_incoerente'
                ? 'o encadeamento com o registro anterior está quebrado'
                : integ.motivo === 'selo_divergente'
                  ? 'a cadeia não bate com o selo diário: foi recalculada depois de alterada'
                  : 'há lacuna na sequência'}
            ). Os {integ.verificados} registros anteriores estão íntegros. Preserve o arquivo
            exportado e acione o síndico.
          </Alert>
        ))}
    </>
  )
}
