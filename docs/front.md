# Front: guia de desenvolvimento

React 18 + Vite 5 + React Query v5 + Tailwind 3.4, PWA só com o shell. É só cliente: dados, regras de permissão e
trilha vêm do Supabase (Postgres, Auth, Edge Functions e Storage). Backend e testes do banco: ver `README.md` e
`supabase/`. Rastreabilidade RF → backend → tela: `docs/rastreabilidade.md`.

## Rodar

```bash
cp .env.example .env     # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do stack local (`supabase status`)
supabase start && supabase db reset
npm run dev              # http://localhost:5173
```

Usuários fictícios do `supabase/seed.sql` (só no local): `roberto.faria`, `paula.nogueira`, `joao.lima`, `luiza.campos`.
O `.env` aponta para o projeto escolhido; nunca coloque nele a `service_role`.

## Testes

- `npm test`: unitários do front (Vitest, jsdom) e de `src/domain`.
- `npm run test:supabase`: Edge Functions, paridade TS↔SQL e concorrência, contra o stack local aberto.
- `supabase test db`: pgTAP (permissões, append-only, RBAC, regras da portaria).
- `npx playwright test`: e2e dos specs `e2e/30` a `33`, contra o stack local (na 1ª vez: `npx playwright install chromium`).

## Estrutura de `src/`

- `api/`: `types.ts` (interface `Api` e `ApiError`, a única que a UI conhece), `supabase/` (adaptadores sobre as RPCs
  e Edge Functions; `createSupabaseApi.ts` monta tudo) e `index.tsx` (cria e provê a API).
- `auth/`: contexto de sessão e `RequireRole`. A sessão fica no `sessionStorage` do navegador (ver
  `api/supabase/armazenamento.ts`), não em cookie httpOnly.
- `app/`: rotas, layout, atalhos F2/F3/F4/F8, `queryClient` (política de retry) e `catalogo.tsx`.
- `features/`: uma pasta por área (auth, cadastro, encomendas, funcionarios, historico, importacao, lgpd, ocorrencias,
  portaria, relatorios, unidades, usuarios, vinculos).
- `components/`, `lib/`, `pwa/`, `test/`.

Telas cujo backend ainda não foi migrado somem do menu: `suporta()` em `api/` decide o que aparece.

## Regras compartilhadas

`src/domain` (`@domain`) tem as regras puras usadas pela UI (habilitar botões) e espelhadas em SQL, com
teste de paridade. Mudou a matriz de permissões em `rbac.ts`: gere o SQL com `node scripts/rbac-sql.mjs` e crie a
migração.
