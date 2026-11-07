// Contrato da API. Os métodos espelham os endpoints da especificação técnica (seção 6).
// A UI só conhece esta interface; a implementação é o adaptador Supabase (src/api/supabase), criado em src/api/index.tsx.
export * from './erros'
export * from './paginacao'
export * from './sessao'
export * from './pessoas'
export * from './unidades'
export * from './vinculos'
export * from './portaria'
export * from './operacao'
export * from './auditoria'
export * from './lgpd'
export * from './importacao'
export * from './api'
