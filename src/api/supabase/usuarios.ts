import type {
  Api,
  CondominioSessao,
  ResumoUsuarios,
  UsuarioComSenhaTemporaria,
  UsuarioSessao,
} from '@/api/types'
import type { UsuarioSistema } from '@/domain/types'
import { type Rpc, contagem, paginaDe, posicao, respostaInvalida, semIndefinidos } from './portaria'

export function usuarioDe(u: unknown): UsuarioSessao {
  const x = u as Partial<UsuarioSessao> | null
  if (!x || typeof x.id !== 'string' || typeof x.login !== 'string' || typeof x.papel !== 'string')
    throw respostaInvalida()
  return {
    id: x.id,
    nome: String(x.nome ?? ''),
    login: x.login,
    papel: x.papel,
    ativo: x.ativo !== false,
    ultimoAcesso: typeof x.ultimoAcesso === 'number' ? x.ultimoAcesso : null,
    deveTrocarSenha: x.deveTrocarSenha === true,
  }
}

export function condominioDe(c: unknown): CondominioSessao | null {
  const nome = (c as { nome?: unknown } | null)?.nome
  return typeof nome === 'string' && nome.trim() ? { nome } : null
}

function gerido(u: unknown): UsuarioSistema {
  const base = usuarioDe(u)
  const x = u as { senhaTemporariaExpiraEm?: unknown }
  return {
    ...base,
    senhaTemporariaExpiraEm:
      typeof x.senhaTemporariaExpiraEm === 'number' ? x.senhaTemporariaExpiraEm : null,
  }
}

function comSenhaTemporaria(r: unknown): UsuarioComSenhaTemporaria {
  const x = r as { usuario?: unknown; senhaTemporaria?: unknown } | null
  if (!x || typeof x.senhaTemporaria !== 'string') throw respostaInvalida()
  return { usuario: gerido(x.usuario), senhaTemporaria: x.senhaTemporaria }
}

export type Edge = <T>(nome: string, corpo: unknown) => Promise<T>

export function criarUsuarios(rpc: Rpc, edge: Edge): Pick<Api, 'usuarios'> {
  return {
    usuarios: {
      async listarPagina(f = {}) {
        return paginaDe<UsuarioSistema>(
          await rpc('usuarios_listar', {
            p: semIndefinidos({
              ...posicao(f),
              q: f.q?.trim() || undefined,
              papel: f.papel,
              situacao: f.situacao,
            }),
          }),
          gerido,
        )
      },
      async resumo(): Promise<ResumoUsuarios> {
        const r = await rpc<{
          ativos?: unknown
          desativados?: unknown
          porPapel?: Record<string, unknown>
        }>('usuarios_resumo')
        if (!r?.porPapel || typeof r.porPapel !== 'object') throw respostaInvalida()
        const pp = r.porPapel
        return {
          ativos: contagem(r.ativos),
          desativados: contagem(r.desativados),
          porPapel: {
            sindico: contagem(pp.sindico),
            administracao: contagem(pp.administracao),
            porteiro: contagem(pp.porteiro),
            auditor: contagem(pp.auditor),
            admin_sistema: contagem(pp.admin_sistema),
          },
        }
      },
      async criar(i) {
        return comSenhaTemporaria(
          await edge('usuarios-admin', {
            acao: 'criar',
            nome: i.nome,
            login: i.login,
            papel: i.papel,
          }),
        )
      },
      async editar(id, i) {
        return gerido(
          (
            await edge<{ usuario: unknown }>('usuarios-admin', {
              acao: 'editar',
              id,
              nome: i.nome,
              login: i.login,
              papel: i.papel,
            })
          ).usuario,
        )
      },
      async desativar(id) {
        return gerido(
          (await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'desativar', id })).usuario,
        )
      },
      async reativar(id) {
        return gerido(
          (await edge<{ usuario: unknown }>('usuarios-admin', { acao: 'reativar', id })).usuario,
        )
      },
      async redefinirAcesso(id) {
        return comSenhaTemporaria(await edge('usuarios-admin', { acao: 'redefinir_senha', id }))
      },
    },
  }
}
