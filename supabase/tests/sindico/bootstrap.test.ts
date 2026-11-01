// Primeiro síndico contra o Supabase LOCAL, pelo núcleo real do script (scripts/sindico) com a chave secreta local.
// Exige o banco SEM seed (o projeto hospedado nasce assim): `npm run test:supabase:sindico` faz o reset sem seed.
// Depois, `supabase db reset` volta o seed para as demais suítes.
// Pré-requisitos: supabase start e supabase functions serve --env-file supabase/functions/.env.local.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { criarPrimeiroSindico, type ErroBootstrap } from '../../../scripts/sindico/nucleo.ts';
import { dependenciasSupabase } from '../../../scripts/sindico/supabase.ts';

const CONTAINER = 'supabase_db_tcc-gestao-acesso';

function ambiente() {
  const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '')) throw new Error('API_URL não é o Supabase local: recusando rodar');
  if (!/^sb_secret_/.test(v.SECRET_KEY ?? '')) throw new Error('supabase status não devolveu SECRET_KEY (sb_secret_)');
  return { url: v.API_URL as string, anon: v.ANON_KEY as string, secreta: v.SECRET_KEY as string };
}
const { url: API, anon: ANON, secreta: SECRETA } = ambiente();

const sql = (comando: string): string => execFileSync('docker',
  ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { input: comando, encoding: 'utf8' }).trim();
const contar = (tabela: string) => Number(sql(`SELECT count(*) FROM ${tabela}`));

async function post(caminho: string, corpo: unknown, token = ANON, perfil?: string) {
  const r = await fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}`, ...(perfil ? { 'Content-Profile': perfil } : {}) },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: any = texto;
  try { json = JSON.parse(texto); } catch { /* não JSON */ }
  return { status: r.status, corpo: json };
}
const entrar = (login: string, senha: string) => post('/functions/v1/auth-entrar', { login, senha });

// Senhas sorteadas a cada execução (nenhuma fica no repositório nem vale fora deste banco).
const senhaNova = () => `teste-${randomUUID()}`;
const bootstrap = (login: string, senha: string) =>
  criarPrimeiroSindico({ nome: `Síndico ${login}`, login, senha }, dependenciasSupabase(API, SECRETA));

const senhasUsadas: string[] = [];
let sindico: { login: string; senha: string } | null = null;

beforeAll(async () => {
  if (contar('public.usuario_sistema') !== 0 || contar('auth.users') !== 0) {
    throw new Error('Banco com usuários: rode `npm run test:supabase:sindico` (faz supabase db reset --no-seed).');
  }
  // Logo depois do reset, o Auth e o PostgREST ainda estão reiniciando. A preparar não grava nada: serve de sonda.
  for (let i = 0; i < 60; i++) {
    const auth = await fetch(`${API}/auth/v1/health`, { headers: { apikey: ANON } }).then((r) => r.ok, () => false);
    const rest = await fetch(`${API}/rest/v1/rpc/bootstrap_sindico_preparar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SECRETA, 'Content-Profile': 'srv' },
      body: JSON.stringify({ p_nome: 'Sonda Teste', p_login: 'sonda.teste' }),
    }).then((r) => r.status === 200, () => false);
    if (auth && rest) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Auth ou PostgREST locais não responderam em 30 s');
});

