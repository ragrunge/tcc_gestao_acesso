export type Papel = 'sindico' | 'administracao' | 'porteiro' | 'auditor' | 'admin_sistema'
export const ROTULO_PAPEL: Record<Papel, string> = {
  sindico: 'Síndico',
  administracao: 'Administração',
  porteiro: 'Porteiro',
  auditor: 'Auditor',
  admin_sistema: 'Administrador do sistema',
}

export type CategoriaPessoa = 'morador' | 'visitante' | 'prestador' | 'funcionario'
export const ROTULO_CATEGORIA: Record<CategoriaPessoa, string> = {
  morador: 'Morador',
  visitante: 'Visitante',
  prestador: 'Prestador',
  funcionario: 'Funcionário',
}
/** Só CPF (decisão de produto). Pessoa sem CPF usa `semCpf` e só entra por exceção do porteiro. */
export type TipoDocumento = 'cpf'
export interface Pessoa {
  id: string
  nome: string
  documentoTipo: TipoDocumento
  /** Sempre mascarado (ex.: 123.45*.***-** ou, no formato antigo, ***.456.789-**), "(sem CPF)" ou "(anonimizado)". O CPF nunca é guardado. */
  documentoMascarado: string
  /** HMAC-SHA256 hex dos 11 dígitos do CPF (mesmo algoritmo de a API antiga (db/cpf.ts)): busca exata e deduplicação. */
  documentoBusca?: string
  /** Cadastro sem CPF (exceção): só entra por `excecao_porteiro` e não pode ter vínculo aprovado. */
  semCpf?: boolean
  /** Dependente menor de idade (LGPD art. 14): CPF e telefone opcionais; no vínculo de dependente, o cadastro já é completo. */
  menorIdade?: boolean
  /** Só dígitos, com DDD (10 ou 11). Ausente apenas em importado (legado), anonimizado ou menor de idade. */
  telefone?: string
  /** API real: '(**) *****-1234' nas listas e para quem não pode editar o cadastro (o telefone completo não vem). */
  telefoneMascarado?: string
  categoria: CategoriaPessoa
  empresa?: string
  servico?: string
  /** Origem do cadastro legado (importação da planilha). */
  importacaoId?: string
  /** Preenchido pela anonimização (LGPD): nome genérico, sem documento, telefone, empresa e serviço. */
  anonimizadaEm?: number | null
  /** Cadastro desativado (RF-02): some das buscas e não entra; o histórico fica. Nulo/ausente = ativo. */
  desativadaEm?: number | null
  /** Só na ficha, para quem pode desativar (SI, AD). */
  desativacaoMotivo?: string | null
  criadoEm: number
}

export interface Escala {
  diasSemana: number[]
  horaInicio: string
  horaFim: string
}

export interface Funcionario {
  pessoaId: string
  funcao: string
  escala: Escala
  ativo: boolean
}
export interface UsuarioSistema {
  id: string
  nome: string
  login: string
  papel: Papel
  ativo: boolean
  ultimoAcesso: number | null
  /** Troca de senha pendente (senha temporária criada pela administração). Ausente onde a API não informa. */
  deveTrocarSenha?: boolean
  /** Fim da validade da senha temporária (ms). Só na gestão de usuários; null sem troca pendente. */
  senhaTemporariaExpiraEm?: number | null
}
