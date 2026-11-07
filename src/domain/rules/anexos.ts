// ----- Anexos de ocorrência (RF-27, RNF-03, spec §9.2) -------------------------------------------------------------
// Os mesmos limites na tela (pré-validação) e na API (decisão). 4 MiB: a foto de celular comprimida e o PDF de um
// boletim cabem, e o corpo passa pelo proxy da Vercel em produção (limite de ~4,5 MB por requisição).
export const ANEXO_MAX_BYTES = 4 * 1024 * 1024
export const ANEXO_MAX_POR_OCORRENCIA = 5
/** Tipos aceitos e a extensão do nome de download. O nome original do arquivo não é guardado (pode ter dado pessoal). */
export const ANEXO_TIPOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
} as const
export type MimeAnexo = keyof typeof ANEXO_TIPOS
export const ehMimeAnexo = (m: string): m is MimeAnexo =>
  Object.prototype.hasOwnProperty.call(ANEXO_TIPOS, m)

/** Tipo pelo CONTEÚDO (assinatura dos primeiros bytes), nunca pelo nome ou pelo Content-Type que o cliente declara. */
export function tipoAnexoPorConteudo(b: Uint8Array): MimeAnexo | null {
  const comeca = (...xs: number[]) => b.length >= xs.length && xs.every((x, i) => b[i] === x)
  if (comeca(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (comeca(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf' // %PDF-
  return null
}
