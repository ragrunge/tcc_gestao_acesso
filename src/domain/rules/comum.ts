export const MIN_JUSTIFICATIVA = 15
export interface ErroRegra {
  status: number
  code: string
  message: string
}

/** CPF com dígito verificador (11 dígitos, sem máscara). */
export function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dig = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10])
}

export const justificativaValida = (t?: string | null) =>
  (t ?? '').trim().length >= MIN_JUSTIFICATIVA
