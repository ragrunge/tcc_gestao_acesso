import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/componentes/ui/badge'
import { CommandItem } from '@/componentes/ui/command'
import { ROTULO_CATEGORIA, ROTULO_TIPO_VISITA, type EventoView } from '@/domain/types'
import { descreverVeiculo, quandoCurto, textoAutorizacao } from '@/paginas/common/evento'
import { CelPermanencia, destaquePresente, estadoDoPresente } from '../presentes'
import { destinoDe } from '../saida'
import { COLUNAS } from './constantes'
import type { useBuscaPorCpf } from './consultas'

type Props = {
  e: EventoView
  agora: number
  docPorPessoa: ReturnType<typeof useBuscaPorCpf>['docPorPessoa']
  onSelect: (e: EventoView) => void
}

export function LinhaPresente({ e, agora, docPorPessoa, onSelect }: Props) {
  const estado = estadoDoPresente(e, agora)
  const fundo = destaquePresente(e, agora)
  return (
    <CommandItem
      value={e.id}
      onSelect={() => onSelect(e)}
      className={`mb-2 grid grid-cols-2 items-start gap-x-3 gap-y-1 rounded-[10px] border border-[#DCE1E5] px-4 py-3 md:mb-0 md:items-center md:rounded-none md:border-0 md:border-b md:border-[#EEF1F3] md:px-5 ${COLUNAS} ${
        fundo === 'vermelho' ? 'bg-[#FEF3F2]' : fundo === 'ambar' ? 'bg-[#FFFAEB]' : 'bg-white'
      }`}
    >
      <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 md:col-span-1">
        <span className="truncate font-semibold">{e.pessoaNome}</span>
        {estado === 'expirado' && (
          <Badge variant="vermelho">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            Expirado
          </Badge>
        )}
        {docPorPessoa.has(e.pessoaId) && (
          <span className="font-mono text-[13px] text-[#56616B]">
            {docPorPessoa.get(e.pessoaId)}
          </span>
        )}
        {e.veiculo && (
          <span className="font-mono text-[13px] text-[#56616B]">
            <span className="sr-only">Veículo </span>
            {descreverVeiculo(e.veiculo)}
          </span>
        )}
      </span>
      <span className="text-[14px]">
        {ROTULO_CATEGORIA[e.categoriaPessoa]}
        {e.permanencia && (
          <span className="text-[#56616B]"> · {ROTULO_TIPO_VISITA[e.permanencia.tipoVisita]}</span>
        )}
      </span>
      <span className="font-mono font-semibold">
        <span className="sr-only">Destino </span>
        {destinoDe(e)}
      </span>
      <span className="font-mono text-[14px]">
        <span className="font-sans text-[#56616B] md:sr-only">Entrou </span>
        {quandoCurto(e.ocorridoEm, agora)}
      </span>
      <span className="text-[14px]">
        <CelPermanencia
          entradaEm={e.ocorridoEm}
          permanencia={e.permanencia ?? null}
          agora={agora}
        />
      </span>
      <span className="col-span-2 min-w-0 truncate text-[14px] text-[#33424B] md:col-span-1">
        <span className="text-[#56616B] md:sr-only">Autorizado por </span>
        {textoAutorizacao(e)}
      </span>
    </CommandItem>
  )
}
