import { Clock } from 'lucide-react'
import type { PessoaBusca } from '@/api'
import { Button } from '@/componentes/Button'
import { PRAZO_PADRAO_MIN } from '@/domain/rules'
import { mascaraPlaca } from '@/domain/cpf'
import { fmtData, fmtHora } from '@/domain/time'
import {
  ROTULO_MEIO,
  ROTULO_PAPEL,
  ROTULO_TIPO_VISITA,
  type MeioAutorizacao,
  type TipoVisita,
} from '@/domain/types'
import type { useAuth } from '@/auth/AuthContext'
import { fmtPrazo } from './constantes'
import type { VeiculoForm } from './BlocoVeiculo'

export function ResumoRegistro({
  usuario,
  agora,
  pessoa,
  emArea,
  rotuloDestino,
  autorizadoPor,
  meio,
  veiculo,
  placaNormalizada,
  tipoResumo,
  saiAte,
  quando,
  retroativo,
  horaReal,
  pronto,
  enviando,
  faltas,
  confirmar,
  cancelar,
}: {
  usuario: NonNullable<ReturnType<typeof useAuth>['usuario']>
  agora: number
  pessoa: PessoaBusca | null
  emArea: boolean
  rotuloDestino: string
  autorizadoPor: string
  meio: MeioAutorizacao | null
  veiculo: VeiculoForm
  placaNormalizada: string | null
  tipoResumo: TipoVisita | null
  saiAte: number | null
  quando: number | null
  retroativo: boolean
  horaReal: string
  pronto: boolean
  enviando: boolean
  faltas: string[]
  confirmar: () => Promise<void>
  cancelar: () => void
}) {
  const rotuloResumo = 'text-[13px] text-[#56616B]'
  return (
    <aside
      aria-label="Resumo do registro"
      className="flex flex-col gap-[14px] rounded-[10px] border border-[#DCE1E5] bg-white p-5 xl:sticky xl:top-0 xl:self-start"
    >
      <h2 className="text-[17px] font-semibold">Resumo do registro</h2>
      <div className="flex flex-col gap-0.5">
        <span className={rotuloResumo}>Pessoa</span>
        <span className="font-semibold">{pessoa?.nome ?? '—'}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={rotuloResumo}>{emArea ? 'Área comum' : 'Unidade'}</span>
        <span className="font-mono text-[24px] font-semibold text-[#0B3F49]">{rotuloDestino}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={rotuloResumo}>Autorizado por</span>
        <span className="font-semibold">{autorizadoPor}</span>
        <span className="text-[14px] text-[#33424B]">{meio ? ROTULO_MEIO[meio] : ''}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={rotuloResumo}>Veículo</span>
        <span className="font-semibold">
          {!veiculo.comVeiculo
            ? 'A pé'
            : placaNormalizada
              ? [mascaraPlaca(placaNormalizada), veiculo.modelo.trim(), veiculo.cor.trim()]
                  .filter(Boolean)
                  .join(' · ')
              : '—'}
        </span>
      </div>
      {tipoResumo && (
        <div className="flex flex-col gap-0.5">
          <span className={rotuloResumo}>Tipo de visita</span>
          <span className="font-semibold">
            {ROTULO_TIPO_VISITA[tipoResumo]} · prazo {fmtPrazo(PRAZO_PADRAO_MIN[tipoResumo])}
          </span>
          {saiAte !== null && (
            <span className="flex items-center gap-1.5 font-mono text-[14px] text-[#33424B]">
              <Clock className="h-4 w-4" aria-hidden />
              Sai até {fmtHora(saiAte)}
              {fmtData(saiAte) !== fmtData(quando ?? agora) ? ` de ${fmtData(saiAte)}` : ''}
            </span>
          )}
        </div>
      )}
      {retroativo && (
        <div className="flex flex-col gap-0.5">
          <span className={rotuloResumo}>Data e hora reais</span>
          <span className="font-semibold">
            {quando !== null && horaReal ? `${fmtData(quando)} ${fmtHora(quando)}` : '—'}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <span className={rotuloResumo}>Registrado por</span>
        <span className="font-semibold">
          {ROTULO_PAPEL[usuario.papel]} {usuario.nome} · {fmtHora(agora)}
        </span>
      </div>
      <div className="h-px bg-[#E6EAED]" />
      {pronto ? (
        <button
          type="button"
          onClick={() => void confirmar()}
          className="flex h-[52px] items-center justify-center gap-[10px] rounded-lg bg-[#0B5563] text-[16px] font-semibold text-white hover:bg-[#08434E]"
        >
          {retroativo ? 'Confirmar lançamento' : 'Confirmar entrada'}{' '}
          <kbd className="rounded-[5px] border border-white/50 px-[7px] py-0.5 font-mono text-[13px]">
            Enter
          </kbd>
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="h-[52px] cursor-not-allowed rounded-lg border border-[#D5DDE2] bg-[#EEF2F4] text-[16px] font-semibold text-[#6B7780]"
          >
            {enviando ? 'Registrando…' : retroativo ? 'Confirmar lançamento' : 'Confirmar entrada'}
            {!enviando && (
              <kbd
                aria-hidden
                className="ml-[10px] rounded-[5px] border border-[#B9C3CA] px-[7px] py-0.5 font-mono text-[13px]"
              >
                Enter
              </kbd>
            )}
          </button>
          {faltas.length > 0 && (
            <span className="text-[13px] text-[#56616B]">Falta: {faltas.join(', ')}</span>
          )}
        </>
      )}
      <Button atalho="Esc" onClick={cancelar}>
        Cancelar
      </Button>
    </aside>
  )
}
