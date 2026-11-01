// Núcleo do bootstrap do primeiro síndico, sem terminal nem rede (as dependências são injetadas). Mesma ordem da Edge
// usuarios-admin: banco confere -> Auth cria -> banco grava (falhou: apaga no Auth). Quem decide se pode é o banco
// (srv.bootstrap_sindico_*); a política de senha é a das Edge Functions, importada, para não divergir.
import { problemasDaSenha } from '../../supabase/functions/_shared/senha.ts';

export interface Entrada { nome: string; login: string; senha: string }

export interface UsuarioCriado { id: string; nome: string; login: string; papel: string; deveTrocarSenha: boolean }

export interface Dependencias {
  rpc<T>(nome: string, args: Record<string, unknown>): Promise<T>;
  /** Cria a conta no Auth (e-mail confirmado) e devolve o id. */
  criarConta(email: string, senha: string): Promise<string>;
  apagarConta(id: string): Promise<void>;
}

export class ErroBootstrap extends Error {
  codigo: string;
  authUserId: string | null;
  constructor(codigo: string, mensagem: string, authUserId: string | null = null) {
    super(mensagem);
    this.codigo = codigo;
    this.authUserId = authUserId;
  }
}

export const normalizarLogin = (login: string): string => login.trim().toLowerCase();

export function problemasDaEntrada(e: Entrada): string[] {
  return problemasDaSenha(e.senha, { login: normalizarLogin(e.login) });
}

export async function criarPrimeiroSindico(e: Entrada, d: Dependencias): Promise<UsuarioCriado> {
  const nome = e.nome.trim();
  const login = normalizarLogin(e.login);
  const problemas = problemasDaEntrada(e);
  if (problemas.length) throw new ErroBootstrap('SENHA_FRACA', problemas.join(' '));

  const { auth_email } = await d.rpc<{ auth_email: string }>('bootstrap_sindico_preparar', { p_nome: nome, p_login: login });
  const authUserId = await d.criarConta(auth_email, e.senha);
  try {
    const r = await d.rpc<{ usuario: UsuarioCriado }>('bootstrap_sindico_criar',
      { p_nome: nome, p_login: login, p_auth_user_id: authUserId, p_auth_email: auth_email });
    return r.usuario;
  } catch (erro) {
    try {
      await d.apagarConta(authUserId);
    } catch {
      // Inerte (ninguém conhece o e-mail sintético), mas fica uma conta no Auth sem usuário no sistema.
      throw new ErroBootstrap('CONTA_ORFA', 'O banco recusou e a conta criada no Auth não pôde ser apagada. ' +
        'Apague-a no painel (Authentication > Users) pelo id informado.', authUserId);
    }
    throw erro;
  }
}
