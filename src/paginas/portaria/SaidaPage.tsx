// Registrar saída (UC07, RF-12; tela T06b). Busca rápida entre quem está DENTRO agora (a mesma consulta de "Presentes
// agora", GET /acessos/presentes), escolha por teclado (setas/Enter) ou toque, confirmação com o resumo da entrada e
// volta à busca para a próxima saída. `?entrada=<uuid>` abre já com a entrada escolhida (atalho da gaveta do evento).
//
// Filtro local por nome, categoria, tipo de visita, empresa/serviço e destino ("D-32", "d32", área comum). CPF: a
// lista de presentes não traz documento (minimização), então um termo só de dígitos (3+) também consulta a busca de
// pessoas que já existe (POST /pessoas/busca, termo no corpo) e cruza pelo id da pessoa. A API casa pelo COMEÇO do CPF
// com 3 a 5 dígitos (máscara nova, 5 visíveis) e pelo meio com 3 a 6 só nos cadastros antigos ("***.456.789-**"); 11
// dígitos, pelo HMAC. De 6 a 10 a máscara nova não casa (0042) e a linha de status pede os 11 (dicaBuscaCpf).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Alert } from '@/componentes/Alert'
import { BotaoLink } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { Command, CommandPrimitive } from '@/componentes/ui/command'
import { dicaBuscaCpf } from '@/domain/cpf'
import type { EventoView } from '@/domain/types'
import { mensagemErro, useAgora } from '@/app/useAsync'
import { ordenarParaSaida, usePresentes } from './presentes'
import { ConfirmarSaidaModal, SaidaRetroativaModal } from './saida'
import { ErroCarregar } from '@/componentes/Carregando'
import { useBuscaPorCpf } from './saida/consultas'
import { ListaPresentes } from './saida/ListaPresentes'
import { casaPresente } from './saida/regras'
import { useEntradaParam } from './saida/useEntradaParam'

export { casaPresente, digitosCpf } from './saida/regras'

export function SaidaPage() {
  const agora = useAgora(15000)
  const lista = usePresentes()
  const [q, setQ] = useState('')
  const [selecionada, setSelecionada] = useState<EventoView | null>(null)
  const [retro, setRetro] = useState<EventoView | null>(null)
  const [avisoParam, setAvisoParam] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)

  const { cpf, porCpf, docPorPessoa, buscandoCpf } = useBuscaPorCpf(q)

  const achados = useMemo(
    () =>
      ordenarParaSaida(
        (lista.data ?? []).filter((e) => casaPresente(e, q) || docPorPessoa.has(e.pessoaId)),
        agora,
      ),
    [lista.data, q, docPorPessoa, agora],
  )

  useEffect(() => {
    buscaRef.current?.focus()
  }, [])
  // O cmdk fixa aria-expanded="true" no campo; aqui ele reflete se há resultados visíveis.
  useLayoutEffect(() => {
    buscaRef.current?.setAttribute('aria-expanded', String(achados.length > 0))
  })

  // Voltou da confirmação (registrou ou desistiu): foco na busca para a próxima saída. Roda depois de o modal devolver
  // o foco ao elemento anterior (efeito do pai depois da limpeza do filho).
  const anterior = useRef<EventoView | null>(null)
  useEffect(() => {
    if (anterior.current && !selecionada && !retro) buscaRef.current?.focus()
    anterior.current = selecionada ?? retro
  }, [selecionada, retro])

  useEntradaParam(lista.data, setSelecionada, setAvisoParam)

  function aposSaida() {
    setSelecionada(null)
    setRetro(null)
    setQ('')
  }

  const total = (lista.data ?? []).length
  const dicaCpf = dicaBuscaCpf(q)
  const contagem = lista.isPending
    ? 'Carregando quem está dentro…'
    : buscandoCpf
      ? 'Buscando pelo CPF…'
      : q.trim()
        ? `${achados.length} de ${total} ${total === 1 ? 'pessoa dentro' : 'pessoas dentro'}`
        : `${total} ${total === 1 ? 'pessoa dentro' : 'pessoas dentro'} agora`
  const status = dicaCpf ? `${contagem} · ${dicaCpf}` : contagem

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Registrar saída"
        descricao="Busque quem está dentro, escolha com as setas e Enter, e confirme. A entrada não é alterada: a saída é um novo registro ligado a ela."
        acoes={
          <BotaoLink to="/pessoas" variante="contorno">
            Ver presentes agora
          </BotaoLink>
        }
      />
      {lista.error && (
        <ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} />
      )}
      {avisoParam && (
        <Alert tom="ambar" role="status">
          {avisoParam}
        </Alert>
      )}
      {porCpf.isError && cpf && (
        <Alert tom="vermelho" role="alert">
          {mensagemErro(porCpf.error)}
        </Alert>
      )}

      <Command shouldFilter={false} loop label="Buscar quem está dentro" className="gap-3">
        <div className="flex flex-col gap-[6px]">
          {/* O cmdk dá ao campo o próprio id e o rotula pelo `label` do Command (texto visível só para quem enxerga) */}
          <span aria-hidden className="text-[14px] font-medium">
            Buscar quem está dentro
          </span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#56616B]"
              strokeWidth={2}
              aria-hidden
            />
            <CommandPrimitive.Input
              ref={buscaRef}
              value={q}
              onValueChange={setQ}
              autoComplete="off"
              aria-describedby="busca-saida-status"
              placeholder="Nome, início do CPF, unidade (ex.: D-32) ou tipo de visita"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && q) {
                  e.preventDefault()
                  setQ('')
                }
              }}
              className="input h-[52px] pl-10 text-[16px]"
            />
          </div>
          <p id="busca-saida-status" role="status" className="text-[13px] text-[#56616B]">
            {status}
          </p>
        </div>

        <ListaPresentes
          carregando={lista.isLoading}
          vazio={!lista.isPending && total === 0 && !lista.error}
          total={total}
          achados={achados}
          q={q}
          agora={agora}
          buscandoCpf={buscandoCpf}
          docPorPessoa={docPorPessoa}
          onSelect={setSelecionada}
        />
      </Command>

      {selecionada && (
        <ConfirmarSaidaModal
          entrada={selecionada}
          agora={agora}
          onClose={() => setSelecionada(null)}
          onFeito={aposSaida}
          onRetroativa={() => {
            setRetro(selecionada)
            setSelecionada(null)
          }}
        />
      )}
      {retro && (
        <SaidaRetroativaModal entrada={retro} onClose={() => setRetro(null)} onFeito={aposSaida} />
      )}
    </div>
  )
}
