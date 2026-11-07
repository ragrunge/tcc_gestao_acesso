/** Erro de API no formato da spec: status HTTP + código estável + mensagem para o operador. */
export class ApiError extends Error {
  /** 429: segundos até poder tentar de novo (cabeçalho Retry-After), quando a API informa. */
  public retryAfterSegundos?: number
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export const ehApiError = (e: unknown): e is ApiError => e instanceof ApiError
