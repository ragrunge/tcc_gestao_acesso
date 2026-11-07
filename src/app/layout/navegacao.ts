import type { Rota } from '@/domain/rbac'

export const GRUPOS: {
  titulo: string
  itens: { rota: Rota; rotulo: string; contador?: boolean }[]
}[] = [
  {
    titulo: 'Portaria',
    itens: [
      { rota: 'painel', rotulo: 'Painel' },
      { rota: 'entrada', rotulo: 'Registrar entrada' },
      { rota: 'saida', rotulo: 'Registrar saída' },
      { rota: 'pessoas', rotulo: 'Presentes agora' },
      { rota: 'encomendas', rotulo: 'Encomendas' },
      { rota: 'ocorrencias', rotulo: 'Ocorrências' },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rota: 'unidades', rotulo: 'Unidades' },
      { rota: 'vinculos', rotulo: 'Vínculos pendentes', contador: true },
      { rota: 'cadastro', rotulo: 'Cadastro de pessoas' },
      { rota: 'funcionarios', rotulo: 'Funcionários' },
      { rota: 'importar', rotulo: 'Importar planilha' },
    ],
  },
  {
    titulo: 'Auditoria',
    itens: [
      { rota: 'historico', rotulo: 'Histórico de acessos' },
      { rota: 'relatorios', rotulo: 'Relatórios' },
      { rota: 'privacidade', rotulo: 'Privacidade (LGPD)' },
    ],
  },
  { titulo: 'Sistema', itens: [{ rota: 'usuarios', rotulo: 'Usuários' }] },
]

export const ROTULO_ROTA = new Map(
  GRUPOS.flatMap((g) => g.itens.map((i) => [i.rota as string, i.rotulo])),
)
