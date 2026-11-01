// Configuração (credenciais e alvo) e linha de comando do carregador, sem rede.
import { ErroConfiguracao, lerCredenciaisTexto, obterCredenciais, resolverAlvo } from './configuracao';
import { executar } from './programa';

describe('configuração', () => {
  const SENHA = 'senha-de-teste-ficticia-123';

  it('lê login e senha do arquivo e ignora o resto', () => {
    expect(lerCredenciaisTexto(`# comentário\nlogin: sindico.teste\r\nsenha: ${SENHA}\noutra: coisa\n`)).toEqual({ login: 'sindico.teste', senha: SENHA });
    expect(lerCredenciaisTexto('login: so.login\n')).toBeNull();
  });

  it('o ambiente vence o arquivo, e nenhuma mensagem de erro leva a senha', () => {
    const ler = vi.fn(() => `login: do.arquivo\nsenha: ${SENHA}`);
    expect(obterCredenciais({ POPULAR_LOGIN: 'do.env', POPULAR_SENHA: 'outra' }, ler, 'x')).toEqual({ login: 'do.env', senha: 'outra' });
    expect(ler).not.toHaveBeenCalled();
    expect(obterCredenciais({}, ler, 'cred.txt')).toEqual({ login: 'do.arquivo', senha: SENHA });
    for (const f of [() => obterCredenciais({ POPULAR_SENHA: SENHA }, ler, 'x'), () => obterCredenciais({}, () => `senha: ${SENHA}`, 'x'), () => obterCredenciais({}, () => null, 'x')]) {
      let msg = '';
      try { f(); } catch (e) { msg = String((e as Error).message); expect(e).toBeInstanceOf(ErroConfiguracao); }
      expect(msg).not.toBe('');
      expect(msg).not.toContain(SENHA);
    }
  });

  it('alvo: exige POPULAR_CONFIRMAR igual ao host, aceita só local ou *.supabase.co e recusa chave de serviço', () => {
    const local = { POPULAR_SUPABASE_URL: 'http://127.0.0.1:54321', POPULAR_SUPABASE_ANON_KEY: 'chave-anon-local' };
    expect(() => resolverAlvo(local)).toThrow(/POPULAR_CONFIRMAR=127\.0\.0\.1:54321/);
    expect(resolverAlvo({ ...local, POPULAR_CONFIRMAR: '127.0.0.1:54321' })).toMatchObject({ host: '127.0.0.1:54321', local: true });
    const hosp = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' };
    expect(() => resolverAlvo({ ...hosp, POPULAR_CONFIRMAR: '127.0.0.1:54321' })).toThrow(/HOSPEDADO/);
    expect(resolverAlvo({ ...hosp, POPULAR_CONFIRMAR: 'abcdefghijklmnopqrst.supabase.co' })).toMatchObject({ local: false });
    expect(resolverAlvo({ ...hosp, ...local, POPULAR_CONFIRMAR: '127.0.0.1:54321' }).local).toBe(true);
    expect(() => resolverAlvo({ ...hosp, VITE_SUPABASE_URL: 'https://exemplo.com' })).toThrow(/URL/);
    expect(() => resolverAlvo({ ...hosp, VITE_SUPABASE_ANON_KEY: 'sb_secret_abc', POPULAR_CONFIRMAR: 'abcdefghijklmnopqrst.supabase.co' })).toThrow(/serviço/);
    const jwt = ['e30', Buffer.from('{"role":"service_role"}').toString('base64url'), 'x'].join('.');
    expect(() => resolverAlvo({ ...hosp, VITE_SUPABASE_ANON_KEY: jwt, POPULAR_CONFIRMAR: 'abcdefghijklmnopqrst.supabase.co' })).toThrow(/serviço/);
  });
});

describe('linha de comando', () => {
  const contexto = (argv: string[], env: Record<string, string> = {}) => {
    const saida: string[] = [];
    const conectar = vi.fn(() => { throw new Error('rede não deveria ser chamada'); });
    const lerArquivo = vi.fn(() => { throw new Error('credenciais não deveriam ser lidas'); });
    return { saida, conectar, lerArquivo, ctx: { argv, env, escrever: (t: string) => saida.push(t), lerArquivo, caminhoCredenciais: 'x', conectar } };
  };

  it('--dry-run valida e não lê credencial nem faz nenhuma chamada de rede', async () => {
    const fetchOriginal = globalThis.fetch;
    const fetchEspiao = vi.fn(() => Promise.reject(new Error('sem rede')));
    globalThis.fetch = fetchEspiao as unknown as typeof fetch;
    try {
      const t = contexto(['--dry-run'], { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_ANON_KEY: 'x' });
      expect(await executar(t.ctx)).toBe(0);
      expect(t.conectar).not.toHaveBeenCalled();
      expect(t.lerArquivo).not.toHaveBeenCalled();
      expect(fetchEspiao).not.toHaveBeenCalled();
      expect(t.saida.join('')).toMatch(/Moradores: 543[\s\S]*nenhuma chamada de rede/);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('sem --dry-run e sem POPULAR_CONFIRMAR recusa antes de ler a credencial e de conectar', async () => {
    const t = contexto([], { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' });
    expect(await executar(t.ctx)).toBe(2);
    expect(t.conectar).not.toHaveBeenCalled();
    expect(t.lerArquivo).not.toHaveBeenCalled();
    expect(t.saida.join('')).toMatch(/POPULAR_CONFIRMAR=abcdefghijklmnopqrst\.supabase\.co/);
  });
});
