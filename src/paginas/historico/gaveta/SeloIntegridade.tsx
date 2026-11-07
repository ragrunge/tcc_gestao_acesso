import { ShieldAlert, ShieldCheck } from 'lucide-react'

export function SeloIntegridade({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <div className="rounded-[10px] border border-[#D5DDE2] bg-[#EEF2F4] px-[14px] py-3 text-[#33424B]">
        Verificando integridade…
      </div>
    )
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-[10px] border px-[14px] py-3 ${ok ? 'border-[#75E0A7] bg-[#DCFAE6] text-[#05603A]' : 'border-[#FDA29B] bg-[#FEE4E2] text-[#B42318]'}`}
    >
      {ok ? (
        <ShieldCheck className="h-[26px] w-[26px] shrink-0" aria-hidden />
      ) : (
        <ShieldAlert className="h-[26px] w-[26px] shrink-0" aria-hidden />
      )}
      <div className="min-w-0 font-semibold">
        {ok ? 'Integridade verificada' : 'Integridade comprometida'}
      </div>
    </div>
  )
}