describe('bootstrap do primeiro síndico (sistema vazio)', () => {
  it('corrida: duas execuções chegam enquanto uma terceira está no meio da criar; as duas esperam, recusam e apagam a conta do Auth', async () => {
    // A primeira execução é feita em passos para pausar DENTRO da transação da criar (pg_sleep antes do COMMIT): é a
    // janela em que, sem a trava, as outras ainda veriam a tabela vazia e criariam mais um síndico.
    const deps = dependenciasSupabase(API, SECRETA);
    const primeiro = { login: 'sonia.sindica', senha: senhaNova() };
    const { auth_email } = await deps.rpc<{ auth_email: string }>('bootstrap_sindico_preparar', { p_nome: 'Sônia Síndica', p_login: primeiro.login });
    const authId = await deps.criarConta(auth_email, primeiro.senha);
    const lenta = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const terminou = new Promise<number | null>((r) => lenta.on('exit', r));
    lenta.stdin.end(`BEGIN;
      SELECT srv.bootstrap_sindico_criar('Sônia Síndica', '${primeiro.login}', '${authId}', '${auth_email}');
      SELECT pg_sleep(3);
      COMMIT;`);
    const dormindo = `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid() AND query LIKE '%pg_sleep(3)%'`;
    for (let i = 0; i < 50 && sql(dormindo) === '0'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(sql(dormindo), 'a primeira execução não chegou ao pg_sleep').toBe('1');

    const inicio = Date.now();
    const outras = [{ login: 'otavio.sindico', senha: senhaNova() }, { login: 'olga.sindica', senha: senhaNova() }];
    senhasUsadas.push(primeiro.senha, ...outras.map((p) => p.senha));
    const fim: number[] = [];
    const r = await Promise.allSettled(outras.map((p, i) => bootstrap(p.login, p.senha).finally(() => { fim[i] = Date.now() - inicio; })));
    expect(await terminou).toBe(0);

    expect(r.map((x) => x.status === 'rejected' && (x.reason as ErroBootstrap).codigo)).toEqual(['SISTEMA_JA_INICIADO', 'SISTEMA_JA_INICIADO']);
    // Esperaram a trava até o COMMIT da primeira (o pg_sleep de 3 s): sem ela, voltariam em milissegundos.
    expect(Math.min(...fim)).toBeGreaterThanOrEqual(2000);
    expect(sql("SELECT string_agg(login || ':' || papel, ',') FROM public.usuario_sistema")).toBe('sonia.sindica:sindico');
    expect(contar('auth.users'), 'as contas do Auth de quem perdeu foram apagadas').toBe(1);
    expect(sql('SELECT u.auth_user_id = a.id FROM public.usuario_sistema u, auth.users a')).toBe('t');
    sindico = primeiro;
  });

  it('o síndico entra pela Edge auth-entrar, sem troca obrigatória', async () => {
    const r = await entrar(sindico!.login, sindico!.senha);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.usuario).toMatchObject({ login: sindico!.login, papel: 'sindico', deveTrocarSenha: false });
    const s = await post('/rest/v1/rpc/sessao_atual', {}, r.corpo.auth.access_token, 'api');
    expect(s.status).toBe(200);
    expect(s.corpo.usuario.papel).toBe('sindico');
  });

  it('o síndico cria um porteiro pela usuarios-admin, e o porteiro entra com a temporária', async () => {
    const tk = (await entrar(sindico!.login, sindico!.senha)).corpo.auth.access_token;
    const r = await post('/functions/v1/usuarios-admin', { acao: 'criar', nome: 'Pedro Porteiro', login: 'pedro.porteiro', papel: 'porteiro' }, tk);
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    expect(r.corpo.usuario).toMatchObject({ login: 'pedro.porteiro', papel: 'porteiro', deveTrocarSenha: true });
    const p = await entrar('pedro.porteiro', r.corpo.senhaTemporaria);
    expect(p.status).toBe(200);
    expect(p.corpo.usuario.deveTrocarSenha).toBe(true);
  });

  it('segunda execução recusa no banco antes de criar qualquer conta no Auth (também em paralelo)', async () => {
    const auth = contar('auth.users');
    const usuarios = contar('public.usuario_sistema');
    const r = await Promise.allSettled([bootstrap('novo.sindico', senhaNova()), bootstrap('outro.novo', senhaNova()), bootstrap(sindico!.login, senhaNova())]);
    expect(r.map((x) => x.status === 'rejected' && (x.reason as ErroBootstrap).codigo)).toEqual(Array(3).fill('SISTEMA_JA_INICIADO'));
    expect(contar('auth.users')).toBe(auth);
    expect(contar('public.usuario_sistema')).toBe(usuarios);
  });

  it('as srv.bootstrap_* não respondem à anon key nem à sessão do síndico', async () => {
    const tk = (await entrar(sindico!.login, sindico!.senha)).corpo.auth.access_token;
    for (const token of [ANON, tk]) {
      const r = await post('/rest/v1/rpc/bootstrap_sindico_preparar', { p_nome: 'Fulano Teste', p_login: 'fulano.teste' }, token, 'srv');
      expect(r.status, JSON.stringify(r.corpo)).toBeGreaterThanOrEqual(400);
      expect(r.corpo?.auth_email).toBeUndefined();
    }
  });

  it('trilha: um usuario.criar de instalação, sem senha nem e-mail sintético', () => {
    expect(sql(`SELECT count(*) || '|' || min(usuario_nome) || '|' || min(depois ->> 'login') FROM public.audit_log
                 WHERE acao = 'usuario.criar' AND depois ->> 'origem' = 'bootstrap'`)).toBe(`1|(instalação)|${sindico!.login}`);
    const trilha = sql(`SELECT coalesce(string_agg(coalesce(antes::text, '') || coalesce(depois::text, '') || usuario_nome, ' '), '') FROM public.audit_log`);
    for (const s of senhasUsadas) expect(trilha).not.toContain(s);
    expect(trilha).not.toContain('@usuarios.portaria.invalid');
  });
});
