import {
  BarraFiltros,
  CampoFiltro,
  CONTROLE,
  ContagemResultado,
  FiltroBusca,
  FiltroCheck,
  FiltroPeriodo,
  FiltroUnidade,
  naUrl,
  type useFiltrosUrl,
  type useFiltroUnidade,
  type usePeriodoUrl,
} from '@/componentes/Filtros'
import { ROTULO_MEIO, type MeioAutorizacao } from '@/domain/types'
import { ROTULO_TIPO, TIPOS } from './constantes'

export function FiltrosHistorico({
  ativos,
  onLimpar,
  total,
  pessoa,
  setPessoa,
  placa,
  setPlaca,
  periodo,
  unid,
  operadorId,
  operadores,
  meio,
  tipo,
  exc,
  retro,
  gravar,
}: {
  ativos: number
  onLimpar: () => void
  total: number
  pessoa: string
  setPessoa: (v: string) => void
  placa: string
  setPlaca: (v: string) => void
  periodo: ReturnType<typeof usePeriodoUrl>
  unid: ReturnType<typeof useFiltroUnidade>
  operadorId: string
  operadores: [string, string][] | undefined
  meio: '' | MeioAutorizacao
  tipo: (typeof TIPOS)[number]
  exc: boolean
  retro: boolean
  gravar: ReturnType<typeof useFiltrosUrl>['gravar']
}) {
  return (
    <BarraFiltros
      ativos={ativos}
      onLimpar={onLimpar}
      principalAtivo={!!pessoa || !!placa}
      resultado={<ContagemResultado n={total} singular="registro" plural="registros" />}
      principal={
        <FiltroBusca rotulo="Pessoa" value={pessoa} onChange={setPessoa} placeholder="Nome" />
      }
    >
      <FiltroBusca
        rotulo="Placa"
        value={placa}
        onChange={setPlaca}
        placeholder="ABC1D23"
        largura="md:w-44"
      />
      <FiltroPeriodo de={periodo.de} ate={periodo.ate} onChange={periodo.alterar} atalhos />
      <FiltroUnidade f={unid} />
      <CampoFiltro rotulo="Porteiro" largura="md:w-48">
        <select
          className={CONTROLE}
          value={operadorId}
          onChange={(e) => gravar({ op: naUrl(e.target.value, '') })}
        >
          <option value="">Todos</option>
          {(operadores ?? []).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </CampoFiltro>
      <CampoFiltro rotulo="Meio de autorização" largura="md:w-52">
        <select
          className={CONTROLE}
          value={meio}
          onChange={(e) => gravar({ meio: naUrl(e.target.value, '') })}
        >
          <option value="">Todos</option>
          {(Object.keys(ROTULO_MEIO) as MeioAutorizacao[]).map((m) => (
            <option key={m} value={m}>
              {ROTULO_MEIO[m]}
            </option>
          ))}
        </select>
      </CampoFiltro>
      {/* Segunda linha no desktop (Claude Design): tipo em pílulas, os dois "Somente", a contagem e o Limpar */}
      <div aria-hidden className="hidden md:block md:h-0 md:basis-full" />
      <fieldset className="flex w-full flex-col gap-1.5 md:w-auto md:flex-row md:items-center md:gap-2 md:self-center">
        <legend className="float-left mb-1.5 text-[13px] font-medium text-[#33424B] md:mb-0 md:mr-1">
          Tipo de registro
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.filter(Boolean).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => gravar({ tipo: tipo === t ? undefined : t })}
              className={`h-[44px] rounded-full border px-[14px] text-[14px] font-medium md:mouse:h-9 ${tipo === t ? 'border-[#0B5563] bg-[#0B5563] text-white' : 'border-[#B9C3CA] bg-white text-ink hover:bg-[#EEF2F4]'}`}
            >
              {ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
      </fieldset>
      <FiltroCheck
        rotulo="Somente exceções"
        checked={exc}
        onChange={(v) => gravar({ exc: v ? '1' : undefined })}
      />
      <FiltroCheck
        rotulo="Somente retroativos"
        checked={retro}
        onChange={(v) => gravar({ retro: v ? '1' : undefined })}
      />
    </BarraFiltros>
  )
}
