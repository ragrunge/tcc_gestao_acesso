import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { ROTULO_CATEGORIA } from '@/domain/types'
import { dicaBuscaCpf } from '@/domain/cpf'
import { temModalAberto } from '@/componentes/Modal'
import { useBuscaGlobal } from '../consultas'
import { useCatalogo } from '../catalogo'

export function BuscaGlobal({ onPessoa }: { onPessoa: (id: string) => void }) {
  const nav = useNavigate()
  const { codigo } = useCatalogo()
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const busca = useBuscaGlobal(q)
  // Abaixo de 2 caracteres ou com erro, a lista some (o placeholder não pode mostrar o resultado anterior).
  const res = q.trim().length >= 2 && !busca.isError ? (busca.data ?? null) : null
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(alvo.tagName) && !temModalAberto()) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])

  const vazio = res && res.pessoas.length === 0 && res.unidades.length === 0
  const dica = dicaBuscaCpf(q)
  const item =
    'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-md bg-white px-[10px] py-[6px] text-left hover:bg-[#EEF2F4]'
  return (
    <div
      className="relative w-full max-w-[520px] flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setAberto(false)
      }}
    >
      <label htmlFor="busca-global" className="sr-only">
        Buscar por nome, documento, unidade ou placa
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-[13px] h-[18px] w-[18px] text-[#56616B]"
        strokeWidth={2}
        aria-hidden
      />
      <input
        id="busca-global"
        ref={inputRef}
        placeholder="Buscar por nome, documento, unidade ou placa"
        value={q}
        className="h-[44px] w-full rounded-lg border border-[#C5CDD3] bg-[#F3F5F6] pl-10 pr-3 text-[14.5px] text-ink placeholder:text-[#56616B]"
        autoComplete="off"
        aria-describedby={aberto && res && dica ? 'busca-global-dica' : undefined}
        onChange={(e) => {
          setQ(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAberto(false)
            setQ('')
          }
        }}
      />
      {aberto && res && (
        <div
          className="absolute inset-x-0 top-[50px] z-40 flex max-h-96 flex-col gap-0.5 overflow-y-auto rounded-[10px] border border-[#DCE1E5] bg-white p-[6px] shadow-[0_12px_32px_rgba(16,38,44,0.16)]"
          role="listbox"
          aria-label="Resultados da busca"
        >
          {vazio && (
            <div className="px-[10px] py-3 text-[#56616B]">Nenhum resultado para “{q}”.</div>
          )}
          {dica && (
            <p
              id="busca-global-dica"
              role="status"
              className="px-[10px] py-2 text-[13px] text-[#56616B]"
            >
              {dica}
            </p>
          )}
          {res.unidades.map((u, i) => (
            <button
              key={u.id + i}
              type="button"
              role="option"
              aria-selected={false}
              className={item}
              onClick={() => {
                setAberto(false)
                setQ('')
                nav(`/unidades/${u.id}`)
              }}
            >
              <span className="flex flex-col">
                <span className="font-mono font-semibold">{codigo(u.id)}</span>
                <span className="text-[13px] text-[#56616B]">{u.motivo}</span>
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#56616B]">
                Unidade
              </span>
            </button>
          ))}
          {res.pessoas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={false}
              className={item}
              onClick={() => {
                setAberto(false)
                setQ('')
                onPessoa(p.id)
              }}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.nome}</span>
                <span className="font-mono text-[13px] text-[#56616B]">{p.documentoMascarado}</span>
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#56616B]">
                {ROTULO_CATEGORIA[p.categoria]}
              </span>
            </button>
          ))}
          {res.temMaisPessoas && (
            <div className="px-[10px] py-2 text-[13px] text-[#56616B]">
              Há mais pessoas com esse termo: continue digitando para refinar.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
