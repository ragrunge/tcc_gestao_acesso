import type { Api, FuncionarioView } from '@/api/types'
import { type Rpc, paginaDe, semIndefinidos, todas } from '../portaria'
import { funcionarioDe } from './conversores'

export function criarFuncionarios(rpc: Rpc): Pick<Api, 'funcionarios'> {
  return {
    funcionarios: {
      async listar() {
        return todas(
          async (cursor) =>
            paginaDe<FuncionarioView>(
              await rpc('funcionarios_listar', {
                p: semIndefinidos({ limite: 100, cursor: cursor ?? undefined }),
              }),
              funcionarioDe,
            ),
          'A lista de funcionários tem mais páginas do que esta tela consegue mostrar.',
        )
      },
      async criar(i) {
        return funcionarioDe(
          await rpc<FuncionarioView>('funcionario_criar', {
            p: semIndefinidos({
              nome: i.nome,
              documento: i.documento,
              telefone: i.telefone,
              funcao: i.funcao,
              escala: i.escala,
              ativo: i.ativo,
            }),
          }),
        )
      },
      async editar({ pessoaId, ...resto }) {
        return funcionarioDe(
          await rpc<FuncionarioView>('funcionario_editar', {
            p_id: pessoaId,
            p: semIndefinidos(resto),
          }),
        )
      },
    },
  }
}
