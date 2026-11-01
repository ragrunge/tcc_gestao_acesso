// Dependências reais do núcleo: supabase-js com a chave de serviço (schema srv e API admin do Auth). Nenhuma
// mensagem de erro carrega a senha, a chave ou o e-mail sintético.
import { createClient } from '@supabase/supabase-js';
import { ErroBootstrap, type Dependencias } from './nucleo.ts';

export function dependenciasSupabase(url: string, chaveServico: string): Dependencias {
  const c = createClient(url, chaveServico, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: 'srv' },
  });
  return {
    async rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await c.rpc(nome, args);
      if (error) throw new ErroBootstrap(/^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'ERRO_BANCO', error.message);
      return data as T;
    },
    async criarConta(email, senha) {
      const { data, error } = await c.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (error || !data.user) {
        throw new ErroBootstrap('AUTH_RECUSOU', `O Auth não criou a conta (${error?.code ?? error?.status ?? 'sem usuário'}).`);
      }
      return data.user.id;
    },
    async apagarConta(id) {
      const { error } = await c.auth.admin.deleteUser(id);
      if (error) throw new ErroBootstrap('AUTH_RECUSOU', `O Auth não apagou a conta (${error.code ?? error.status}).`);
    },
  };
}
