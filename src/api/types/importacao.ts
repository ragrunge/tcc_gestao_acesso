export interface LinhaPlanilha {
  linha: number
  bloco: string
  unidade: string
  nome: string
  documento: string
  telefone: string
  tipo?: string
}
export interface InconsistenciaImportacao {
  linha: number
  codigo: string
  mensagem: string
  tipo: 'erro' | 'aviso'
}
export interface RelatorioImportacao {
  id: string
  arquivo: string
  status: 'analisada' | 'confirmada' | 'cancelada'
  lidas: number
  importaveis: number
  rejeitadas: number
  avisos: number
  inconsistencias: InconsistenciaImportacao[]
  amostra: LinhaPlanilha[]
  prazoRegularizacao: number
}
export interface ResultadoImportacao {
  importados: number
  reaproveitados: number
  prazoRegularizacao: number
}
