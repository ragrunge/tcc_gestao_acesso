import { ApiError } from '@/api/types'
import { segundosRetryAfter, tempoLegivel } from '@/lib/espera'
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

function mensagemPorStatus(status: number): string {
  if (status === 401) return 'Entre no sistema para continuar.'
  if (status === 403) return 'Seu perfil não tem permissão para esta ação.'
  if (status === 404) return 'Recurso não encontrado.'
  if (status === 429) return 'Muitas tentativas. Aguarde e tente novamente.'
  if (status >= 500) return 'O servidor não respondeu como esperado. Tente novamente em instantes.'
  return 'Requisição recusada.'
}

export const semRede = () =>
  new ApiError(
    0,
    'FALHA_DE_REDE',
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Sem conexão — o sistema precisa de internet para registrar.'
      : 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.',
  )

/** Os detalhes vêm serializados do banco (o PostgREST só aceita texto ali). */
function detalhesDe(d: unknown): unknown {
  if (typeof d !== 'string') return d ?? undefined
  try {
    return JSON.parse(d)
  } catch {
    return d
  }
}

/** Erro de RPC (PostgREST). Código nosso = MAIÚSCULAS (RAISE PGRST); outro (42501, PGRST301...) só pelo status. */
export function erroDeRpc(
  erro: { code?: string; message?: string; details?: unknown },
  status: number,
): ApiError {
  if (!status) return semRede()
  const nosso = typeof erro.code === 'string' && /^[A-Z_]+$/.test(erro.code)
  const codigo = nosso
    ? erro.code!
    : status === 401 || status === 403
      ? 'NAO_AUTENTICADO'
      : `HTTP_${status}`
  const st = !nosso && status === 403 ? 401 : status // sem EXECUTE (403/401 do PostgREST) = sem sessão de usuário
  return new ApiError(
    st,
    codigo,
    nosso && erro.message ? erro.message : mensagemPorStatus(st),
    nosso ? detalhesDe(erro.details) : undefined,
  )
}

/** Erro de Edge Function: corpo { code, message, details } e, no 429, Retry-After. */
export async function erroDeEdge(erro: unknown): Promise<ApiError> {
  if (erro instanceof FunctionsFetchError) return semRede()
  if (erro instanceof FunctionsRelayError)
    return new ApiError(502, 'HTTP_502', mensagemPorStatus(502))
  if (!(erro instanceof FunctionsHttpError))
    return new ApiError(0, 'ERRO_DESCONHECIDO', 'Erro inesperado.')
  const r = erro.context as Response
  let corpo: { code?: unknown; message?: unknown; details?: unknown } = {}
  try {
    corpo = await r.clone().json()
  } catch {
    /* corpo não JSON */
  }
  const codigo =
    typeof corpo.code === 'string' && /^[A-Z_]+$/.test(corpo.code) ? corpo.code : `HTTP_${r.status}`
  let mensagem =
    typeof corpo.message === 'string' && corpo.message ? corpo.message : mensagemPorStatus(r.status)
  let espera: number | undefined
  if (r.status === 429) {
    espera = segundosRetryAfter(r.headers.get('retry-after') ?? undefined)
    if (espera !== undefined)
      mensagem = `Muitas tentativas. Tente novamente em ${tempoLegivel(espera)}.`
  }
  const e = new ApiError(r.status, codigo, mensagem, corpo.details ?? undefined)
  if (espera !== undefined) e.retryAfterSegundos = espera
  return e
}
