import type {
  Api,
  Catalogo,
  FichaPessoa,
  PessoaBusca,
  PessoaLista,
  ResultadoBuscaGlobal,
  ResumoPessoas,
  VinculoView,
} from '@/api/types'
import type { EventoView, Funcionario, Pessoa } from '@/domain/types'
import { AGRUPAMENTOS } from '@/domain/units'
import { eventoDe, funcionarioBase, pessoaDe, unidadeDe } from './conversores'
import {
  type Rpc,
  contagem,
  contagens,
  lista,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from './rpc'

export function criarCadastro(rpc: Rpc): Pick<Api, 'busca' | 'pessoas' | 'catalogo'> {
  const pessoasPagina = async (
    f: {
      categoria?: string
      cursor?: string | null
      limite?: number
      deslocamento?: number
      incluirDesativadas?: boolean
    } = {},
  ) =>
    paginaDe<PessoaLista>(
      await rpc('pessoas_listar', {
        p: semIndefinidos({
          ...posicao(f),
          categoria: f.categoria,
          incluirDesativadas: f.incluirDesativadas || undefined,
        }),
      }),
      pessoaDe,
    )

  return {
    busca: {
      async global(q) {
        const r = await rpc<ResultadoBuscaGlobal>('busca_global', { p: { q } })
        if (!r || !Array.isArray(r.pessoas) || !Array.isArray(r.unidades)) throw respostaInvalida()
        return { ...r, pessoas: r.pessoas.map(pessoaDe) }
      },
    },
    pessoas: {
      async buscar(q, o) {
        const r = await rpc<{ pessoas: PessoaBusca[] }>('pessoas_buscar', {
          p: {
            q,
            limite: o?.limite ?? 8,
            semMoradores: !!o?.semMoradores,
            ...(o?.incluirDesativadas ? { incluirDesativadas: true } : {}),
          },
        })
        return lista(r?.pessoas, pessoaDe)
      },
      async listar() {
        return todas(
          (cursor) => pessoasPagina({ limite: 100, cursor }),
          'A lista de pessoas tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      listarPagina: (f = {}) => pessoasPagina(f),
      async resumo(): Promise<ResumoPessoas> {
        const r = await rpc<Record<string, unknown>>('pessoas_resumo')
        if (!r) throw respostaInvalida()
        return {
          ativas: contagem(r.ativas),
          desativadas: contagem(r.desativadas),
          porCategoria: contagens(r.porCategoria, [
            'morador',
            'visitante',
            'prestador',
            'funcionario',
          ] as const),
        }
      },
      async ficha(id) {
        const f = await rpc<{
          pessoa: Pessoa
          funcionario: Funcionario | null
          vinculos: VinculoView[]
          eventos: EventoView[]
        }>('pessoa_ficha', { p_id: id })
        if (!f?.pessoa || !Array.isArray(f.vinculos)) throw respostaInvalida()
        const ficha: FichaPessoa = {
          pessoa: pessoaDe(f.pessoa),
          vinculos: f.vinculos,
          ...(f.funcionario ? { funcionario: funcionarioBase(f.funcionario) } : {}),
          eventos: lista(f.eventos, eventoDe),
        }
        return ficha
      },
      async criar(i) {
        return pessoaDe(
          await rpc<Pessoa>('pessoa_criar', {
            p: semIndefinidos({
              nome: i.nome,
              telefone: i.menorIdade && !i.telefone?.trim() ? undefined : i.telefone,
              categoria: i.categoria,
              documento: !i.semCpf && i.documento?.trim() ? i.documento : undefined,
              empresa: i.empresa?.trim() || undefined,
              servico: i.servico?.trim() || undefined,
              semCpf: i.semCpf ? true : undefined,
              menorIdade: i.menorIdade ? true : undefined,
            }),
          }),
        )
      },
      async editar({ id, ...resto }) {
        return pessoaDe(await rpc<Pessoa>('pessoa_editar', { p_id: id, p: semIndefinidos(resto) }))
      },
      async funcionario(id) {
        const f = await rpc<Funcionario | null>('pessoa_funcionario', { p_id: id })
        return f ? funcionarioBase(f) : null
      },
      async desativar(id, motivo) {
        return pessoaDe(
          await rpc<Pessoa & { autorizacoesRevogadas: number }>('pessoa_desativar', {
            p_id: id,
            p_motivo: motivo,
          }),
        )
      },
      async reativar(id) {
        return pessoaDe(await rpc<Pessoa>('pessoa_reativar', { p_id: id }))
      },
    },
    catalogo: {
      async obter() {
        const c = await rpc<Catalogo>('catalogo')
        if (
          !c ||
          !Array.isArray(c.unidades) ||
          !Array.isArray(c.areasComuns) ||
          !AGRUPAMENTOS.includes(c.agrupamento)
        )
          throw respostaInvalida()
        return {
          agrupamento: c.agrupamento,
          unidades: c.unidades.map(unidadeDe),
          areasComuns: c.areasComuns,
        }
      },
    },
  }
}
