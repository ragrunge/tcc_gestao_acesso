import { partes } from '@/domain/time'
import { useAgora } from '../useAsync'

const DIAS_EXTENSO = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

export function Relogio() {
  const t = useAgora(5000)
  const p = partes(t)
  const d = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="hidden text-right leading-[1.2] md:block" aria-label="Horário do sistema">
      <div className="font-mono text-[19px] font-semibold">
        {d(p.hh)}:{d(p.mm)}
      </div>
      <div className="text-[12px] text-[#56616B]">
        {DIAS_EXTENSO[p.dow]}, {d(p.dia)}/{d(p.mes)}/{p.ano}
      </div>
    </div>
  )
}
