// Adaptador da interface Api sobre o Supabase (desenho §6). F1: autenticação e a parte de usuários que passa pela Edge
// usuarios-admin. F2: a portaria (portaria.ts: pessoas, busca, catálogo, unidades, vínculos, eventos, autorizações,
// restrições e turno). F3: as escritas de cadastro (portaria.ts) e a operação (operacao.ts: encomendas, ocorrências,
// funcionários, relatórios, auditoria do histórico e importação). F4: anexos de ocorrência pela Edge anexos (anexos.ts).
// F5: a listagem e os totais de usuários (api.usuarios_listar e usuarios_resumo, 0038). Os demais métodos (selo e
// LGPD) respondem ApiError 501 NAO_MIGRADO e as rotas sem backend somem do menu por `suporta` (desenho §6).
//
// Sessão: o token do Supabase Auth (supabase-js) fica no navegador (armazenamento.ts). Quem decide se a sessão vale é
// o banco (app.ator() em toda RPC): revogada, expirada, inativa ou de usuário desativado responde 401, e o adaptador
// avisa o AuthContext ('expirada') e apaga a sessão local. Troca obrigatória pendente: 403 -> 'troca_obrigatoria'.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';
import type { UsuarioSistema } from '@domain/types';
import { ApiError, type Api, type CondominioSessao, type EventoSessao, type ResumoUsuarios, type UsuarioComSenhaTemporaria, type UsuarioSessao } from '../types';
import { segundosRetryAfter, tempoLegivel } from '../../lib/espera';
import type { ArmazenamentoSessao } from './armazenamento';
import { criarAnexos } from './anexos';
import { criarOperacao, ocorrenciaDe } from './operacao';
import { contagem, criarPortaria, paginaDe, posicao, ROTAS_MIGRADAS, semIndefinidos } from './portaria';

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
    // 40001/40P01 (serialização, deadlock): a transação inteira da RPC foi desfeita; repete até 3 vezes (desenho §6,
    // como transacao.ts do legado). Só se repete o que falhou: o "negado" gravado num sucesso nunca duplica.
    for (let tentativa = 1; ; tentativa++) {
      try {
        r = await sb.schema('api').rpc(nome, args);
      } catch {
        throw semRede();
      }
      const codigo = (r.error as { code?: string } | null)?.code;
      if (!(codigo === '40001' || codigo === '40P01') || tentativa >= 3) break;
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

  /** Edge com corpo binário e/ou resposta binária: devolve também a Response (cabeçalhos do download). */
  async function edgeBruta(nome: string, opc: { body?: Blob; headers?: Record<string, string> }) {
    const { data, error, response } = await sb.functions.invoke(nome, { method: 'POST', ...opc });
    if (error) {
      const e = await erroDeEdge(error);
      observar(e);
      throw e;
    }
    return { data: data as unknown, response };
  }

  const api = {
    aoEventoSessao(cb: (e: EventoSessao) => void) { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; },
    suporta: (rota: string) => ROTAS_MIGRADAS.has(rota),
    ...criarPortaria((nome, args) => rpc(nome, args)),
    ...criarOperacao((nome, args) => rpc(nome, args), criarAnexos(edgeBruta, ocorrenciaDe)),
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
        const r = await edge<{ usuario: unknown; auth?: { access_token?: string; refresh_token?: string } }>('auth-trocar-senha',
          { senhaAtual: i.senhaAtual, novaSenha: i.novaSenha });
        const usuario = usuarioDe(r?.usuario);
        // A troca derruba a sessão antiga no Auth: a Edge devolve a nova, que substitui a atual (mesmo storage).
        if (!r.auth?.access_token || !r.auth.refresh_token) throw respostaInvalida();
        encerrando = true; // a troca de sessão pode emitir SIGNED_OUT: não é "expirada"
        try {
          const { error } = await sb.auth.setSession({ access_token: r.auth.access_token, refresh_token: r.auth.refresh_token });
          if (error) throw respostaInvalida();
        } finally {
          encerrando = false;
        }
        sessaoAtiva();
        return usuario;
      },
    },
    usuarios: {
      async listarPagina(f = {}) {
        return paginaDe<UsuarioSistema>(await rpc('usuarios_listar', { p: semIndefinidos({
          ...posicao(f), q: f.q?.trim() || undefined, papel: f.papel, situacao: f.situacao,
        }) }), gerido);
      },
      async resumo(): Promise<ResumoUsuarios> {
        const r = await rpc<{ ativos?: unknown; desativados?: unknown; porPapel?: Record<string, unknown> }>('usuarios_resumo');
        if (!r?.porPapel || typeof r.porPapel !== 'object') throw respostaInvalida();
        const pp = r.porPapel;
        return {
          ativos: contagem(r.ativos), desativados: contagem(r.desativados),
          porPapel: { sindico: contagem(pp.sindico), administracao: contagem(pp.administracao), porteiro: contagem(pp.porteiro), auditor: contagem(pp.auditor) },
        };
      },
      async criar(i) { return comSenhaTemporaria(await edge('usuarios-admin', { acao: 'criar', nome: i.nome, login: i.login, papel: i.papel })); },
      async desativar(id) { return gerido((await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'desativar', id })).usuario); },
      async reativar(id) { return gerido((await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'reativar', id })).usuario); },
      async redefinirAcesso(id) { return comSenhaTemporaria(await edge('usuarios-admin', { acao: 'redefinir_senha', id })); },
    },
  } satisfies Partial<Api>;

  // Os outros namespaces ainda não migrados respondem NAO_MIGRADO, sem precisar listá-los.
  return new Proxy(api, {
    get: (alvo, prop, rec) => (typeof prop === 'string' && !(prop in alvo) ? naoMigrado(prop) : Reflect.get(alvo, prop, rec)),
  }) as unknown as Api;
}
