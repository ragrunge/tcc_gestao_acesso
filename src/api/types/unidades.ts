import type {
  AreaComum,
  EventoView,
  Pessoa,
  Unidade,
  Veiculo,
  VinculoUnidade,
} from '@/domain/types'
import type { Agrupamento } from '@/domain/units'
import type { EncomendaView } from './operacao'
import type { AutorizacaoView, RestricaoView } from './portaria'
import type { VinculoView } from './vinculos'

/** Bloco e número como digitados: a API normaliza ("a" -> "A", "3" -> "03") e validam. */
export interface NovaUnidadeInput {
  bloco: string
  numero: string
}
/** Catálogo leve para a UI: todas as unidades (inclusive inativas, para o histórico) e áreas comuns. */
/** `agrupamento`: como o condomínio chama o bloco ("Bloco"/"Torre"), configurado na API; só muda os rótulos. */
export interface Catalogo {
  agrupamento: Agrupamento
  unidades: Unidade[]
  areasComuns: AreaComum[]
}
export interface FiltroUnidades {
  bloco?: string
  cursor?: string | null
  limite?: number
}
/** Ocupada: ativa com vínculo válido hoje; alugada: com inquilino válido; vazia: ativa sem vínculo válido. */
export interface ResumoUnidades {
  total: number
  ativas: number
  inativas: number
  ocupadas: number
  alugadas: number
  vazias: number
  cadastroCompleto: number
  veiculosAtivos: number
}
export interface UnidadeResumo {
  unidade: Unidade
  moradoresValidos: number
  pendentes: number
  restricoes: number
  cadastroCompleto: boolean
}
/** Seção `null`: o módulo ainda não existe na API real (a tela mostra "disponível em breve" só nela). */
export interface UnidadeDetalhe {
  unidade: Unidade
  vinculos: VinculoView[] | null
  veiculos: Veiculo[]
  autorizacoes: AutorizacaoView[] | null
  restricoes: RestricaoView[] | null
  eventos: EventoView[] | null
  /** Encomendas aguardando retirada na unidade (as 20 mais antigas). `null`: o papel não vê encomendas. */
  encomendas?: { aguardando: number; atrasadas: number; itens: EncomendaView[] } | null
}
export interface Autorizador {
  pessoa: Pessoa
  vinculo: VinculoUnidade
}
export interface EditarVeiculoInput {
  id: string
  placa?: string
  modelo?: string
  cor?: string
  ativo?: boolean
}
