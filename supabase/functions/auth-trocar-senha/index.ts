// Troca da própria senha (desenho §2.5), inclusive a troca obrigatória da senha temporária.
// Por que não supabase.auth.updateUser direto do navegador: o banco não saberia que a senha mudou (para limpar a troca
// pendente), e quem tem só o access token roubado trocaria a senha sem conhecer a atual. Se alguém trocar direto no
// Auth mesmo assim, a troca pendente continua ligada e o fluxo segue obrigatório (falha fechada).
//   1. api.sessao_atual com a JWT do usuário (PostgREST verifica a assinatura; app.ator() verifica a sessão).
//   2. Política da senha nova; srv.troca_preparar conta a tentativa no par login+IP (a senha atual é um segredo).
//   3. Confere a senha atual no Auth e revoga na hora a sessão que essa conferência abriu.
//   4. Aplica a nova pela API admin; srv.troca_concluir limpa a pendência, revoga as OUTRAS sessões e desbloqueia.
import { ErroHttp, ipDoCliente, json, lerCorpo, servir, texto } from '../_shared/http.ts';
import { anon, revogarSessaoAuth, rpc, servico, sessaoDoUsuario } from '../_shared/supabase.ts';
import { problemasDaSenha, SENHA_MAX_BYTES } from '../_shared/senha.ts';

interface Preparo { bloqueado: boolean; retry_after_s?: number; auth_email?: string; auth_user_id?: string }

servir(async (req) => {
  const corpo = await lerCorpo(req);
  const senhaAtual = texto(corpo.senhaAtual, 1024) ?? '';
  const novaSenha = texto(corpo.novaSenha, 1024) ?? '';
  if (!senhaAtual || !novaSenha) throw new ErroHttp(400, 'VALIDACAO', 'Informe a senha atual e a nova.');

  const eu = await sessaoDoUsuario(req);
  const problemas = problemasDaSenha(novaSenha, { login: eu.usuario.login });
  if (problemas.length) {
    throw new ErroHttp(422, 'SENHA_FRACA', problemas[0], problemas.map((message) => ({ field: 'novaSenha', message })));
  }
  if (novaSenha === senhaAtual) throw new ErroHttp(422, 'SENHA_FRACA', 'A nova senha precisa ser diferente da atual.');

  const ip = ipDoCliente(req);
  const srv = servico();
  const prep = await rpc<Preparo>(srv, 'troca_preparar', { p_sessao_id: eu.sessao.id, p_ip: ip });
  if (prep.bloqueado) {
    throw new ErroHttp(429, 'LOGIN_BLOQUEADO', 'Muitas tentativas. Aguarde e tente novamente.', null,
      { 'Retry-After': String(Math.max(1, prep.retry_after_s ?? 60)) });
  }

  let confere = false;
  if (prep.auth_email && new TextEncoder().encode(senhaAtual).length <= SENHA_MAX_BYTES) {
    const { data, error } = await anon().auth.signInWithPassword({ email: prep.auth_email, password: senhaAtual });
    if (data?.session) await revogarSessaoAuth(data.session.access_token);
    if (error && error.status && error.status >= 500) {
      throw new ErroHttp(503, 'AUTH_INDISPONIVEL', 'O serviço de login não respondeu. Tente novamente em instantes.');
    }
    confere = !error && data?.user?.id === prep.auth_user_id;
  }
  if (!confere) {
    await rpc(srv, 'troca_falhou', { p_sessao_id: eu.sessao.id, p_ip: ip });
    throw new ErroHttp(422, 'SENHA_ATUAL_INCORRETA', 'A senha atual não confere.');
  }

  const { error } = await srv.auth.admin.updateUserById(prep.auth_user_id!, { password: novaSenha });
  if (error) {
    if (error.code === 'weak_password') throw new ErroHttp(422, 'SENHA_FRACA', 'A senha nova foi recusada pela política do Auth.');
    throw new ErroHttp(503, 'AUTH_INDISPONIVEL', 'Não foi possível trocar a senha agora. Tente novamente em instantes.');
  }
  const r = await rpc<{ usuario: unknown }>(srv, 'troca_concluir', { p_sessao_id: eu.sessao.id, p_ip: ip });
  return json(req, 200, { usuario: r.usuario });
});
