// Adaptador da interface Api sobre o Supabase (desenho §6). F1: autenticação e a parte de usuários que passa pela Edge
// usuarios-admin. F2: a portaria (portaria/: pessoas, busca, catálogo, unidades, vínculos, eventos, autorizações,
// restrições e turno). F3: as escritas de cadastro (portaria/) e a operação (operacao/: encomendas, ocorrências,
// funcionários, relatórios, auditoria do histórico e importação). F4: anexos de ocorrência pela Edge anexos (anexos.ts).
// F5: a listagem e os totais de usuários (usuarios.ts; api.usuarios_listar e usuarios_resumo, 0038). Erros de RPC e
// Edge: erros.ts. Os demais métodos (selo e
// LGPD) respondem ApiError 501 NAO_MIGRADO e as rotas sem backend somem do menu por `suporta` (desenho §6).
//
// Sessão: o token do Supabase Auth (supabase-js) fica no navegador (armazenamento.ts). Quem decide se a sessão vale é
// o banco (app.ator() em toda RPC): revogada, expirada, inativa ou de usuário desativado responde 401, e o adaptador
// avisa o AuthContext ('expirada') e apaga a sessão local. Troca obrigatória pendente: 403 -> 'troca_obrigatoria'.
import { type Api, ApiError, type EventoSessao } from '@/api/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { criarAnexos } from './anexos'
import type { ArmazenamentoSessao } from './armazenamento'
import { erroDeEdge, erroDeRpc, semRede } from './erros'
import { criarOperacao, ocorrenciaDe } from './operacao'
import {
  type ArgsRpc,
  type NomeRpc,
  ROTAS_MIGRADAS,
  criarPortaria,
  respostaInvalida,
} from './portaria'
import { condominioDe, criarUsuarios, usuarioDe } from './usuarios'

export { erroDeEdge, erroDeRpc } from './erros'

interface RespostaLogin {
  usuario: unknown
  condominio: unknown
  sessao: { manterConectado?: boolean }
  auth: { access_token: string; refresh_token: string }
}

export interface OpcoesSupabaseApi {
  /** Chave anon/publishable: o login vai com ela, nunca com uma sessão antiga que esteja no storage. */
  chaveAnon: string
  armazenamento?: ArmazenamentoSessao
}

/** Namespace ainda não migrado: qualquer método rejeita com 501 NAO_MIGRADO. */
function naoMigrado(ns: string): unknown {
  return new Proxy(
    {},
    {
      get: (_alvo, metodo) =>
        typeof metodo === 'string'
          ? () =>
              Promise.reject(
                new ApiError(
                  501,
                  'NAO_MIGRADO',
                  `Função ainda não disponível nesta versão (${ns}.${metodo}).`,
                ),
              )
          : undefined,
    },
  )
}

