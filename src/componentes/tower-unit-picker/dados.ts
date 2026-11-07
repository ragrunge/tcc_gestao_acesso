import { useMemo } from 'react'
import { andarDoNumero, compararBlocos } from '@/domain/units'
import { useCatalogo } from '@/app/catalogo'

/** Números das unidades ATIVAS de um bloco, vindos do banco (RF-01), em ordem numérica. */
export function useNumerosDoBloco(): (bloco: string) => string[] {
  const { ativas } = useCatalogo()
  return useMemo(() => {
    const por = new Map<string, string[]>()
    for (const u of ativas) por.set(u.bloco, [...(por.get(u.bloco) ?? []), u.numero])
    for (const v of por.values()) v.sort((a, b) => Number(a) - Number(b))
    return (bloco: string) => por.get(bloco) ?? []
  }, [ativas])
}

/** Blocos com ao menos uma unidade ativa, em ordem natural ("2" antes de "10", "A" antes de "B"). */
export function useBlocos(): string[] {
  const { ativas } = useCatalogo()
  return useMemo(() => [...new Set(ativas.map((u) => u.bloco))].sort(compararBlocos), [ativas])
}

/** Andares de cima para baixo: "4º and." ... "Térreo", com os apartamentos de cada andar. */
export function andaresDoBloco(
  numerosDoBloco: string[],
): { andar: number; rotulo: string; numeros: string[] }[] {
  const por = new Map<number, string[]>()
  for (const n of numerosDoBloco) {
    const andar = andarDoNumero(n)
    por.set(andar, [...(por.get(andar) ?? []), n])
  }
  return [...por.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([andar, numeros]) => ({
      andar,
      rotulo: andar === 0 ? 'Térreo' : `${andar}º and.`,
      numeros,
    }))
}

/** "Bloco (teclas A a I)": o atalho só existe para bloco de um caractere. */
export function rotuloTeclas(agrupamento: string, blocos: string[]): string {
  const teclas = blocos.filter((b) => b.length === 1)
  if (!teclas.length) return agrupamento
  return teclas.length === 1
    ? `${agrupamento} (tecla ${teclas[0]})`
    : `${agrupamento} (teclas ${teclas[0]} a ${teclas[teclas.length - 1]})`
}

export type Variante = 'entrada' | 'lista' | 'modal'
