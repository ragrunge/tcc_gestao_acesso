import type { ErroRegra } from './comum'

export const e422 = (code: string, message: string): ErroRegra => ({ status: 422, code, message })
