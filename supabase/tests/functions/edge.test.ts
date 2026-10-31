// Integração das Edge Functions de auth contra o Supabase LOCAL (desenho §8, F1). Pré-requisitos:
//   supabase start && supabase db reset && supabase functions serve
//   npm run test:supabase
// As chaves vêm de `supabase status -o env` (as padrão do CLI local, descartáveis) em tempo de execução: nada fica em
// arquivo. O estado do banco é ajustado por `docker exec ... psql` (só para simular o tempo: senha vencida, atraso 0).
import { execFileSync, spawnSync } from 'node:child_process';

const PROJETO = 'tcc-gestao-acesso';
const SENHA_DEMO = 'Demo-Portaria-2026';

function ambiente() {
  const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '')) throw new Error('API_URL não é o Supabase local: recusando rodar');
  return { url: v.API_URL as string, anon: v.ANON_KEY as string };
}
const { url: API, anon: ANON } = ambiente();

function sql(comando: string): string {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', comando],
    { encoding: 'utf8' }).trim();
}

interface Resp { status: number; corpo: any; headers: Headers; ms: number }

async function post(caminho: string, corpo: unknown, opcoes: { token?: string; headers?: Record<string, string> } = {}): Promise<Resp> {
  const inicio = Date.now();
  const r = await fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${opcoes.token ?? ANON}`, ...opcoes.headers },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: unknown = texto;
  try { json = JSON.parse(texto); } catch { /* corpo não JSON */ }
  return { status: r.status, corpo: json, headers: r.headers, ms: Date.now() - inicio };
}

const entrar = (login: string, senha: string, headers?: Record<string, string>) => post('/functions/v1/auth-entrar', { login, senha }, { headers });
const sessaoAtual = (token: string) => post('/rest/v1/rpc/sessao_atual', {}, { token, headers: { 'Content-Profile': 'api' } });
const admin = (token: string, corpo: unknown) => post('/functions/v1/usuarios-admin', corpo, { token });
const trocar = (token: string, senhaAtual: string, novaSenha: string) => post('/functions/v1/auth-trocar-senha', { senhaAtual, novaSenha }, { token });

async function token(login: string, senha = SENHA_DEMO): Promise<string> {
  const r = await entrar(login, senha);
  expect(r.status, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo.auth.access_token;
}

const sufixo = () => Math.random().toString(36).slice(2, 8);
const senhasDoTeste: string[] = [SENHA_DEMO];

let atrasoOriginal = '';
beforeAll(() => {
  // O atraso crescente (até 3 s por falha) só deixaria o teste lento; o piso de 700 ms continua valendo.
  atrasoOriginal = sql('SELECT login_atraso_base_ms FROM public.auth_parametros');
  sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 0');
  zerarLimites();
});
const zerarLimites = () => sql('UPDATE public.login_limite SET falhas = 0, bloqueado_ate = NULL');
afterAll(() => {
  sql(`UPDATE public.auth_parametros SET login_atraso_base_ms = ${Number(atrasoOriginal) || 250}`);
});

describe('auth-entrar', () => {
  it('login por usuário devolve a sessão do Auth e o usuário do banco; a JWT vale em api.*', async () => {
    const r = await entrar('Paula.Nogueira ', SENHA_DEMO);
    expect(r.status).toBe(200);
    expect(r.corpo.usuario).toMatchObject({ login: 'paula.nogueira', papel: 'administracao', deveTrocarSenha: false });
    expect(r.corpo.auth.refresh_token).toEqual(expect.any(String));
    expect(r.headers.get('cache-control')).toBe('no-store');
    const s = await sessaoAtual(r.corpo.auth.access_token);
    expect(s.status).toBe(200);
    expect(s.corpo.usuario.papel).toBe('administracao');
  });

  it('senha errada e login inexistente: mesmo status, mesmo corpo e o mesmo piso de tempo', async () => {
    const errada = await entrar('luiza.campos', 'senha-errada-123');
    const inexistente = await entrar(`ninguem.${sufixo()}`, 'senha-errada-123');
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.corpo).toEqual(inexistente.corpo);
    expect(errada.corpo).toEqual({ code: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha inválidos.', details: null });
    expect(errada.ms).toBeGreaterThanOrEqual(690);
    expect(inexistente.ms).toBeGreaterThanOrEqual(690);
  });

  it('cadastro direto no Auth está fechado (signup desligado)', async () => {
    const r = await post('/auth/v1/signup', { email: `x${sufixo()}@example.com`, password: 'uma-senha-longa-123' });
    expect(r.status).toBe(422);
    expect(r.corpo.error_code).toBe('signup_disabled');
  });

  it('pular a Edge e entrar direto no GoTrue (mesmo sabendo o e-mail) não dá acesso a api.*', async () => {
    const email = sql("SELECT auth_email FROM public.usuario_sistema WHERE login = 'luiza.campos'");
    const r = await post('/auth/v1/token?grant_type=password', { email, password: SENHA_DEMO });
    expect(r.status).toBe(200);
    const s = await sessaoAtual(r.corpo.access_token);
    expect(s.status).toBe(401);
    expect(s.corpo.code).toBe('SESSAO_INVALIDA');
  });

  it('10 falhas do mesmo login no mesmo IP bloqueiam (429 + Retry-After); forjar X-Forwarded-For não escapa', async () => {
    zerarLimites();
    for (let i = 0; i < 10; i++) expect((await entrar('joao.lima', `errada-${i}-xxxxxx`)).status).toBe(401);
    const bloqueado = await entrar('joao.lima', SENHA_DEMO);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.corpo.code).toBe('LOGIN_BLOQUEADO');
    expect(Number(bloqueado.headers.get('retry-after'))).toBeGreaterThan(800);
    const forjado = await entrar('joao.lima', SENHA_DEMO, { 'X-Forwarded-For': '203.0.113.99' });
    expect(forjado.status).toBe(429);
    zerarLimites(); // devolve o porteiro aos outros testes
  }, 30_000);
});

describe('troca obrigatória (auth-trocar-senha) e gestão (usuarios-admin)', () => {
  let tokenSindico = '';
  beforeAll(async () => { tokenSindico = await token('roberto.faria'); });

  it('ciclo completo: criar com temporária -> troca obrigatória -> senha nova vale, temporária não', async () => {
    const login = `e2e.${sufixo()}`;
    const criado = await admin(tokenSindico, { acao: 'criar', nome: 'Pessoa de Teste', login, papel: 'porteiro' });
    expect(criado.status, JSON.stringify(criado.corpo)).toBe(201);
    const temporaria: string = criado.corpo.senhaTemporaria;
    senhasDoTeste.push(temporaria);
    expect(temporaria).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(criado.corpo.usuario).toMatchObject({ login, deveTrocarSenha: true });

    const t = await token(login, temporaria);
    expect((await sessaoAtual(t)).corpo.usuario.deveTrocarSenha).toBe(true);
    const bloqueadoPelaTroca = await admin(t, { acao: 'criar', nome: 'Outro', login: `x.${sufixo()}`, papel: 'porteiro' });
    expect(bloqueadoPelaTroca.status).toBe(403);
    expect(bloqueadoPelaTroca.corpo.code).toBe('TROCA_DE_SENHA_OBRIGATORIA');

    expect((await trocar(t, 'nao-e-a-atual-123', 'Nova-Senha-Boa-2026')).corpo.code).toBe('SENHA_ATUAL_INCORRETA');
    const fraca = await trocar(t, temporaria, 'portaria1234');
    expect(fraca.status).toBe(422);
    expect(fraca.corpo.code).toBe('SENHA_FRACA');
    expect((await trocar(t, temporaria, `Senha-com-${login}-dentro`)).corpo.code).toBe('SENHA_FRACA');

    const nova = `Nova-Senha-Boa-${sufixo()}`;
    senhasDoTeste.push(nova);
    const ok = await trocar(t, temporaria, nova);
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(200);
    expect(ok.corpo.usuario.deveTrocarSenha).toBe(false);
    expect((await sessaoAtual(t)).status).toBe(200); // a sessão que trocou continua

    expect((await entrar(login, temporaria)).corpo.code).toBe('CREDENCIAIS_INVALIDAS');
    expect((await sessaoAtual(await token(login, nova))).corpo.usuario.deveTrocarSenha).toBe(false);
  }, 30_000);

  it('temporária vencida: com a senha certa, 401 próprio; com a errada, a mensagem genérica', async () => {
    const login = `venc.${sufixo()}`;
    const criado = await admin(tokenSindico, { acao: 'criar', nome: 'Pessoa Vencida', login, papel: 'auditor' });
    senhasDoTeste.push(criado.corpo.senhaTemporaria);
    sql(`UPDATE public.usuario_sistema SET senha_temporaria_expira_em = now() - interval '1 minute' WHERE login = '${login}'`);
    const certa = await entrar(login, criado.corpo.senhaTemporaria);
    expect(certa.status).toBe(401);
    expect(certa.corpo.code).toBe('SENHA_TEMPORARIA_EXPIRADA');
    expect((await entrar(login, 'errada-errada-123')).corpo.code).toBe('CREDENCIAIS_INVALIDAS');
    // A recusa não deixou sessão no Auth nem no banco.
    expect(sql(`SELECT count(*) FROM public.sessao s JOIN public.usuario_sistema u ON u.id = s.usuario_id WHERE u.login = '${login}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM auth.sessions s JOIN public.usuario_sistema u ON u.auth_user_id = s.user_id WHERE u.login = '${login}'`)).toBe('0');
  });

  it('só quem tem o papel gerencia: porteiro, auditor, anon e administração->síndico são recusados', async () => {
    const corpo = { acao: 'criar', nome: 'Não Deve Existir', login: `nao.${sufixo()}`, papel: 'porteiro' };
    const porteiro = await admin(await token('joao.lima'), corpo);
    expect([porteiro.status, porteiro.corpo.code]).toEqual([403, 'SEM_PERMISSAO']);
    const auditor = await admin(await token('luiza.campos'), corpo);
    expect([auditor.status, auditor.corpo.code]).toEqual([403, 'SEM_PERMISSAO']);
    const semUsuario = await admin(ANON, corpo);
    expect(semUsuario.status).toBe(401);
    const adminCriaSindico = await admin(await token('paula.nogueira'), { ...corpo, papel: 'sindico' });
    expect([adminCriaSindico.status, adminCriaSindico.corpo.code]).toEqual([403, 'SEM_PERMISSAO']);
    expect(sql(`SELECT count(*) FROM public.usuario_sistema WHERE login = '${corpo.login}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM auth.users WHERE email NOT IN (SELECT auth_email FROM public.usuario_sistema WHERE auth_email IS NOT NULL)`)).toBe('0');
  });

  it('desativar derruba a sessão aberta na hora e impede o login; reativar devolve o acesso', async () => {
    const login = `des.${sufixo()}`;
    const criado = await admin(tokenSindico, { acao: 'criar', nome: 'Pessoa Desativável', login, papel: 'porteiro' });
    senhasDoTeste.push(criado.corpo.senhaTemporaria);
    const t = await token(login, criado.corpo.senhaTemporaria);
    expect((await sessaoAtual(t)).status).toBe(200);

    expect((await admin(tokenSindico, { acao: 'desativar', id: criado.corpo.usuario.id })).status).toBe(200);
    expect((await sessaoAtual(t)).corpo.code).toBe('SESSAO_INVALIDA');
    expect((await entrar(login, criado.corpo.senhaTemporaria)).corpo.code).toBe('CREDENCIAIS_INVALIDAS');
    expect(sql(`SELECT banned_until > now() FROM auth.users u JOIN public.usuario_sistema s ON s.auth_user_id = u.id WHERE s.login = '${login}'`)).toBe('t');

    expect((await admin(tokenSindico, { acao: 'reativar', id: criado.corpo.usuario.id })).status).toBe(200);
    expect((await entrar(login, criado.corpo.senhaTemporaria)).status).toBe(200);
  }, 30_000);

  it('redefinir senha: sessões do alvo caem, a senha antiga para de valer, a nova temporária exige troca', async () => {
    const tPaula = await token('paula.nogueira');
    const id = sql("SELECT id FROM public.usuario_sistema WHERE login = 'luiza.campos'");
    const tLuiza = await token('luiza.campos');
    const r = await admin(tPaula, { acao: 'redefinir_senha', id });
    expect(r.status).toBe(200);
    senhasDoTeste.push(r.corpo.senhaTemporaria);
    expect((await sessaoAtual(tLuiza)).corpo.code).toBe('SESSAO_INVALIDA');
    expect((await entrar('luiza.campos', SENHA_DEMO)).corpo.code).toBe('CREDENCIAIS_INVALIDAS');
    const tNova = await token('luiza.campos', r.corpo.senhaTemporaria);
    expect((await sessaoAtual(tNova)).corpo.usuario.deveTrocarSenha).toBe(true);
    // Devolve a senha de demonstração (a política recusa a senha DEMO como "comum": volta pelo SQL do Auth, só local).
    sql(`UPDATE auth.users SET encrypted_password = extensions.crypt('${SENHA_DEMO}', extensions.gen_salt('bf', 10))
          WHERE id = (SELECT auth_user_id FROM public.usuario_sistema WHERE login = 'luiza.campos')`);
    sql("UPDATE public.usuario_sistema SET deve_trocar_senha = false, senha_temporaria_expira_em = NULL WHERE login = 'luiza.campos'");
  }, 30_000);

  it('ninguém desativa ou redefine a si mesmo', async () => {
    const id = sql("SELECT id FROM public.usuario_sistema WHERE login = 'roberto.faria'");
    expect((await admin(tokenSindico, { acao: 'desativar', id })).corpo.code).toBe('AUTO_DESATIVACAO');
    expect((await admin(tokenSindico, { acao: 'redefinir_senha', id })).corpo.code).toBe('AUTO_REDEFINICAO');
  });
});

