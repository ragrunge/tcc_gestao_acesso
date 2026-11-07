import type { Autorizador } from '@/api'
import { Alert } from '@/componentes/Alert'
import { SeloVinculo } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'

export function SeletorMorador({
  autorizadores,
  codUnidade,
  residenteId,
  setResidenteId,
  podeRecusar,
  recusando,
  registrarRecusa,
}: {
  autorizadores: Autorizador[]
  codUnidade: string | null
  residenteId: string | null
  setResidenteId: (id: string) => void
  podeRecusar: boolean
  recusando: boolean
  registrarRecusa: () => Promise<void>
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span id="rot-morador" className="text-[14px] font-medium">
          Morador que autorizou <span className="text-[#B42318]">*</span>{' '}
          <span className="font-normal text-[#56616B]">
            · somente vínculo aprovado na {codUnidade}
          </span>
        </span>
        {autorizadores.length === 0 ? (
          <Alert tom="ambar">
            Nenhum morador com vínculo válido nesta unidade. Vínculo pendente não dá acesso de
            morador. Use outro meio.
          </Alert>
        ) : (
          <div role="radiogroup" aria-labelledby="rot-morador" className="flex flex-wrap gap-2">
            {autorizadores.map((a) => (
              <label
                key={a.pessoa.id}
                className={`flex h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-4 max-lg:h-[44px] [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-[3px] [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#0B5563] ${
                  residenteId === a.pessoa.id
                    ? 'border-[#0B5563] bg-[#F0F8F9]'
                    : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'
                }`}
              >
                <input
                  type="radio"
                  name="morador"
                  className="sr-only"
                  checked={residenteId === a.pessoa.id}
                  onChange={() => setResidenteId(a.pessoa.id)}
                />
                <span className="font-medium">{a.pessoa.nome}</span>
                <span className="text-[13px] text-[#56616B]">
                  {a.vinculo.tipo === 'proprietario'
                    ? 'Proprietário(a)'
                    : a.vinculo.tipo === 'inquilino'
                      ? 'Inquilino(a)'
                      : 'Dependente'}
                </span>
                {a.vinculo.status === 'legado' && <SeloVinculo status="legado" tamanho="xs" />}
              </label>
            ))}
          </div>
        )}
      </div>
      {residenteId && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-[#C5CDD3] px-4 py-3">
          <Button
            disabled={!podeRecusar}
            carregando={recusando}
            onClick={() => void registrarRecusa()}
          >
            Morador recusou
          </Button>
          <span className="text-[13px] text-[#56616B]">
            O morador não autorizou a visita: grava o evento “Recusado” na trilha, sem registrar
            entrada, e limpa a tela.
          </span>
        </div>
      )}
    </>
  )
}
