// Bootstrap do primeiro síndico sem terminal nem rede: núcleo com dependências falsas, busca da chave com fetch falso
// e a camada interativa com um TTY simulado. A integração real (Auth, Edge, banco) está em supabase/tests/sindico.
import { randomUUID } from 'node:crypto';
import { obterChaveServico } from './chave.ts';
import { criarPrimeiroSindico, ErroBootstrap, type Dependencias } from './nucleo.ts';
import { executar, type EntradaTerminal } from './terminal.ts';

// Sorteada a cada execução: nenhuma senha fixa que passe na política fica no repositório.
const SENHA = `teste-${randomUUID()}`;
const EMAIL = 'u-11111111-1111-4111-8111-111111111111@usuarios.portaria.invalid';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';
const USUARIO = { id: 'x', nome: 'Sônia Síndica', login: 'sonia.sindica', papel: 'sindico', deveTrocarSenha: false };

function falsas(sobre: Partial<Record<'preparar' | 'criar' | 'criarConta' | 'apagarConta', () => Promise<unknown>>> = {}) {
  const chamadas: Array<[string, unknown]> = [];
  const d: Dependencias = {
    async rpc<T>(nome: string, args: Record<string, unknown>) {
      chamadas.push([nome, args]);
      if (nome === 'bootstrap_sindico_preparar') return ((await sobre.preparar?.()) ?? { auth_email: EMAIL }) as T;
      return ((await sobre.criar?.()) ?? { usuario: USUARIO }) as T;
    },
    async criarConta(email, senha) { chamadas.push(['criarConta', { email, senha }]); return ((await sobre.criarConta?.()) ?? AUTH_ID) as string; },
    async apagarConta(id) { chamadas.push(['apagarConta', id]); await sobre.apagarConta?.(); },
  };
  return { d, chamadas, nomes: () => chamadas.map(([n]) => n) };
}
const entrada = { nome: ' Sônia Síndica ', login: ' Sonia.Sindica ', senha: SENHA };
const recusa = (codigo: string) => () => Promise.reject(new ErroBootstrap(codigo, 'recusado'));

describe('núcleo: criarPrimeiroSindico', () => {
  it('ordem da usuarios-admin: preparar -> Auth -> criar, com o e-mail que o banco sorteou', async () => {
    const f = falsas();
    await expect(criarPrimeiroSindico(entrada, f.d)).resolves.toEqual(USUARIO);
    expect(f.nomes()).toEqual(['bootstrap_sindico_preparar', 'criarConta', 'bootstrap_sindico_criar']);
    expect(f.chamadas[0][1]).toEqual({ p_nome: 'Sônia Síndica', p_login: 'sonia.sindica' });
    expect(f.chamadas[1][1]).toEqual({ email: EMAIL, senha: SENHA });
    expect(f.chamadas[2][1]).toEqual({ p_nome: 'Sônia Síndica', p_login: 'sonia.sindica', p_auth_user_id: AUTH_ID, p_auth_email: EMAIL });
  });

  it('a senha só vai ao Auth, nunca ao banco', async () => {
    const f = falsas();
    await criarPrimeiroSindico(entrada, f.d);
    const aoBanco = JSON.stringify(f.chamadas.filter(([n]) => n.startsWith('bootstrap_')));
    expect(aoBanco).not.toContain(SENHA);
  });

  it.each([
    ['curta', 'onze-letras'],
    ['comum', 'Demo-Portaria-2026'],
    ['com o login', 'xx-sonia.sindica-xx'],
    ['acima de 72 bytes', 'ç'.repeat(37)],
    ['um caractere só', 'aaaaaaaaaaaaaaaa'],
  ])('senha %s: recusa antes de qualquer chamada', async (_c, senha) => {
    const f = falsas();
    await expect(criarPrimeiroSindico({ ...entrada, senha }, f.d)).rejects.toMatchObject({ codigo: 'SENHA_FRACA' });
    expect(f.chamadas).toEqual([]);
  });

  it('banco recusa no preparar (já há usuário): o Auth nem é chamado', async () => {
    const f = falsas({ preparar: recusa('SISTEMA_JA_INICIADO') });
    await expect(criarPrimeiroSindico(entrada, f.d)).rejects.toMatchObject({ codigo: 'SISTEMA_JA_INICIADO' });
    expect(f.nomes()).toEqual(['bootstrap_sindico_preparar']);
  });

  it('Auth falha: não grava no banco nem tenta apagar', async () => {
    const f = falsas({ criarConta: recusa('AUTH_RECUSOU') });
    await expect(criarPrimeiroSindico(entrada, f.d)).rejects.toMatchObject({ codigo: 'AUTH_RECUSOU' });
    expect(f.nomes()).toEqual(['bootstrap_sindico_preparar', 'criarConta']);
  });

  it('banco recusa no criar (corrida perdida): apaga a conta do Auth e devolve o erro do banco', async () => {
    const f = falsas({ criar: recusa('SISTEMA_JA_INICIADO') });
    await expect(criarPrimeiroSindico(entrada, f.d)).rejects.toMatchObject({ codigo: 'SISTEMA_JA_INICIADO' });
    expect(f.chamadas.at(-1)).toEqual(['apagarConta', AUTH_ID]);
  });

  it('banco cai no criar (erro qualquer): também apaga', async () => {
    const f = falsas({ criar: () => Promise.reject(new TypeError('fetch failed')) });
    await expect(criarPrimeiroSindico(entrada, f.d)).rejects.toThrow('fetch failed');
    expect(f.chamadas.at(-1)).toEqual(['apagarConta', AUTH_ID]);
  });

  it('não conseguiu apagar: CONTA_ORFA com o id para limpeza manual', async () => {
    const f = falsas({ criar: recusa('SISTEMA_JA_INICIADO'), apagarConta: recusa('AUTH_RECUSOU') });
    await expect(criarPrimeiroSindico(entrada, f.d)).rejects.toMatchObject({ codigo: 'CONTA_ORFA', authUserId: AUTH_ID });
  });
});

