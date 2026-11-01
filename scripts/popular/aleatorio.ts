// PRNG determinístico (mulberry32): a mesma semente gera sempre o mesmo conjunto, em qualquer máquina.
export interface Aleatorio {
  /** [0, 1) */
  real(): number;
  /** Inteiro em [min, max]. */
  inteiro(min: number, max: number): number;
  escolher<T>(lista: readonly T[]): T;
  chance(p: number): boolean;
  /** Índice sorteado pelos pesos (não precisam somar 1). */
  ponderado(pesos: readonly number[]): number;
  embaralhar<T>(lista: readonly T[]): T[];
  digitos(n: number): string;
}

export function criarAleatorio(semente: number): Aleatorio {
  let a = semente >>> 0;
  const real = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min: number, max: number) => min + Math.floor(real() * (max - min + 1));
  return {
    real,
    inteiro,
    escolher: (lista) => lista[Math.floor(real() * lista.length)]!,
    chance: (p) => real() < p,
    ponderado(pesos) {
      const total = pesos.reduce((s, p) => s + p, 0);
      let r = real() * total;
      for (let i = 0; i < pesos.length; i++) {
        r -= pesos[i]!;
        if (r < 0) return i;
      }
      return pesos.length - 1;
    },
    embaralhar(lista) {
      const c = [...lista];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(real() * (i + 1));
        [c[i], c[j]] = [c[j]!, c[i]!];
      }
      return c;
    },
    digitos: (n) => Array.from({ length: n }, () => String(inteiro(0, 9))).join(''),
  };
}
