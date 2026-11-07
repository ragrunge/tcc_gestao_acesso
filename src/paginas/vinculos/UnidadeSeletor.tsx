import { useMemo, useRef, useState } from 'react'
import type { Unidade } from '@/domain/types'
import { andarDoNumero, compararBlocos, compararUnidades, codigoUnidade } from '@/domain/units'
import { useCatalogo } from '@/app/catalogo'
import { Combobox, type OpcaoCombobox } from '@/componentes/ui/combobox'

/** Bloco/Torre e depois Apartamento, do catálogo (inclui as desativadas, como indisponíveis). */
export function UnidadeSeletor({
  valor,
  onChange,
  motivo,
  erro,
}: {
  valor: string | null
  onChange: (unidadeId: string | null) => void
  /** Motivo para o apartamento não poder ser escolhido (ex.: a pessoa já tem vínculo com ele). */
  motivo?: (u: Unidade) => string | null
  erro?: string
}) {
  const { unidades, agrupamento, porId } = useCatalogo()
  const atual = porId(valor)
  const [bloco, setBloco] = useState<string | null>(atual?.bloco ?? null)
  const aptoRef = useRef<HTMLButtonElement>(null)
  const blocos = useMemo((): OpcaoCombobox[] => {
    const por = new Map<string, { total: number; ativas: number }>()
    for (const u of unidades) {
      const c = por.get(u.bloco) ?? { total: 0, ativas: 0 }
      c.total++
      if (u.ativo) c.ativas++
      por.set(u.bloco, c)
    }
    return [...por.entries()]
      .sort((a, b) => compararBlocos(a[0], b[0]))
      .map(([b, c]) => ({
        valor: b,
        rotulo: `${agrupamento} ${b}`,
        palavras: [b],
        detalhe: `${c.ativas} apartamento(s) ativo(s)`,
        indisponivel: c.ativas ? undefined : 'Sem apartamento ativo',
      }))
  }, [unidades, agrupamento])
  const aptos = useMemo(
    (): OpcaoCombobox[] =>
      (bloco ? unidades.filter((u) => u.bloco === bloco) : []).sort(compararUnidades).map((u) => {
        const andar = andarDoNumero(u.numero)
        return {
          valor: u.id,
          rotulo: `AP ${u.numero}`,
          palavras: [u.numero, codigoUnidade(u), `AP ${u.numero}`],
          detalhe: andar === 0 ? 'Térreo' : `${andar}º andar`,
          indisponivel: !u.ativo ? 'Desativada' : (motivo?.(u) ?? undefined),
        }
      }),
    [unidades, bloco, motivo],
  )
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Combobox
        rotulo={agrupamento}
        placeholder={`Escolha ${agrupamento === 'Torre' ? 'a torre' : 'o bloco'}`}
        opcoes={blocos}
        valor={bloco}
        buscaPlaceholder={`${agrupamento} (ex.: ${blocos[0]?.valor ?? 'A'})`}
        vazio={`Nenhum(a) ${agrupamento.toLowerCase()} com esse nome.`}
        onChange={(b) => {
          setBloco(b)
          if (atual?.bloco !== b) onChange(null)
        }}
        aposEscolher={() => aptoRef.current?.focus()}
      />
      <Combobox
        ref={aptoRef}
        rotulo="Apartamento"
        placeholder={
          bloco
            ? 'Escolha o apartamento'
            : `Escolha ${agrupamento === 'Torre' ? 'a torre' : 'o bloco'} antes`
        }
        opcoes={aptos}
        valor={valor}
        desabilitado={!bloco}
        buscaPlaceholder="Número (ex.: 101)"
        vazio="Nenhum apartamento com esse número."
        onChange={(id) => onChange(id)}
        erro={erro}
        dica={
          bloco
            ? `${aptos.length} apartamento(s) ${agrupamento === 'Torre' ? 'na torre' : 'no bloco'} ${bloco}.`
            : undefined
        }
      />
    </div>
  )
}
