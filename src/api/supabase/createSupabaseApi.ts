// Adaptador da interface Api sobre o Supabase (desenho §6), fase F1: só a autenticação e a parte de usuários que
// passa pela Edge usuarios-admin. Os demais métodos respondem ApiError 501 NAO_MIGRADO (erro claro na tela) até as
// fases seguintes; o createHttpApi continua no repo como referência do contrato, sem ser usado.
//
// Sessão: o token do Supabase Auth (supabase-js) fica no navegador (armazenamento.ts). Quem decide se a sessão vale é
// o banco (app.ator() em toda RPC): revogada, expirada, inativa ou de usuário desativado responde 401, e o adaptador
// avisa o AuthContext ('expirada') e apaga a sessão local. Troca obrigatória pendente: 403 -> 'troca_obrigatoria'.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';
import type { UsuarioSistema } from '@portaria/domain/types';
import { ApiError, type Api, type CondominioSessao, type EventoSessao, type UsuarioComSenhaTemporaria, type UsuarioSessao } from '../types';
import { segundosRetryAfter, tempoLegivel } from '../http/cliente';
import type { ArmazenamentoSessao } from './armazenamento';

const respostaInvalida = () => new ApiError(502, 'RESPOSTA_INVALIDA', 'Resposta inesperada do servidor.');

function mensagemPorStatus(status: number): string {
  if (status === 401) return 'Entre no sistema para continuar.';
  if (status === 403) return 'Seu perfil não tem permissão para esta ação.';
  if (status === 404) return 'Recurso não encontrado.';
  if (status === 429) return 'Muitas tentativas. Aguarde e tente novamente.';
  if (status >= 500) return 'O servidor não respondeu como esperado. Tente novamente em instantes.';
  return 'Requisição recusada.';
}

