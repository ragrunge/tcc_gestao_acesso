// Adaptador da portaria (F2) sobre as RPCs api.* (migrações 0022–0024), com as escritas que a F3 completou (vínculos,
// veículos, correção de pessoa e unidades: migrações 0025 e 0029). O banco já devolve o formato do domínio
// (EventoView, VinculoView, AutorizacaoView...) com instantes e datas de calendário em epoch ms; aqui ficam só as
// conversões que o contrato do cliente HTTP antigo fazia: placa com hífen no veículo da unidade, datas de calendário
// ('AAAA-MM-DD') na ida, o "negado" vindo como sucesso virando o 422 de sempre e a paginação percorrida.
// Texto livre que pode identificar alguém (termo de busca, nome, placa) vai sempre no CORPO do POST da RPC.
import type { Api } from '@/api/types'
import { criarAutorizacoes, criarTurno } from './autorizacoes'
import { criarCadastro } from './cadastro'
import { criarEventos } from './eventos'
import type { Rpc } from './rpc'
import { criarUnidades } from './unidades'
import { criarVinculos } from './vinculos'

export type { ArgsRpc, NomeRpc, Rpc } from './rpc'
export {
  contagem,
  lista,
  naoMigrado,
  paginaDe,
  posicao,
  respostaInvalida,
  semIndefinidos,
  todas,
} from './rpc'
export { dia, eventoDe, filtroEventos, formatarPlaca, pessoaDe } from './conversores'

/**
 * Rotas (e partes de tela) com backend nesta fase: as demais somem do menu e mostram "não disponível" (desenho §6,
 * `suporta`). F2: a portaria. F3: encomendas, ocorrências, funcionários, relatórios e importação. F4: `anexos` (envio e
 * leitura de anexo de ocorrência pela Edge anexos). F5: `usuarios`. Fica de fora: `privacidade` (LGPD, F5).
 */
export const ROTAS_MIGRADAS = new Set([
  'painel',
  'entrada',
  'saida',
  'pessoas',
  'unidades',
  'vinculos',
  'cadastro',
  'historico',
  'encomendas',
  'ocorrencias',
  'funcionarios',
  'relatorios',
  'importar',
  'anexos',
  'usuarios',
])

type Portaria = Pick<
  Api,
  | 'busca'
  | 'pessoas'
  | 'catalogo'
  | 'unidades'
  | 'veiculos'
  | 'vinculos'
  | 'autorizacoes'
  | 'restricoes'
  | 'eventos'
  | 'turno'
>

export function criarPortaria(rpc: Rpc): Portaria {
  return {
    ...criarCadastro(rpc),
    ...criarUnidades(rpc),
    ...criarVinculos(rpc),
    ...criarAutorizacoes(rpc),
    ...criarEventos(rpc),
    ...criarTurno(rpc),
  }
}
