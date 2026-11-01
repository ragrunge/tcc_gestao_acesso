// Camada interativa do `npm run sb:sindico`. Só roda em terminal de verdade (TTY): a senha não pode chegar por pipe,
// argumento, variável de ambiente ou arquivo. A senha é lida em modo raw, sem eco, e confirmada.
import { obterChaveServico } from './chave.ts';
import { criarPrimeiroSindico, ErroBootstrap, normalizarLogin, problemasDaEntrada, type Dependencias, type Entrada } from './nucleo.ts';
import { dependenciasSupabase } from './supabase.ts';

export interface EntradaTerminal {
  isTTY?: boolean;
  setRawMode?(raw: boolean): unknown;
  setEncoding?(enc: BufferEncoding): unknown;
  on(evento: 'data', fn: (b: string | Buffer) => void): unknown;
  on(evento: 'end', fn: () => void): unknown;
  removeAllListeners(evento?: string): unknown;
  resume(): unknown;
  pause(): unknown;
}
export interface SaidaTerminal { write(texto: string): unknown }

class Cancelado extends Error {}

function criarLeitor(entrada: EntradaTerminal) {
  const fila: string[] = [];
  let acordar: (() => void) | null = null;
  let fim = false;
  entrada.on('data', (b) => { for (const ch of String(b)) fila.push(ch); acordar?.(); });
  entrada.on('end', () => { fim = true; acordar?.(); });
  return async (): Promise<string | null> => {
    while (!fila.length) {
      if (fim) return null;
      await new Promise<void>((r) => { acordar = r; });
      acordar = null;
    }
    return fila.shift()!;
  };
}

type Leitor = ReturnType<typeof criarLeitor>;

async function lerCampo(ler: Leitor, saida: SaidaTerminal, rotulo: string, eco: boolean): Promise<string> {
  saida.write(rotulo);
  let valor = '';
  for (;;) {
    const ch = await ler();
    if (ch === null || ch === '\u0003' || (ch === '\u0004' && !valor)) { saida.write('\n'); throw new Cancelado(); }
    if (ch === '\r' || ch === '\n') { saida.write('\n'); return valor; }
    if (ch === '\u007f' || ch === '\b') {
      if (valor) { valor = Array.from(valor).slice(0, -1).join(''); if (eco) saida.write('\b \b'); }
      continue;
    }
    if (ch < ' ') continue;
    valor += ch;
    if (eco) saida.write(ch);
  }
}

const TENTATIVAS = 3;

export async function coletarEntrada(ler: Leitor, saida: SaidaTerminal): Promise<Entrada> {
  const nome = (await lerCampo(ler, saida, 'Nome completo do síndico: ', true)).trim();
  const login = normalizarLogin(await lerCampo(ler, saida, 'Login (3 a 40 caracteres, a-z, 0-9, ".", "-", "_"): ', true));
  for (let i = 0; i < TENTATIVAS; i++) {
    const senha = await lerCampo(ler, saida, 'Senha (não aparece na tela): ', false);
    const problemas = problemasDaEntrada({ nome, login, senha });
    if (problemas.length) { saida.write(problemas.map((p) => `  - ${p}\n`).join('')); continue; }
    if ((await lerCampo(ler, saida, 'Repita a senha: ', false)) !== senha) { saida.write('  - As senhas não conferem.\n'); continue; }
    return { nome, login, senha };
  }
  throw new ErroBootstrap('SENHA_FRACA', `Senha não aceita em ${TENTATIVAS} tentativas.`);
}

export interface Contexto {
  env: Record<string, string | undefined>;
  entrada: EntradaTerminal;
  saida: SaidaTerminal;
  buscar?: typeof fetch;
  criarDependencias?: (url: string, chaveServico: string) => Dependencias;
}

/** Devolve o código de saída do processo. */
export async function executar(ctx: Contexto): Promise<number> {
  const { env, entrada, saida } = ctx;
  if (!entrada.isTTY || typeof entrada.setRawMode !== 'function') {
    saida.write('Recusado: rode num terminal interativo (a senha não é aceita por pipe nem por arquivo).\n');
    return 2;
  }
  const ref = env.VITE_SUPABASE_PROJECT_ID ?? '';
  const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  if (url !== `https://${ref}.supabase.co`) {
    saida.write('Recusado: VITE_SUPABASE_URL precisa ser https://<VITE_SUPABASE_PROJECT_ID>.supabase.co.\n');
    return 2;
  }

  entrada.setEncoding?.('utf8');
  entrada.setRawMode(true);
  entrada.resume();
  const ler = criarLeitor(entrada);
  try {
    saida.write(`Primeiro usuário (síndico) do projeto ${ref}. Só funciona com o sistema sem nenhum usuário.\n`);
    const dados = await coletarEntrada(ler, saida);
    if ((await lerCampo(ler, saida, `Para confirmar, digite o ID do projeto (${ref}): `, true)).trim() !== ref) {
      saida.write('Cancelado: ID não confere. Nada foi criado.\n');
      return 1;
    }
    const chave = await obterChaveServico(ref, env.SUPABASE_ACCESS_TOKEN ?? '', ctx.buscar);
    const deps = (ctx.criarDependencias ?? dependenciasSupabase)(url, chave);
    const u = await criarPrimeiroSindico(dados, deps);
    saida.write(`Síndico "${u.login}" criado. Entre no sistema com esse login e a senha escolhida.\n`);
    return 0;
  } catch (e) {
    if (e instanceof Cancelado) { saida.write('Cancelado. Nada foi criado.\n'); return 1; }
    if (e instanceof ErroBootstrap) {
      saida.write(`Falhou (${e.codigo}): ${e.message}\n`);
      if (e.authUserId) saida.write(`Conta do Auth a apagar: ${e.authUserId}\n`);
      return 1;
    }
    // Sem detalhe do erro: pode carregar dado da requisição.
    saida.write(`Falhou: erro inesperado (${(e as Error)?.name ?? typeof e}). Confira se algo foi criado antes de repetir.\n`);
    return 1;
  } finally {
    entrada.setRawMode(false);
    entrada.removeAllListeners('data');
    entrada.removeAllListeners('end');
    entrada.pause();
  }
}
