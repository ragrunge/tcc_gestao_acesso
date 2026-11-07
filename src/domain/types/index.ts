// Tipos de domínio. Espelham as tabelas do schema (a API antiga (db/schema.ts), spec seção 3).
// Convenção: nomes do domínio em português (EventoAcesso, VinculoUnidade...), campos em camelCase.
// Todos os instantes são epoch em milissegundos (UTC); a exibição usa o fuso de São Paulo.
// As entidades guardam só ids de usuário e de pessoa; os nomes são resolvidos nas views (o banco faz join).
export * from './pessoas'
export * from './unidades'
export * from './vinculos'
export * from './portaria'
export * from './eventos'
export * from './operacao'
export * from './auditoria'
export * from './permanencia'
