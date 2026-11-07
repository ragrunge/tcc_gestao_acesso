import { type UsuarioComSenhaTemporaria } from '@/api'

export /** Senha temporária em exibição: vive só neste estado local e some ao fechar o modal. */
interface SenhaExibida extends UsuarioComSenhaTemporaria {
  motivo: 'criado' | 'redefinido'
}
