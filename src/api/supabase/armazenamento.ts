// Onde o supabase-js guarda a sessão (desenho §2.7, regressão aceita: o token sai do cookie httpOnly). "Manter
// conectado" (só fora da portaria, decidido pelo servidor) usa localStorage; o resto, sessionStorage, que some ao
// fechar a aba: o terminal compartilhado da portaria não carrega a sessão do turno anterior.
// Todo acesso ao storage é protegido: navegador privado ou storage bloqueado não derruba a tela (cai em memória).

export type ModoSessao = 'local' | 'sessao';

export interface ArmazenamentoSessao {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
  /** Login: onde a sessão nova vai morar. */
  usar(modo: ModoSessao): void;
  /** Apaga a sessão dos dois lugares (logout, sessão recusada pelo servidor). */
  limpar(): void;
}

const seguro = <T>(fn: () => T, padrao: T): T => {
  try { return fn(); } catch { return padrao; }
};

export function criarArmazenamentoSessao(
  local: Storage | undefined = seguro(() => globalThis.localStorage, undefined),
  sessao: Storage | undefined = seguro(() => globalThis.sessionStorage, undefined),
): ArmazenamentoSessao {
  let modo: ModoSessao | null = null;
  const memoria = new Map<string, string>();
  const chaves = new Set<string>();
  // Depois de recarregar a página o modo não está em memória: segue onde a sessão já está.
  const modoDe = (k: string): ModoSessao => modo ?? (seguro(() => local?.getItem(k), null) != null ? 'local' : 'sessao');

  return {
    getItem(k) {
      chaves.add(k);
      return seguro(() => sessao?.getItem(k), null) ?? seguro(() => local?.getItem(k), null) ?? memoria.get(k) ?? null;
    },
    setItem(k, v) {
      chaves.add(k);
      const destino = modoDe(k) === 'local' ? local : sessao;
      const outro = destino === local ? sessao : local;
      const gravou = seguro(() => { destino?.setItem(k, v); return !!destino; }, false);
      seguro(() => outro?.removeItem(k), undefined);
      if (gravou) memoria.delete(k); else memoria.set(k, v);
    },
    removeItem(k) {
      seguro(() => local?.removeItem(k), undefined);
      seguro(() => sessao?.removeItem(k), undefined);
      memoria.delete(k);
    },
    usar(m) { modo = m; },
    limpar() {
      for (const k of chaves) this.removeItem(k);
      modo = null;
    },
  };
}
