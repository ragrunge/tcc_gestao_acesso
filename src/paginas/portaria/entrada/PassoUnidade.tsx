import type { RefObject } from 'react'
import type { PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { TowerUnitPicker, type TowerUnitPickerHandle } from '@/componentes/TowerUnitPicker'
import type { useCatalogo } from '@/app/catalogo'
import type { TipoVisita, VeiculoAcesso } from '@/domain/types'
import { BlocoVeiculo, type VeiculoForm } from './BlocoVeiculo'
import { SeletorTipoVisita } from './SeletorTipoVisita'

export function PassoUnidade({
  pessoa,
  comPrazo,
  tipoEscolhido,
  setTipoVisita,
  destino,
  trocarDestino,
  emArea,
  catalogo,
  areaId,
  escolherArea,
  pickerRef,
  bloco,
  numero,
  mudarUnidade,
  limparUnidade,
  propriaUnidade,
  veiculo,
  setVeiculo,
  ultimoVeiculo,
}: {
  pessoa: PessoaBusca
  comPrazo: boolean
  tipoEscolhido: TipoVisita | null
  setTipoVisita: (t: TipoVisita) => void
  destino: 'unidade' | 'area_comum'
  trocarDestino: (d: 'unidade' | 'area_comum') => void
  emArea: boolean
  catalogo: ReturnType<typeof useCatalogo>
  areaId: string
  escolherArea: (id: string) => void
  pickerRef: RefObject<TowerUnitPickerHandle>
  bloco: string | null
  numero: string | null
  mudarUnidade: (b: string | null, n: string | null) => void
  limparUnidade: () => void
  propriaUnidade: boolean
  veiculo: VeiculoForm
  setVeiculo: (v: VeiculoForm) => void
  ultimoVeiculo: VeiculoAcesso | null
}) {
  return (
    <div className="flex flex-col gap-3">
      {pessoa.categoria === 'funcionario' && (
        <Alert tom="petroleo">
          Funcionário do condomínio: a unidade é opcional quando a entrada é por Escala.
        </Alert>
      )}
      {/* Ordem do protótipo: tipo de visita (define o prazo), destino do prestador, bloco e apartamento, veículo */}
      {comPrazo && tipoEscolhido && (
        <SeletorTipoVisita valor={tipoEscolhido} onChange={setTipoVisita} />
      )}
      {pessoa.categoria === 'prestador' && (
        <div role="radiogroup" aria-label="Destino do prestador" className="flex gap-2">
          {(['unidade', 'area_comum'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={destino === d}
              onClick={() => trocarDestino(d)}
              className={`h-[44px] rounded-full border px-4 text-[14px] font-medium ${destino === d ? 'border-[#0B5563] bg-[#0B5563] text-white' : 'border-[#B9C3CA] bg-white hover:bg-[#EEF2F4]'}`}
            >
              {d === 'unidade' ? 'Unidade' : 'Área comum'}
            </button>
          ))}
        </div>
      )}
      {emArea ? (
        <div className="flex flex-col gap-2">
          <span id="rot-area" className="text-[14px] font-medium">
            Área comum
          </span>
          <div role="radiogroup" aria-labelledby="rot-area" className="flex flex-wrap gap-2">
            {catalogo.areasComuns
              .filter((a) => a.ativo)
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={areaId === a.id}
                  onClick={() => escolherArea(a.id)}
                  className={`h-11 rounded-lg border-2 px-4 font-medium max-lg:h-[44px] ${areaId === a.id ? 'border-[#0B5563] bg-[#F0F8F9]' : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'}`}
                >
                  {a.nome}
                </button>
              ))}
          </div>
          <span className="text-[13px] text-[#56616B]">
            Na área comum a entrada é por autorização prévia da administração ou por exceção do
            porteiro (RF-36).
          </span>
        </div>
      ) : (
        <TowerUnitPicker
          ref={pickerRef}
          bloco={bloco}
          numero={numero}
          onChange={mudarUnidade}
          onAlterar={limparUnidade}
          onComplete={() => undefined}
        />
      )}
      {propriaUnidade && (
        <Alert tom="ambar" role="alert">
          Morador não registra entrada na própria unidade no MVP.
        </Alert>
      )}
      <BlocoVeiculo valor={veiculo} onChange={setVeiculo} ultimo={ultimoVeiculo} />
    </div>
  )
}