const semRede = () => new ApiError(0, 'FALHA_DE_REDE',
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'Sem conexão — o sistema precisa de internet para registrar.'
    : 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.');

/** Os detalhes vêm serializados do banco (o PostgREST só aceita texto ali). */
function detalhesDe(d: unknown): unknown {
  if (typeof d !== 'string') return d ?? undefined;
  try { return JSON.parse(d); } catch { return d; }
}

/** Erro de RPC (PostgREST). Código nosso = MAIÚSCULAS (RAISE PGRST); outro (42501, PGRST301...) só pelo status. */
export function erroDeRpc(erro: { code?: string; message?: string; details?: unknown }, status: number): ApiError {
  if (!status) return semRede();
  const nosso = typeof erro.code === 'string' && /^[A-Z_]+$/.test(erro.code);
  const codigo = nosso ? erro.code! : status === 401 || status === 403 ? 'NAO_AUTENTICADO' : `HTTP_${status}`;
  const st = !nosso && status === 403 ? 401 : status; // sem EXECUTE (403/401 do PostgREST) = sem sessão de usuário
  return new ApiError(st, codigo, nosso && erro.message ? erro.message : mensagemPorStatus(st), nosso ? detalhesDe(erro.details) : undefined);
}

/** Erro de Edge Function: corpo { code, message, details } e, no 429, Retry-After. */
export async function erroDeEdge(erro: unknown): Promise<ApiError> {
  if (erro instanceof FunctionsFetchError) return semRede();
  if (erro instanceof FunctionsRelayError) return new ApiError(502, 'HTTP_502', mensagemPorStatus(502));
  if (!(erro instanceof FunctionsHttpError)) return new ApiError(0, 'ERRO_DESCONHECIDO', 'Erro inesperado.');
  const r = erro.context as Response;
  let corpo: { code?: unknown; message?: unknown; details?: unknown } = {};
  try { corpo = await r.clone().json(); } catch { /* corpo não JSON */ }
  const codigo = typeof corpo.code === 'string' && /^[A-Z_]+$/.test(corpo.code) ? corpo.code : `HTTP_${r.status}`;
  let mensagem = typeof corpo.message === 'string' && corpo.message ? corpo.message : mensagemPorStatus(r.status);
  let espera: number | undefined;
  if (r.status === 429) {
    espera = segundosRetryAfter(r.headers.get('retry-after') ?? undefined);
    if (espera !== undefined) mensagem = `Muitas tentativas. Tente novamente em ${tempoLegivel(espera)}.`;
  }
  const e = new ApiError(r.status, codigo, mensagem, corpo.details ?? undefined);
  if (espera !== undefined) e.retryAfterSegundos = espera;
  return e;
}

function usuarioDe(u: unknown): UsuarioSessao {
  const x = u as Partial<UsuarioSessao> | null;
  if (!x || typeof x.id !== 'string' || typeof x.login !== 'string' || typeof x.papel !== 'string') throw respostaInvalida();
  return {
    id: x.id, nome: String(x.nome ?? ''), login: x.login, papel: x.papel, ativo: x.ativo !== false,
    ultimoAcesso: typeof x.ultimoAcesso === 'number' ? x.ultimoAcesso : null, deveTrocarSenha: x.deveTrocarSenha === true,
  };
}

function condominioDe(c: unknown): CondominioSessao | null {
  const nome = (c as { nome?: unknown } | null)?.nome;
  return typeof nome === 'string' && nome.trim() ? { nome } : null;
}

function gerido(u: unknown): UsuarioSistema {
  const base = usuarioDe(u);
  const x = u as { senhaTemporariaExpiraEm?: unknown };
  return { ...base, senhaTemporariaExpiraEm: typeof x.senhaTemporariaExpiraEm === 'number' ? x.senhaTemporariaExpiraEm : null };
}

function comSenhaTemporaria(r: unknown): UsuarioComSenhaTemporaria {
  const x = r as { usuario?: unknown; senhaTemporaria?: unknown } | null;
  if (!x || typeof x.senhaTemporaria !== 'string') throw respostaInvalida();
  return { usuario: gerido(x.usuario), senhaTemporaria: x.senhaTemporaria };
}

interface RespostaLogin {
  usuario: unknown; condominio: unknown;
  sessao: { manterConectado?: boolean };
  auth: { access_token: string; refresh_token: string };
}

export interface OpcoesSupabaseApi {
  /** Chave anon/publishable: o login vai com ela, nunca com uma sessão antiga que esteja no storage. */
  chaveAnon: string;
  armazenamento?: ArmazenamentoSessao;
}

/** Namespace ainda não migrado: qualquer método rejeita com 501 NAO_MIGRADO. */
function naoMigrado(ns: string): unknown {
  return new Proxy({}, {
    get: (_alvo, metodo) => (typeof metodo === 'string'
      ? () => Promise.reject(new ApiError(501, 'NAO_MIGRADO', `Função ainda não disponível nesta versão (${ns}.${metodo}).`))
      : undefined),
  });
}

export function createSupabaseApi(sb: SupabaseClient, opcoes: OpcoesSupabaseApi): Api {
  const ouvintes = new Set<(e: EventoSessao) => void>();
  // Um aviso por "vida" da sessão (N chamadas paralelas com 401 emitem um só), como o cliente HTTP antigo.
  let expiradaAvisada = false;
  let trocaAvisada = false;
  let encerrando = false;
  const emitir = (e: EventoSessao) => ouvintes.forEach((cb) => cb(e));
  const sessaoAtiva = () => { expiradaAvisada = false; trocaAvisada = false; };

  async function apagarSessaoLocal() {
    try { await sb.auth.signOut({ scope: 'local' }); } catch { /* sem rede: o storage é limpo abaixo */ }
    opcoes.armazenamento?.limpar();
  }

  function observar(e: ApiError) {
    if (e.status === 401 && !expiradaAvisada) {
      expiradaAvisada = true;
      void apagarSessaoLocal();
      emitir('expirada');
    } else if (e.status === 403 && e.code === 'TROCA_DE_SENHA_OBRIGATORIA' && !trocaAvisada) {
      trocaAvisada = true;
      emitir('troca_obrigatoria');
    }
  }

  // Refresh recusado pelo Auth (banido, refresh revogado): o supabase-js encerra a sessão por conta própria.
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && !encerrando && !expiradaAvisada) {
      expiradaAvisada = true;
      emitir('expirada');
    }
  });

  async function rpc<T>(nome: string, args: Record<string, unknown> = {}, avisar = true): Promise<T> {
    let r;
    try {
      r = await sb.schema('api').rpc(nome, args);
    } catch {
      throw semRede();
    }
    if (r.error) {
      const e = erroDeRpc(r.error, r.status);
      if (avisar) observar(e);
      throw e;
    }
    return r.data as T;
  }

  async function edge<T>(nome: string, corpo: unknown, opc: { avisar?: boolean; anon?: boolean } = {}): Promise<T> {
    const { data, error } = await sb.functions.invoke(nome, {
      body: corpo as Record<string, unknown>,
      ...(opc.anon ? { headers: { Authorization: `Bearer ${opcoes.chaveAnon}` } } : {}),
    });
    if (error) {
      const e = await erroDeEdge(error);
      if (opc.avisar !== false) observar(e);
      throw e;
    }
    return data as T;
  }

  const api = {
    aoEventoSessao(cb: (e: EventoSessao) => void) { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; },
    auth: {
      async login(i) {
        const corpo = i.manterConectado ? { login: i.login, senha: i.senha, manterConectado: true } : { login: i.login, senha: i.senha };
        const r = await edge<RespostaLogin>('auth-entrar', corpo, { avisar: false, anon: true });
        if (!r?.auth?.access_token || !r.auth.refresh_token) throw respostaInvalida();
        const usuario = usuarioDe(r.usuario);
        opcoes.armazenamento?.usar(r.sessao?.manterConectado ? 'local' : 'sessao');
        const { error } = await sb.auth.setSession({ access_token: r.auth.access_token, refresh_token: r.auth.refresh_token });
        if (error) throw respostaInvalida();
        sessaoAtiva();
        return { ...usuario, condominio: condominioDe(r.condominio) };
      },
      async logout() {
        encerrando = true;
        expiradaAvisada = true; // 401 de chamadas ainda em voo não viram "sessão expirada"
        trocaAvisada = true;
        try {
          await rpc('sessao_encerrar', {}, false);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) { // 401: já não havia sessão válida no servidor
            sessaoAtiva();
            encerrando = false;
            throw e; // a sessão continua válida no servidor: a tela não finge que saiu
          }
        }
        await apagarSessaoLocal();
        encerrando = false;
      },
      async me() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        try {
          const r = await rpc<{ usuario: unknown; condominio: unknown }>('sessao_atual', {}, false);
          sessaoAtiva();
          return { ...usuarioDe(r.usuario), condominio: condominioDe(r.condominio) };
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            expiradaAvisada = true; // sem usuário na tela ainda: nada a avisar
            await apagarSessaoLocal();
            return null;
          }
          throw e;
        }
      },
      async trocarSenha(i) {
        const r = await edge<{ usuario: unknown }>('auth-trocar-senha', { senhaAtual: i.senhaAtual, novaSenha: i.novaSenha });
        sessaoAtiva();
        return usuarioDe(r?.usuario);
      },
    },
    usuarios: {
      listar: () => Promise.reject(new ApiError(501, 'NAO_MIGRADO', 'Função ainda não disponível nesta versão (usuarios.listar).')),
      alterarPapel: () => Promise.reject(new ApiError(501, 'NAO_MIGRADO', 'Função ainda não disponível nesta versão (usuarios.alterarPapel).')),
      async criar(i) { return comSenhaTemporaria(await edge('usuarios-admin', { acao: 'criar', nome: i.nome, login: i.login, papel: i.papel })); },
      async desativar(id) { return gerido((await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'desativar', id })).usuario); },
      async reativar(id) { return gerido((await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'reativar', id })).usuario); },
      async redefinirAcesso(id) { return comSenhaTemporaria(await edge('usuarios-admin', { acao: 'redefinir_senha', id })); },
    },
  } satisfies Pick<Api, 'aoEventoSessao' | 'auth' | 'usuarios'>;

  // Os outros namespaces ainda não migrados respondem NAO_MIGRADO, sem precisar listá-los.
  return new Proxy(api, {
    get: (alvo, prop, rec) => (typeof prop === 'string' && !(prop in alvo) ? naoMigrado(prop) : Reflect.get(alvo, prop, rec)),
  }) as unknown as Api;
}
