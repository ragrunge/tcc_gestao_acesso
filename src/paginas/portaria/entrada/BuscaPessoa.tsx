import type { MutableRefObject, RefObject } from 'react'
import { Plus, Search } from 'lucide-react'
import type { PessoaBusca, PrevistoView } from '@/api'
import { Avatar } from '@/componentes/UnitTag'
import { ROTULO_CATEGORIA } from '@/domain/types'
import { fmtHora } from '@/domain/time'
import { rotuloPessoa } from './constantes'

export function BuscaPessoa({
  buscaRef,
  enterPendente,
  query,
  setQuery,
  sugestoes,
  idx,
  setIdx,
  mais,
  buscando,
  dicaCpf,
  previstosAgora,
  idxPrevisto,
  setIdxPrevisto,
  escolherPrevisto,
  escolherPessoa,
  agora,
  iniciarCadastro,
}: {
  buscaRef: RefObject<HTMLInputElement>
  enterPendente: MutableRefObject<boolean>
  query: string
  setQuery: (v: string) => void
  sugestoes: PessoaBusca[]
  idx: number
  setIdx: (v: number | ((i: number) => number)) => void
  mais: boolean
  buscando: boolean
  dicaCpf: string | null
  previstosAgora: PrevistoView[]
  idxPrevisto: number
  setIdxPrevisto: (v: number | ((i: number) => number)) => void
  escolherPrevisto: (p: PrevistoView) => void
  escolherPessoa: (p: PessoaBusca) => Promise<void>
  agora: number
  iniciarCadastro: () => void
}) {
  return (
    <>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-[14px] top-[14px] h-5 w-5 text-[#56616B]"
          strokeWidth={2}
          aria-hidden
        />
        <label htmlFor="busca-pessoa" className="sr-only">
          Buscar por nome, documento ou placa
        </label>
        <input
          id="busca-pessoa"
          ref={buscaRef}
          autoComplete="off"
          role="combobox"
          aria-expanded={sugestoes.length > 0}
          aria-describedby="busca-pessoa-dica"
          aria-controls={
            !query.trim() && previstosAgora.length > 0 ? 'lista-previstos' : 'lista-sugestoes'
          }
          aria-activedescendant={
            !query.trim() && previstosAgora[idxPrevisto]
              ? `prev-${previstosAgora[idxPrevisto].autorizacaoId}`
              : sugestoes[idx]
                ? `sug-${sugestoes[idx].id}`
                : undefined
          }
          className="h-12 w-full rounded-lg border border-[#9AA7B0] bg-white pl-11 pr-[14px] text-[16px] text-ink placeholder:text-[#56616B]/70"
          value={query}
          onChange={(e) => {
            enterPendente.current = false
            setQuery(e.target.value)
          }}
          placeholder="Nome, início do CPF ou placa da pessoa"
          onKeyDown={(e) => {
            // Busca vazia: as setas e o Enter andam pelos previstos para agora
            const naLista = !query.trim() && previstosAgora.length > 0
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (naLista) setIdxPrevisto((i) => Math.min(i + 1, previstosAgora.length - 1))
              else setIdx((i) => Math.min(i + 1, sugestoes.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (naLista) setIdxPrevisto((i) => Math.max(i - 1, 0))
              else setIdx((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (naLista) {
                if (previstosAgora[idxPrevisto]) escolherPrevisto(previstosAgora[idxPrevisto])
              } else if (sugestoes[idx]) void escolherPessoa(sugestoes[idx])
              else if (query.trim()) enterPendente.current = true
            }
          }}
        />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <p
          id="busca-pessoa-dica"
          role="status"
          className={dicaCpf ? 'px-0.5 text-[13px] text-[#56616B]' : 'sr-only'}
        >
          {dicaCpf ?? ''}
        </p>
        <ul
          id="lista-sugestoes"
          role="listbox"
          aria-label="Pessoas encontradas"
          className="flex flex-col gap-1 empty:hidden"
        >
          {sugestoes.map((p, i) => (
            <li key={p.id} id={`sug-${p.id}`} role="option" aria-selected={i === idx}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => void escolherPessoa(p)}
                onMouseEnter={() => setIdx(i)}
                className={`grid min-h-[56px] w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-3 gap-y-0.5 rounded-lg border px-[10px] py-[6px] text-left hover:bg-[#EEF5F6] md:grid-cols-[44px_minmax(0,1fr)_150px_110px_190px] ${
                  i === idx ? 'border-[#0B5563] bg-[#F0F8F9]' : 'border-[#E1E6EA] bg-white'
                }`}
              >
                <Avatar nome={p.nome} />
                <span className="truncate font-semibold">{p.nome}</span>
                <span className="col-start-2 font-mono text-[14px] text-[#33424B] md:col-start-auto">
                  {p.documentoMascarado}
                </span>
                <span className="col-start-2 truncate text-[14px] md:col-start-auto">
                  {rotuloPessoa(p)}
                </span>
                <span className="col-start-2 truncate text-[13px] text-[#56616B] md:col-start-auto">
                  Último: {p.ultimoAcesso}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {mais && (
          <p className="px-0.5 py-1 text-[13px] text-[#56616B]">Mais resultados — refine a busca</p>
        )}
        {query.trim() && !buscando && sugestoes.length === 0 && (
          <p className="px-0.5 py-1 text-[#56616B]">Nenhuma pessoa encontrada com “{query}”.</p>
        )}
        <button
          type="button"
          onClick={iniciarCadastro}
          className="flex min-h-[48px] items-center gap-[10px] rounded-lg border border-dashed border-[#9AA7B0] bg-white px-3 text-left font-semibold text-[#0B5563] hover:bg-[#EEF5F6]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
          Pessoa sem cadastro
        </button>
        {!query.trim() && previstosAgora.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            <span id="rot-previstos" className="px-0.5 text-[13px] font-medium text-[#56616B]">
              Previstos para agora · autorização prévia
            </span>
            <ul
              id="lista-previstos"
              role="listbox"
              aria-labelledby="rot-previstos"
              className="flex flex-col gap-1"
            >
              {previstosAgora.map((p, i) => (
                <li
                  key={p.autorizacaoId}
                  id={`prev-${p.autorizacaoId}`}
                  role="option"
                  aria-selected={i === idxPrevisto}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => escolherPrevisto(p)}
                    onMouseEnter={() => setIdxPrevisto(i)}
                    className={`grid min-h-[52px] w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-lg border px-[10px] py-[6px] text-left hover:bg-[#EEF5F6] md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_170px] ${
                      i === idxPrevisto
                        ? 'border-[#0B5563] bg-[#F0F8F9]'
                        : 'border-[#E1E6EA] bg-white'
                    }`}
                  >
                    <Avatar nome={p.nome} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{p.nome}</span>
                      <span className="text-[13px] text-[#56616B]">
                        {ROTULO_CATEGORIA[p.categoria]}
                      </span>
                    </span>
                    <span className="col-start-2 truncate text-[14px] md:col-start-auto">
                      <span className="text-[#56616B]">
                        {p.destino.tipo === 'unidade' ? 'Unidade ' : 'Área comum: '}
                      </span>
                      <span className="font-mono font-semibold">{p.destino.rotulo}</span>
                    </span>
                    <span className="col-start-2 font-mono text-[13px] text-[#56616B] md:col-start-auto">
                      {p.inicio <= agora
                        ? `até ${fmtHora(p.fim)}`
                        : `a partir de ${fmtHora(p.inicio)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sugestoes.length === 0 && !query.trim() && (
          <div className="px-0.5 py-1 text-[13px] text-[#56616B]">
            Digite o nome ou o documento. Use ↑ ↓ para escolher e Enter para selecionar.
          </div>
        )}
      </div>
    </>
  )
}
