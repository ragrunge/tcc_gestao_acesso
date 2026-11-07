/** Unidade (RF-01). `id` é uuid; o código "A-32" é derivado de bloco e número (`codigoUnidade`). */
export interface Unidade {
  id: string
  /** 1 a 3 letras maiúsculas ou dígitos ("A", "4", "B2"; CHECK do schema). */
  bloco: string
  /** Só dígitos, mínimo 2 ("03", "32"; CHECK do schema). */
  numero: string
  ativo: boolean
}

/** Área comum atendida por prestador (RF-36). */
export interface AreaComum {
  id: string
  nome: string
  ativo: boolean
}

/** Ponto de acesso. Hoje só existe a portaria social (seed). */
export interface PontoAcesso {
  id: string
  nome: string
  ativo: boolean
}
export interface Veiculo {
  id: string
  unidadeId: string
  placa: string
  modelo: string
  cor: string
  /** Ausente = ativo. */ ativo?: boolean
}
