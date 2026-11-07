import { Link } from 'react-router-dom'
import { ErroCarregar, Esqueleto, Osso } from '@/componentes/Carregando'
import { Vazio } from '@/componentes/Table'
import { ROTULO_CATEGORIA } from '@/domain/types'
import { quandoCurto } from '@/paginas/common/evento'
import { ANTECEDENCIA_ENTRADA_MS, HORAS_PREVISTOS } from '../previstos'
import type { PainelConsultas } from './consultas'

type Props = {
  previstos: PainelConsultas['previstos']
  agora: number
  podeRegistrar: boolean
}

export function PrevistosSecao({ previstos, agora, podeRegistrar }: Props) {
  return (
    <section
      aria-labelledby="previstos-titulo"
      className="rounded-[10px] border border-[#DCE1E5] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#E6EAED] px-4 py-4 md:px-5">
        <h2 id="previstos-titulo" className="text-[17px] font-semibold">
          Previstos nas próximas {HORAS_PREVISTOS} h
        </h2>
        <span className="text-[13px] text-[#56616B]">
          Autorização prévia vale agora ou passa a valer; pessoa ainda fora do condomínio
        </span>
      </div>
      {previstos.error && !previstos.data && (
        <div className="p-4">
          <ErroCarregar
            mensagem="Não foi possível carregar os previstos."
            onTentar={() => previstos.refetch()}
          />
        </div>
      )}
      {previstos.isLoading && (
        <Esqueleto rotulo="visitas previstas">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 border-b border-[#EEF1F3] px-4 py-[14px] last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 md:px-5"
            >
              <Osso className="h-3 w-[110px]" />
              <Osso className="h-3 w-[60%]" />
              <Osso className="h-3 w-[45%]" />
              <Osso className="h-[40px] w-[150px] rounded-lg" />
            </div>
          ))}
        </Esqueleto>
      )}
      {previstos.data && previstos.data.length > 0 && (
        <ul className="m-0 list-none p-0">
          {previstos.data.map((p) => (
            <li
              key={p.autorizacaoId}
              className="grid grid-cols-1 gap-1 border-b border-[#EEF1F3] px-4 py-[10px] last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3 md:px-5"
            >
              <span className="font-mono text-[14px] font-semibold">
                {p.inicio <= agora
                  ? `Agora, até ${quandoCurto(p.fim, agora)}`
                  : `${quandoCurto(p.inicio, agora)} – ${quandoCurto(p.fim, agora)}`}
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{p.nome}</span>
                <span className="text-[13px] text-[#56616B]">{ROTULO_CATEGORIA[p.categoria]}</span>
              </span>
              <span className="text-[14px]">
                <span className="text-[#56616B]">
                  {p.destino.tipo === 'unidade' ? 'Unidade ' : 'Área comum: '}
                </span>
                <span className="font-mono font-semibold">{p.destino.rotulo}</span>
              </span>
              {podeRegistrar && p.inicio - agora <= ANTECEDENCIA_ENTRADA_MS && (
                <Link
                  to={`/entrada?pessoa=${p.pessoaId}&${p.destino.tipo === 'unidade' ? 'unidade' : 'area'}=${p.destino.id}`}
                  aria-label={`Registrar entrada de ${p.nome}`}
                  className="inline-flex h-[40px] items-center justify-center rounded-lg border border-[#0B5563] bg-white px-3 text-[14px] font-semibold !text-[#0B5563] hover:bg-[#F0F8F9]"
                >
                  Registrar entrada
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {previstos.data?.length === 0 && (
        <Vazio>Nenhuma visita prevista nas próximas {HORAS_PREVISTOS} h.</Vazio>
      )}
    </section>
  )
}
