import type {
  CategoriaPessoa,
  Escala,
  EventoView,
  Funcionario,
  Pessoa,
  StatusVinculo,
  TipoVinculo,
} from '@/domain/types'
import type { PosicaoPagina } from './paginacao'
import type { VinculoView } from './vinculos'

export interface NovaPessoaInput {
  nome: string
  /** CPF (só ele é aceito). Dispensado quando `semCpf` ou `menorIdade`. */
  documento?: string
  /** Obrigatório, salvo `menorIdade`. */
  telefone: string
  categoria: CategoriaPessoa
  empresa?: string
  servico?: string
  /** Exceção "sem CPF": a pessoa só entra por exceção do porteiro. */
  semCpf?: boolean
  /** Dependente menor de idade (LGPD art. 14): CPF e telefone opcionais; só morador. */
  menorIdade?: boolean
}

/** RN-09/art. 18: completar ou corrigir o cadastro. Campos ausentes não mudam. CPF informado tira a pessoa de "sem CPF". */
export interface EditarPessoaInput {
  id: string
  nome?: string
  telefone?: string
  documento?: string
  empresa?: string | null
  servico?: string | null
  /** false: deixou de ser menor (a API exige CPF e telefone). */
  menorIdade?: boolean
}
/** RF-09: funcionário do condomínio = pessoa (mesmas regras de CPF e telefone) + função e escala. */
export interface NovoFuncionarioInput {
  nome: string
  documento: string
  telefone: string
  funcao: string
  escala: Escala
  ativo?: boolean
}
export interface EditarFuncionarioInput {
  pessoaId: string
  funcao?: string
  escala?: Escala
  ativo?: boolean
}
export interface FuncionarioView extends Funcionario {
  pessoa: Pessoa
  emEscalaAgora: boolean
}
export interface PessoaBusca extends Pessoa {
  ultimoAcesso: string
  /** Ids das unidades com vínculo válido, e os códigos correspondentes ("D-32") na mesma ordem. */
  unidadesVinculadas: string[]
  unidadesVinculadasCodigos: string[]
  /** Selo de restrição (lista e busca do Cadastro; a busca global do topo não traz); ausente para quem não vê restrições. */
  restricao?: RestricaoResumo | null
}
/** Busca do topo: pessoas (até 6) e unidades pelo código ou pela placa. */
export interface ResultadoBuscaGlobal {
  pessoas: PessoaBusca[]
  unidades: { id: string; motivo: string }[]
  /** Há mais pessoas além das mostradas (refinar a busca). */
  temMaisPessoas?: boolean
}
/** `eventos` null: o módulo de eventos ainda não existe na API real (a ficha mostra "disponível em breve"). */
export interface FichaPessoa {
  pessoa: Pessoa
  funcionario?: Funcionario
  vinculos: VinculoView[]
  eventos: EventoView[] | null
}

/** Linha da tela Cadastro: a pessoa e o vínculo que melhor a representa (aprovado > legado > pendente > rejeitado > encerrado). */
export interface PessoaLista extends PessoaBusca {
  vinculoPrincipal: {
    id: string
    unidadeId: string
    unidadeCodigo: string
    tipo: TipoVinculo
    status: StatusVinculo
  } | null
}
/**
 * Resumo da restrição para o selo da lista e da busca do Cadastro, sem motivo. `ativa`: vigente (de unidade, ou de condomínio aprovada), e
 * prevalece sobre `pendente` (de condomínio aguardando o síndico). `unidadeCodigo` null: todo o condomínio.
 */
export interface RestricaoResumo {
  estado: 'ativa' | 'pendente'
  unidadeCodigo: string | null
  total: number
}
export interface FiltroPessoas extends PosicaoPagina {
  categoria?: CategoriaPessoa
  incluirDesativadas?: boolean
}
/** `ativas` e `porCategoria` contam só os cadastros não desativados (o padrão da lista). */
export interface ResumoPessoas {
  ativas: number
  desativadas: number
  porCategoria: Record<CategoriaPessoa, number>
}
