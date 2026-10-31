// Adaptador Supabase da interface Api (F1: auth), com o supabase-js mockado. Cobre o contrato que o AuthContext e as
// telas esperam: login pela Edge com a anon key, onde a sessão é guardada, 401/403/429 no formato ApiError, aviso
// único de sessão expirada, logout que falha sem fingir saída, e o NAO_MIGRADO do que ainda não foi portado.
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { createSupabaseApi, erroDeRpc } from '../api/supabase/createSupabaseApi';
import { criarArmazenamentoSessao } from '../api/supabase/armazenamento';
import { ApiError, type EventoSessao } from '../api/types';

const USUARIO = { id: 'u-1', nome: 'Roberto Faria', login: 'roberto.faria', papel: 'sindico', ativo: true, ultimoAcesso: null, deveTrocarSenha: false };
const LOGIN_OK = {
  usuario: USUARIO, condominio: null, sessao: { expiraEm: '2026-11-01T00:00:00.000Z', inatividadeMin: 240, manterConectado: false },
  auth: { access_token: 'a.b.c', refresh_token: 'r1' },
};

const httpErro = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new FunctionsHttpError(new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } }));

function mock() {
  let ouvinteAuth: ((e: string) => void) | null = null;
  const rpc = vi.fn(async (_nome: string, _args?: unknown): Promise<{ data: unknown; error: unknown; status: number }> => ({ data: null, error: null, status: 204 }));
  const invoke = vi.fn(async (_nome: string, _opc?: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
  const cliente = {
    schema: vi.fn(() => ({ rpc })),
    functions: { invoke },
    auth: {
      setSession: vi.fn(async () => ({ data: {}, error: null })),
      getSession: vi.fn(async (): Promise<{ data: { session: unknown } }> => ({ data: { session: null } })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn((cb: (e: string) => void) => { ouvinteAuth = cb; return { data: { subscription: { unsubscribe() {} } } }; }),
    },
  };
  const armazenamento = { ...criarArmazenamentoSessao(undefined, undefined), usar: vi.fn(), limpar: vi.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = createSupabaseApi(cliente as any, { chaveAnon: 'chave-anon', armazenamento });
  const eventos: EventoSessao[] = [];
  api.aoEventoSessao!((e) => eventos.push(e));
  return { api, cliente, rpc, invoke, armazenamento, eventos, authEvento: (e: string) => ouvinteAuth?.(e) };
}

async function erro(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('esperava ApiError');
}

describe('auth.login', () => {
  it('vai à Edge auth-entrar com a anon key (nunca com sessão antiga) e instala a sessão devolvida', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: LOGIN_OK, error: null });
    const u = await m.api.auth.login({ login: 'roberto.faria', senha: 's', manterConectado: false });
    expect(m.invoke).toHaveBeenCalledWith('auth-entrar', { body: { login: 'roberto.faria', senha: 's' }, headers: { Authorization: 'Bearer chave-anon' } });
    expect(m.cliente.auth.setSession).toHaveBeenCalledWith({ access_token: 'a.b.c', refresh_token: 'r1' });
    expect(m.armazenamento.usar).toHaveBeenCalledWith('sessao');
    expect(u).toMatchObject({ login: 'roberto.faria', papel: 'sindico', deveTrocarSenha: false, condominio: null });
  });

  it('"manter conectado" só vai para o localStorage se o SERVIDOR concedeu a sessão longa', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: { ...LOGIN_OK, sessao: { ...LOGIN_OK.sessao, manterConectado: true } }, error: null });
    await m.api.auth.login({ login: 'roberto.faria', senha: 's', manterConectado: true });
    expect(m.invoke.mock.calls[0]![1]).toMatchObject({ body: { manterConectado: true } });
    expect(m.armazenamento.usar).toHaveBeenCalledWith('local');
  });

  it('credencial inválida vira ApiError 401 com a mensagem do servidor, sem aviso de sessão expirada', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: null, error: httpErro(401, { code: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha inválidos.', details: null }) });
    const e = await erro(m.api.auth.login({ login: 'x', senha: 'y' }));
    expect([e.status, e.code, e.message]).toEqual([401, 'CREDENCIAIS_INVALIDAS', 'Usuário ou senha inválidos.']);
    expect(m.eventos).toEqual([]);
    expect(m.cliente.auth.setSession).not.toHaveBeenCalled();
  });

  it('429 traz o tempo de espera do Retry-After', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: null, error: httpErro(429, { code: 'LOGIN_BLOQUEADO', message: 'x' }, { 'retry-after': '120' }) });
    const e = await erro(m.api.auth.login({ login: 'x', senha: 'y' }));
    expect([e.status, e.code, e.retryAfterSegundos, e.message]).toEqual([429, 'LOGIN_BLOQUEADO', 120, 'Muitas tentativas. Tente novamente em 2 minutos.']);
  });

  it('sem rede: FALHA_DE_REDE', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new Error('x')) });
    expect((await erro(m.api.auth.login({ login: 'x', senha: 'y' }))).code).toBe('FALHA_DE_REDE');
  });

  it('resposta fora do contrato (sem tokens) não instala sessão', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: { usuario: USUARIO }, error: null });
    expect((await erro(m.api.auth.login({ login: 'x', senha: 'y' }))).code).toBe('RESPOSTA_INVALIDA');
    expect(m.cliente.auth.setSession).not.toHaveBeenCalled();
  });
});

