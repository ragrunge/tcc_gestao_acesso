import { ANEXO_MAX_BYTES, ehMimeAnexo } from '@/domain/rules'

export const ACEITOS = 'image/jpeg,image/png,application/pdf'

export const MB = ANEXO_MAX_BYTES / 1024 / 1024

export /** Mesmas regras da API (tipo, tamanho), checadas antes de enviar; a API decide de novo pelo conteúdo. */
function problemaDoArquivo(f: File): string | null {
  if (f.size === 0) return `${f.name}: arquivo vazio.`
  if (f.size > ANEXO_MAX_BYTES) return `${f.name}: passa de ${MB} MB.`
  if (!ehMimeAnexo(f.type)) return `${f.name}: envie foto (JPEG ou PNG) ou PDF.`
  return null
}

export const tamanho = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
