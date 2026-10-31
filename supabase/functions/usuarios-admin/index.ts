// Gestão de contas que exige a API admin do Auth (desenho §2.5 e §2.6): criar, desativar, reativar e redefinir senha.
// A permissão é decidida no BANCO (srv.* chama app.exigir_sessao com o papel atual: usuario.gerenciar e, para síndico,
// usuario.gerenciar_sindico); esta Edge só traduz para o Auth. Ordem escolhida para falhar fechado:
//   criar      banco confere -> Auth cria -> banco grava (falhou: apaga no Auth);
//   desativar  banco desativa e revoga as sessões -> Auth bane (login novo e refresh);
//   reativar   banco reativa -> Auth tira o banimento (falhou: 503, repetir é idempotente);
//   redefinir  banco marca a troca e revoga as sessões -> Auth troca a senha (falhou: 503; o alvo fica sem sessão).
// A senha temporária sai UMA vez na resposta (no-store) e nunca é logada nem gravada fora do Auth.
import { ErroHttp, ipDoCliente, json, lerCorpo, servir, texto } from '../_shared/http.ts';
import { rpc, servico, sessaoDoUsuario } from '../_shared/supabase.ts';
import { gerarSenhaTemporaria } from '../_shared/senha.ts';

const PAPEIS = ['sindico', 'administracao', 'porteiro', 'auditor'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** "Para sempre" no GoTrue (ban_duration aceita horas). */
const BANIMENTO = '876000h';

interface Gerido { usuario: unknown; auth_user_id: string | null }

const indisponivel = () => new ErroHttp(503, 'AUTH_INDISPONIVEL', 'O serviço de contas não respondeu. Tente novamente em instantes.');

servir(async (req) => {
  const corpo = await lerCorpo(req);
  const acao = texto(corpo.acao, 40);
  const eu = await sessaoDoUsuario(req);
  const ip = ipDoCliente(req);
  const srv = servico();

  if (acao === 'criar') {
    const nome = texto(corpo.nome, 200)?.trim() ?? '';
    const login = texto(corpo.login, 100)?.trim().toLowerCase() ?? '';
    const papel = texto(corpo.papel, 20) ?? '';
    if (!PAPEIS.includes(papel)) throw new ErroHttp(422, 'VALIDACAO', 'Papel inválido.', [{ field: 'papel' }]);
    const { auth_email } = await rpc<{ auth_email: string }>(srv, 'usuario_criar_preparar',
      { p_sessao_id: eu.sessao.id, p_nome: nome, p_login: login, p_papel: papel });
    const senhaTemporaria = gerarSenhaTemporaria();
    const { data, error } = await srv.auth.admin.createUser({ email: auth_email, password: senhaTemporaria, email_confirm: true });
    if (error || !data.user) throw indisponivel();
    try {
      const r = await rpc<{ usuario: unknown }>(srv, 'usuario_criar', {
        p_sessao_id: eu.sessao.id, p_nome: nome, p_login: login, p_papel: papel,
        p_auth_user_id: data.user.id, p_auth_email: auth_email, p_ip: ip,
      });
      return json(req, 201, { usuario: r.usuario, senhaTemporaria });
    } catch (e) {
      const { error: erroApagar } = await srv.auth.admin.deleteUser(data.user.id);
      if (erroApagar) console.error('edge.usuario_orfao_no_auth', { status: erroApagar.status });
      throw e;
    }
  }

  const alvo = texto(corpo.id, 36) ?? '';
  if (!UUID.test(alvo)) throw new ErroHttp(422, 'VALIDACAO', 'Usuário inválido.', [{ field: 'id' }]);
  const args = { p_sessao_id: eu.sessao.id, p_alvo: alvo, p_ip: ip };

  if (acao === 'desativar') {
    const r = await rpc<Gerido>(srv, 'usuario_desativar', args);
    if (r.auth_user_id) {
      const { error } = await srv.auth.admin.updateUserById(r.auth_user_id, { ban_duration: BANIMENTO });
      // O banco já recusa o desativado (sessões revogadas, login_registrar confere `ativo`): o banimento é reforço.
      if (error) console.error('edge.banir_falhou', { status: error.status });
    }
    return json(req, 200, { usuario: r.usuario });
  }

  if (acao === 'reativar') {
    const r = await rpc<Gerido>(srv, 'usuario_reativar', args);
    if (r.auth_user_id) {
      const { error } = await srv.auth.admin.updateUserById(r.auth_user_id, { ban_duration: 'none' });
      if (error) throw indisponivel();
    }
    return json(req, 200, { usuario: r.usuario });
  }

  if (acao === 'redefinir_senha') {
    const r = await rpc<Gerido>(srv, 'usuario_redefinir_senha', args);
    const senhaTemporaria = gerarSenhaTemporaria();
    const { error } = await srv.auth.admin.updateUserById(r.auth_user_id!, { password: senhaTemporaria });
    if (error) throw indisponivel();
    return json(req, 200, { usuario: r.usuario, senhaTemporaria });
  }

  throw new ErroHttp(422, 'VALIDACAO', 'Ação inválida.', [{ field: 'acao' }]);
});