describe('auth.me', () => {
  it('sem sessão no navegador: null sem ir ao servidor', async () => {
    const m = mock();
    expect(await m.api.auth.me()).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it('com sessão: o usuário vem do banco (api.sessao_atual), não do token', async () => {
    const m = mock();
    m.cliente.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'a' } } });
    m.rpc.mockResolvedValueOnce({ data: { usuario: { ...USUARIO, papel: 'porteiro' }, condominio: { nome: 'Residencial' } }, error: null, status: 200 });
    expect(await m.api.auth.me()).toMatchObject({ papel: 'porteiro', condominio: { nome: 'Residencial' } });
    expect(m.cliente.schema).toHaveBeenCalledWith('api');
    expect(m.rpc).toHaveBeenCalledWith('sessao_atual', {});
  });

  it('sessão recusada pelo banco (401): null e a sessão local é apagada', async () => {
    const m = mock();
    m.cliente.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'a' } } });
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'SESSAO_INVALIDA', message: 'Sua sessão expirou.', details: null }, status: 401 });
    expect(await m.api.auth.me()).toBeNull();
    expect(m.cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(m.armazenamento.limpar).toHaveBeenCalled();
    expect(m.eventos).toEqual([]);
  });
});

describe('avisos de sessão', () => {
  it('401 fora do login: um só "expirada" para N chamadas, e a sessão local é apagada', async () => {
    const m = mock();
    m.invoke.mockResolvedValue({ data: null, error: httpErro(401, { code: 'SESSAO_INVALIDA', message: 'Sua sessão expirou. Entre novamente.' }) });
    await Promise.all([erro(m.api.usuarios.desativar('a')), erro(m.api.usuarios.reativar('b'))]);
    expect(m.eventos).toEqual(['expirada']);
    expect(m.cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('403 TROCA_DE_SENHA_OBRIGATORIA: "troca_obrigatoria"', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: null, error: httpErro(403, { code: 'TROCA_DE_SENHA_OBRIGATORIA', message: 'Troque a senha.' }) });
    await erro(m.api.usuarios.criar({ nome: 'A B C', login: 'abc', papel: 'porteiro' }));
    expect(m.eventos).toEqual(['troca_obrigatoria']);
  });

  it('refresh recusado pelo Auth (SIGNED_OUT que não foi pedido): "expirada"', () => {
    const m = mock();
    m.authEvento('SIGNED_OUT');
    expect(m.eventos).toEqual(['expirada']);
  });

  it('login com sucesso rearma o aviso', async () => {
    const m = mock();
    m.authEvento('SIGNED_OUT');
    m.invoke.mockResolvedValueOnce({ data: LOGIN_OK, error: null });
    await m.api.auth.login({ login: 'roberto.faria', senha: 's' });
    m.authEvento('SIGNED_OUT');
    expect(m.eventos).toEqual(['expirada', 'expirada']);
  });
});

describe('auth.logout', () => {
  it('revoga no banco e depois apaga a sessão local; sem aviso de expirada', async () => {
    const m = mock();
    await m.api.auth.logout();
    expect(m.rpc).toHaveBeenCalledWith('sessao_encerrar', {});
    expect(m.cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    m.authEvento('SIGNED_OUT');
    expect(m.eventos).toEqual([]);
  });

  it('falha (rede/5xx): rejeita e NÃO apaga a sessão local (a sessão segue válida no servidor)', async () => {
    const m = mock();
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
    expect((await erro(m.api.auth.logout())).code).toBe('FALHA_DE_REDE');
    expect(m.cliente.auth.signOut).not.toHaveBeenCalled();
  });

  it('401 (já não havia sessão no servidor): considera saído', async () => {
    const m = mock();
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'SESSAO_INVALIDA', message: 'x' }, status: 401 });
    await m.api.auth.logout();
    expect(m.cliente.auth.signOut).toHaveBeenCalled();
  });
});