describe('logout e refresh', () => {
  it('refresh mantém a sessão; depois do logout, nem o token antigo nem o renovado valem', async () => {
    const r = await entrar('paula.nogueira', SENHA_DEMO);
    const { access_token, refresh_token } = r.corpo.auth;
    const renovado = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token });
    expect(renovado.status).toBe(200);
    expect((await sessaoAtual(renovado.corpo.access_token)).status).toBe(200);

    expect((await post('/rest/v1/rpc/sessao_encerrar', {}, { token: access_token, headers: { 'Content-Profile': 'api' } })).status).toBe(204);
    expect((await sessaoAtual(access_token)).corpo.code).toBe('SESSAO_INVALIDA');
    expect((await sessaoAtual(renovado.corpo.access_token)).corpo.code).toBe('SESSAO_INVALIDA');
  });
});

describe('higiene', () => {
  it('nenhuma senha usada nos testes aparece no log das Edge Functions', () => {
    const r = spawnSync('docker', ['logs', `supabase_edge_runtime_${PROJETO}`], { encoding: 'utf8' });
    const log = `${r.stdout}${r.stderr}`;
    expect(log.length).toBeGreaterThan(0);
    for (const s of senhasDoTeste) expect(log.includes(s), 'senha no log').toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(log), 'JWT no log').toBe(false);
  });
});