export function createSupabaseApi(sb: SupabaseClient, opcoes: OpcoesSupabaseApi): Api {
  const ouvintes = new Set<(e: EventoSessao) => void>()
  // Um aviso por "vida" da sessão (N chamadas paralelas com 401 emitem um só), como o cliente HTTP antigo.
  let expiradaAvisada = false
  let trocaAvisada = false
  let encerrando = false
  const emitir = (e: EventoSessao) => ouvintes.forEach((cb) => cb(e))
  const sessaoAtiva = () => {
    expiradaAvisada = false
    trocaAvisada = false
  }

  async function apagarSessaoLocal() {
    try {
      await sb.auth.signOut({ scope: 'local' })
    } catch {
      /* sem rede: o storage é limpo abaixo */
    }
    opcoes.armazenamento?.limpar()
  }

  function observar(e: ApiError) {
    if (e.status === 401 && !expiradaAvisada) {
      expiradaAvisada = true
      void apagarSessaoLocal()
      emitir('expirada')
    } else if (e.status === 403 && e.code === 'TROCA_DE_SENHA_OBRIGATORIA' && !trocaAvisada) {
      trocaAvisada = true
      emitir('troca_obrigatoria')
    }
  }

  // Refresh recusado pelo Auth (banido, refresh revogado): o supabase-js encerra a sessão por conta própria.
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT' && !encerrando && !expiradaAvisada) {
      expiradaAvisada = true
      emitir('expirada')
    }
  })

  async function rpc<T, K extends NomeRpc = NomeRpc>(
    nome: K,
    args: ArgsRpc<K> = {},
    avisar = true,
  ): Promise<T> {
    let r
    // 40001/40P01 (serialização, deadlock): a transação inteira da RPC foi desfeita; repete até 3 vezes (desenho §6,
    // como transacao.ts do legado). Só se repete o que falhou: o "negado" gravado num sucesso nunca duplica.
    for (let tentativa = 1; ; tentativa++) {
      try {
        r = await sb.schema('api').rpc(nome, args)
      } catch {
        throw semRede()
      }
      const codigo = (r.error as { code?: string } | null)?.code
      if (!(codigo === '40001' || codigo === '40P01') || tentativa >= 3) break
    }
    if (r.error) {
      const e = erroDeRpc(r.error, r.status)
      if (avisar) observar(e)
      throw e
    }
    return r.data as T
  }

  async function edge<T>(
    nome: string,
    corpo: unknown,
    opc: { avisar?: boolean; anon?: boolean } = {},
  ): Promise<T> {
    const { data, error } = await sb.functions.invoke(nome, {
      body: corpo as Record<string, unknown>,
      ...(opc.anon ? { headers: { Authorization: `Bearer ${opcoes.chaveAnon}` } } : {}),
    })
    if (error) {
      const e = await erroDeEdge(error)
      if (opc.avisar !== false) observar(e)
      throw e
    }
    return data as T
  }

  /** Edge com corpo binário e/ou resposta binária: devolve também a Response (cabeçalhos do download). */
  async function edgeBruta(nome: string, opc: { body?: Blob; headers?: Record<string, string> }) {
    const { data, error, response } = await sb.functions.invoke(nome, { method: 'POST', ...opc })
    if (error) {
      const e = await erroDeEdge(error)
      observar(e)
      throw e
    }
    return { data: data as unknown, response }
  }

  const api = {
    aoEventoSessao(cb: (e: EventoSessao) => void) {
      ouvintes.add(cb)
      return () => {
        ouvintes.delete(cb)
      }
    },
    suporta: (rota: string) => ROTAS_MIGRADAS.has(rota),
    ...criarPortaria((nome, args) => rpc(nome, args)),
    ...criarOperacao((nome, args) => rpc(nome, args), criarAnexos(edgeBruta, ocorrenciaDe)),
    auth: {
      async login(i) {
        const corpo = i.manterConectado
          ? { login: i.login, senha: i.senha, manterConectado: true }
          : { login: i.login, senha: i.senha }
        const r = await edge<RespostaLogin>('auth-entrar', corpo, { avisar: false, anon: true })
        if (!r?.auth?.access_token || !r.auth.refresh_token) throw respostaInvalida()
        const usuario = usuarioDe(r.usuario)
        opcoes.armazenamento?.usar(r.sessao?.manterConectado ? 'local' : 'sessao')
        const { error } = await sb.auth.setSession({
          access_token: r.auth.access_token,
          refresh_token: r.auth.refresh_token,
        })
        if (error) throw respostaInvalida()
        sessaoAtiva()
        return { ...usuario, condominio: condominioDe(r.condominio) }
      },
      async logout() {
        encerrando = true
        expiradaAvisada = true // 401 de chamadas ainda em voo não viram "sessão expirada"
        trocaAvisada = true
        try {
          await rpc('sessao_encerrar', {}, false)
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) {
            // 401: já não havia sessão válida no servidor
            sessaoAtiva()
            encerrando = false
            throw e // a sessão continua válida no servidor: a tela não finge que saiu
          }
        }
        await apagarSessaoLocal()
        encerrando = false
      },
      async me() {
        const { data } = await sb.auth.getSession()
        if (!data.session) return null
        try {
          const r = await rpc<{ usuario: unknown; condominio: unknown }>('sessao_atual', {}, false)
          sessaoAtiva()
          return { ...usuarioDe(r.usuario), condominio: condominioDe(r.condominio) }
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            expiradaAvisada = true // sem usuário na tela ainda: nada a avisar
            await apagarSessaoLocal()
            return null
          }
          throw e
        }
      },
      async trocarSenha(i) {
        const r = await edge<{
          usuario: unknown
          auth?: { access_token?: string; refresh_token?: string }
        }>('auth-trocar-senha', { senhaAtual: i.senhaAtual, novaSenha: i.novaSenha })
        const usuario = usuarioDe(r?.usuario)
        // A troca derruba a sessão antiga no Auth: a Edge devolve a nova, que substitui a atual (mesmo storage).
        if (!r.auth?.access_token || !r.auth.refresh_token) throw respostaInvalida()
        encerrando = true // a troca de sessão pode emitir SIGNED_OUT: não é "expirada"
        try {
          const { error } = await sb.auth.setSession({
            access_token: r.auth.access_token,
            refresh_token: r.auth.refresh_token,
          })
          if (error) throw respostaInvalida()
        } finally {
          encerrando = false
        }
        sessaoAtiva()
        return usuario
      },
    },
    ...criarUsuarios((nome, args) => rpc(nome, args), edge),
  } satisfies Partial<Api>

  // Os outros namespaces ainda não migrados respondem NAO_MIGRADO, sem precisar listá-los.
  return new Proxy(api, {
    get: (alvo, prop, rec) =>
      typeof prop === 'string' && !(prop in alvo) ? naoMigrado(prop) : Reflect.get(alvo, prop, rec),
  }) as unknown as Api
}