describe('auth.trocarSenha e usuarios', () => {
  it('troca pela Edge auth-trocar-senha; SENHA_FRACA traz os detalhes da política', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: null, error: httpErro(422, { code: 'SENHA_FRACA', message: 'Curta.', details: [{ field: 'novaSenha', message: 'Curta.' }] }) });
    const e = await erro(m.api.auth.trocarSenha({ senhaAtual: 'a', novaSenha: 'b' }));
    expect([e.status, e.code, e.detalhes]).toEqual([422, 'SENHA_FRACA', [{ field: 'novaSenha', message: 'Curta.' }]]);
    m.invoke.mockResolvedValueOnce({ data: { usuario: { ...USUARIO, deveTrocarSenha: false }, auth: { access_token: 'n.o.v', refresh_token: 'r2' } }, error: null });
    expect((await m.api.auth.trocarSenha({ senhaAtual: 'a', novaSenha: 'b' })).deveTrocarSenha).toBe(false);
    expect(m.invoke).toHaveBeenLastCalledWith('auth-trocar-senha', { body: { senhaAtual: 'a', novaSenha: 'b' } });
    // A troca derruba os refresh tokens no Auth: a sessão nova devolvida pela Edge substitui a atual.
    expect(m.cliente.auth.setSession).toHaveBeenCalledWith({ access_token: 'n.o.v', refresh_token: 'r2' });
    expect(m.eventos).toEqual([]);
  });

  it('criar usuário devolve a senha temporária uma vez', async () => {
    const m = mock();
    m.invoke.mockResolvedValueOnce({ data: { usuario: { ...USUARIO, deveTrocarSenha: true, senhaTemporariaExpiraEm: 5 }, senhaTemporaria: 'abcd-efgh-ijkm-npqr' }, error: null });
    const r = await m.api.usuarios.criar({ nome: 'Roberto Faria', login: 'roberto.faria', papel: 'sindico' });
    expect(r).toMatchObject({ senhaTemporaria: 'abcd-efgh-ijkm-npqr', usuario: { senhaTemporariaExpiraEm: 5, deveTrocarSenha: true } });
    expect(m.invoke).toHaveBeenCalledWith('usuarios-admin', { body: { acao: 'criar', nome: 'Roberto Faria', login: 'roberto.faria', papel: 'sindico' } });
  });

  it('o que ainda não foi migrado rejeita com NAO_MIGRADO (501)', async () => {
    const m = mock();
    const e = await erro(m.api.pessoas.listar());
    expect([e.status, e.code]).toEqual([501, 'NAO_MIGRADO']);
    expect((await erro(m.api.usuarios.listar())).code).toBe('NAO_MIGRADO');
  });
});

describe('erroDeRpc', () => {
  it('código nosso: status e mensagem do banco, detalhes desserializados', () => {
    const e = erroDeRpc({ code: 'SEM_PERMISSAO', message: 'Sem permissão.', details: '{"acao": "usuario.gerenciar"}' }, 403);
    expect([e.status, e.code, e.message, e.detalhes]).toEqual([403, 'SEM_PERMISSAO', 'Sem permissão.', { acao: 'usuario.gerenciar' }]);
  });
  it('erro do PostgREST sem código nosso (42501, JWT inválida): 401 NAO_AUTENTICADO, sem vazar a mensagem crua', () => {
    const e = erroDeRpc({ code: '42501', message: 'permission denied for function sessao_atual' }, 401);
    expect([e.status, e.code, e.message]).toEqual([401, 'NAO_AUTENTICADO', 'Entre no sistema para continuar.']);
  });
});

describe('armazenamento da sessão', () => {
  const storage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m } as unknown as Storage & { m: Map<string, string> };
  };
  it('padrão em sessionStorage; "local" em localStorage; recarregar mantém onde a sessão está', () => {
    const local = storage(), sessao = storage();
    const a = criarArmazenamentoSessao(local, sessao);
    a.setItem('k', '1');
    expect([(sessao as any).m.get('k'), (local as any).m.get('k')]).toEqual(['1', undefined]);
    a.usar('local');
    a.setItem('k', '2');
    expect([(sessao as any).m.get('k'), (local as any).m.get('k')]).toEqual([undefined, '2']);
    const depoisDeRecarregar = criarArmazenamentoSessao(local, sessao);
    depoisDeRecarregar.setItem('k', '3'); // refresh do token depois do F5
    expect((local as any).m.get('k')).toBe('3');
    depoisDeRecarregar.limpar();
    expect([(sessao as any).m.size, (local as any).m.size]).toEqual([0, 0]);
  });
  it('storage indisponível (navegador privado): cai em memória sem lançar', () => {
    const quebrado = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } as unknown as Storage;
    const a = criarArmazenamentoSessao(quebrado, quebrado);
    a.setItem('k', 'v');
    expect(a.getItem('k')).toBe('v');
  });
});