describe('chave de serviço pela Management API', () => {
  const REF = 'abcdefghijklmnopqrst';
  const resposta = (corpo: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(corpo), { status }));

  it('pede com reveal e o token da conta, e prefere a chave secreta nova', async () => {
    const buscar = resposta([
      { name: 'service_role', type: 'legacy', api_key: 'a.b.c' },
      { name: 'default', type: 'secret', api_key: 'sb_secret_0123456789abcdefXYZ' },
    ]);
    await expect(obterChaveServico(REF, 'sbp_token', buscar)).resolves.toBe('sb_secret_0123456789abcdefXYZ');
    expect(buscar).toHaveBeenCalledWith(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sbp_token' }) }));
  });

  it('secreta mascarada: usa a service_role legada', async () => {
    const buscar = resposta([
      { name: 'default', type: 'secret', api_key: 'sb_secret_0123····' },
      { name: 'service_role', type: 'legacy', api_key: 'eyJhbGciOi.eyJyb2xlIjo.assinatura' },
    ]);
    await expect(obterChaveServico(REF, 't', buscar)).resolves.toBe('eyJhbGciOi.eyJyb2xlIjo.assinatura');
  });

  it('sem chave utilizável, HTTP de erro ou ref inválido: falha sem expor o token', async () => {
    await expect(obterChaveServico(REF, 't', resposta([{ name: 'anon', type: 'legacy', api_key: 'a.b.c' }]))).rejects.toMatchObject({ codigo: 'MANAGEMENT_API' });
    const erro = await obterChaveServico(REF, 'sbp_segredo', resposta({ message: 'Unauthorized' }, 401)).catch((e) => e);
    expect(erro).toMatchObject({ codigo: 'MANAGEMENT_API' });
    expect(String(erro.message)).not.toContain('sbp_segredo');
    const buscar = resposta([]);
    await expect(obterChaveServico('../outro', 't', buscar)).rejects.toMatchObject({ codigo: 'CONFIGURACAO' });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('terminal', () => {
  const REF = 'abcdefghijklmnopqrst';
  const ENV = { VITE_SUPABASE_PROJECT_ID: REF, VITE_SUPABASE_URL: `https://${REF}.supabase.co/`, SUPABASE_ACCESS_TOKEN: 'sbp_token' };
  const CHAVE = 'sb_secret_0123456789abcdefXYZ';

  function tty(digitado: string, isTTY = true) {
    const ouvintes: Record<string, Array<(x?: unknown) => void>> = {};
    const raw: boolean[] = [];
    const entrada: EntradaTerminal = {
      isTTY,
      setRawMode: (r: boolean) => { raw.push(r); },
      setEncoding: () => undefined,
      on: (ev: string, fn: (x?: unknown) => void) => { (ouvintes[ev] ??= []).push(fn); },
      removeAllListeners: () => undefined,
      resume: () => { setTimeout(() => { for (const fn of ouvintes.data ?? []) fn(digitado); }, 0); },
      pause: () => undefined,
    } as EntradaTerminal;
    let escrito = '';
    return { entrada, saida: { write: (t: string) => { escrito += t; } }, escrito: () => escrito, raw };
  }
  const buscar = vi.fn(async () => new Response(JSON.stringify([{ name: 'default', type: 'secret', api_key: CHAVE }])));

  it('fluxo completo: senha sem eco, confirmada, chave só em memória, código 0', async () => {
    const f = falsas();
    const recebeu: string[] = [];
    const t = tty(`Sônia Síndica\rsonia.sindica\r${SENHA}\r${SENHA}\r${REF}\r`);
    const codigo = await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar,
      criarDependencias: (url, chave) => { recebeu.push(url, chave); return f.d; } });
    expect(codigo).toBe(0);
    expect(recebeu).toEqual([`https://${REF}.supabase.co`, CHAVE]);
    expect(f.chamadas[1][1]).toEqual({ email: EMAIL, senha: SENHA });
    expect(t.escrito()).toContain('Síndico "sonia.sindica" criado');
    expect(t.escrito()).toContain('Sônia Síndica');
    expect(t.escrito()).not.toContain(SENHA);
    expect(t.escrito()).not.toContain(CHAVE);
    expect(t.raw).toEqual([true, false]);
  });

  it('confirmação diferente e senha fraca: pede de novo; backspace funciona', async () => {
    const f = falsas();
    const t = tty(`Sônia Síndica\rsonia.sindica\rcurta\r${SENHA}\routra-senha-qualquer\r${SENHA}x\u007f\r${SENHA}\r${REF}\r`);
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar, criarDependencias: () => f.d })).toBe(0);
    expect(t.escrito()).toContain('pelo menos 12');
    expect(t.escrito()).toContain('As senhas não conferem');
    expect(f.chamadas[1][1]).toEqual({ email: EMAIL, senha: SENHA });
  });

  it('três senhas recusadas: desiste sem chamar nada', async () => {
    const f = falsas();
    const t = tty('Sônia Síndica\rsonia.sindica\rcurta\rcurta\rcurta\r');
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar, criarDependencias: () => f.d })).toBe(1);
    expect(f.chamadas).toEqual([]);
  });

  it('ID do projeto não confere: cancela antes de buscar a chave', async () => {
    const f = falsas();
    const b = vi.fn();
    const t = tty(`Sônia Síndica\rsonia.sindica\r${SENHA}\r${SENHA}\routro\r`);
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar: b, criarDependencias: () => f.d })).toBe(1);
    expect(b).not.toHaveBeenCalled();
    expect(f.chamadas).toEqual([]);
  });

  it('Ctrl-C no meio: cancela e devolve o terminal ao modo normal', async () => {
    const t = tty('Sônia\u0003');
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar })).toBe(1);
    expect(t.escrito()).toContain('Nada foi criado');
    expect(t.raw).toEqual([true, false]);
  });

  it('sem TTY (pipe ou arquivo): recusa sem ler nada', async () => {
    const t = tty(`x\r${SENHA}\r`, false);
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar })).toBe(2);
    expect(t.raw).toEqual([]);
  });

  it('URL de outro projeto que não o do ID: recusa', async () => {
    const t = tty('');
    const env = { ...ENV, VITE_SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' };
    expect(await executar({ env, entrada: t.entrada, saida: t.saida, buscar })).toBe(2);
  });

  it('erro do banco aparece com o código, sem a senha', async () => {
    const f = falsas({ preparar: recusa('SISTEMA_JA_INICIADO') });
    const t = tty(`Sônia Síndica\rsonia.sindica\r${SENHA}\r${SENHA}\r${REF}\r`);
    expect(await executar({ env: ENV, entrada: t.entrada, saida: t.saida, buscar, criarDependencias: () => f.d })).toBe(1);
    expect(t.escrito()).toContain('SISTEMA_JA_INICIADO');
    expect(t.escrito()).not.toContain(SENHA);
  });
});
