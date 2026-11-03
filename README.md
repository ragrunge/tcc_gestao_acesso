# Controle e Gestão de Acesso em Condomínio Residencial

Material do Trabalho de Conclusão de Curso de Sistemas de Informação (EAD) *Controle e Gestão de Acesso em
Condomínio Residencial: contribuições para a segurança patrimonial, administrativa e jurídica*.

Autores: Ana Carolina Vilelo Moreira Dias, Rafael Aparecido Vidal e Ruan Abolis de Araújo.
Orientador: Prof. Me. Gilberto Alves Pereira. Faculdade Impacta, São Paulo, 2026.

## Sobre o trabalho

Estudo de caso em um condomínio residencial vertical de São Paulo–SP, com portaria 24 horas, 9 blocos e de 500 a 600
moradores. A pesquisa:

1. identificou as limitações do controle de acesso atual, por entrevista com o síndico e questionário com a equipe do
   condomínio;
2. levantou os requisitos de um sistema de controle de acesso aderente à gestão condominial;
3. analisou a legislação aplicável (LGPD, Código Civil, Lei de Condomínios e Estatuto da Pessoa com Deficiência);
4. desenvolveu um protótipo funcional do sistema a partir desses requisitos;
5. avaliou o protótipo quanto à conformidade legal, à mitigação de riscos operacionais e à aceitação pela equipe
   (Modelo de Aceitação de Tecnologia, TAM).

O nome do condomínio e dos participantes não aparece neste repositório, para preservar a identidade de quem
participou da pesquisa.

## Conteúdo

| Pasta | O que tem |
|---|---|
| `docs/requisitos.md` | Documento de requisitos: problemas levantados, escopo, requisitos funcionais e não funcionais, regras de negócio, proteção de dados (LGPD), casos de uso e matriz de rastreabilidade com os indicadores de avaliação |
| `docs/rastreabilidade.md` | Ligação de cada requisito funcional ao código que o implementa |
| `docs/arquitetura.md`, `docs/anexos.md`, `docs/front.md` | Decisões de segurança do backend, dos anexos cifrados e guia do front |
| `docs/desenvolvimento-local.md` | Seed de desenvolvimento do banco local e carga de dados de teste (nada disso roda no projeto hospedado por padrão) |
| `diagramas/` | Diagramas de casos de uso (portaria, administração e auditoria), em PlantUML, SVG e PNG |
| `src/`, `public/`, `index.html` | Front-end: SPA React 18 + Vite 5 + TypeScript + Tailwind + React Query (telas da portaria e da administração) |
| `src/domain` | Regras de negócio puras (RBAC, hash chain, unidades, prazos), usadas pelo front e pelos testes de paridade do banco |
| `supabase/` | Backend no Supabase: migrações em `migrations/`, Edge Functions em `functions/`, testes pgTAP em `tests/` |
| `e2e/` | Testes de ponta a ponta (Playwright) contra o Supabase local |
| `scripts/` | Geração dos ícones e da marca, do SQL da matriz de permissões (`rbac-sql.mjs`), primeiro síndico (`sindico/`) e carga de dados de teste (`popular/`) |

## O sistema

O protótipo atende **um condomínio**, com um banco de dados só. Funções:

**Implementadas**

- **Portaria:** registro de entrada e saída; meios de autorização (interfone, celular, morador presente, autorização
  prévia, escala de funcionário e exceção do porteiro com justificativa); registro retroativo para queda do sistema
  (contingência); prazo de permanência por tipo de visita; restrições de acesso; painel do turno; encomendas e
  ocorrências com anexos cifrados (AES-256-GCM).
- **Administração:** cadastro de pessoas, vínculos com a unidade e conferência do comprovante, unidades e veículos,
  funcionários e escala, importação de planilha e relatórios com exportação em CSV.
- **Auditoria:** trilha de acessos só de inclusão, encadeada por hash (SHA-256), com verificação de integridade no
  navegador e exportação verificável.
- **Acesso:** login por usuário e senha pelo Supabase Auth, cinco papéis (síndico, administração, porteiro, auditor e
  administrador do sistema, que gerencia contas sem tela nem RPC de dado pessoal, mas pode, indiretamente, criar ou
  redefinir uma conta com acesso; o freio é a trilha), com permissões decididas no banco.
- **Usuários do sistema:** lista com busca, filtro por papel e situação e totais do servidor; criação com senha
  temporária mostrada uma vez (troca obrigatória no primeiro acesso), edição de nome, login e papel, nova senha
  temporária, desativação e reativação. Só o síndico gerencia; a administração vê a lista e os totais. Ninguém desativa
  a si mesmo nem muda o próprio papel, e o sistema nunca fica sem síndico ativo.
- **Interface:** adaptada a celular, tablet e computador (alvos de toque de 44 px em dispositivo de toque, menu em gaveta
  até 1279 px) e instalável como PWA.

**Previstas, ainda não migradas** (essas telas somem do menu e mostram "ainda não está disponível nesta versão")

- **Privacidade (LGPD):** pedidos do titular (exportação e anonimização) e retenção por prazo.
- **Selo diário da trilha** com âncora externa.

**Segurança:** autenticação pelo Supabase Auth, autorização por papel no banco (funções SQL com RLS como contenção),
trilha só de inclusão protegida por trigger e CPF guardado só como máscara e HMAC. A chave `service_role` nunca vai para
o front nem para este repositório. O backend foi migrado de uma API NestJS própria para o Supabase; a versão anterior
está na tag `nestjs-final`.

## Artigo e demonstração

- Artigo: *a definir*.
- Sistema publicado: https://tcc-gestao-acesso.vercel.app (acesso por usuário cadastrado; ver "Versão publicada").

## Como rodar localmente

Precisa de Node 22 ou mais novo (`.nvmrc`) e npm, e de um projeto Supabase (hospedado, ou local com a CLI e Docker).

```bash
npm ci
cp .env.example .env     # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (o .env não é versionado)
npm run dev              # http://localhost:5173
```

Use apenas a chave **anon/publishable** no `.env`: ela vai para o bundle público. Nunca a `service_role`, nem o token
de acesso da conta nem a senha do banco.

Banco local (Supabase CLI e Docker; não precisa de conta nem de `supabase link`):

```bash
supabase start           # sobe o Postgres, o Auth e a API locais (http://127.0.0.1:54321)
supabase db reset        # recria o banco, aplica supabase/migrations do zero e roda supabase/seed/demo.sql
supabase test db         # pgTAP de supabase/tests/database: superfície, imutabilidade, sessão, login, matriz RBAC, cadeia, portaria, operação, anexos, paginação, usuários, edição de usuário e administrador do sistema
# KEK local dos anexos (32 bytes aleatórios, só desta máquina; o arquivo é ignorado pelo git). Uma vez:
(umask 077; printf 'PORTARIA_KEK_V1=%s\n' "$(openssl rand -base64 32)" > supabase/functions/.env.local)
supabase functions serve --env-file supabase/functions/.env.local  # Edge Functions (auth-entrar, auth-trocar-senha, usuarios-admin, anexos)
```

Sem a KEK, a Edge `anexos` recusa envio e leitura com `CHAVE_INDISPONIVEL` (falha fechada). Trocar a KEK local torna
ilegíveis os anexos já enviados com a anterior (só dado de teste).

Para o front falar com o stack local, passe a URL e a anon key **locais** por variável de ambiente (elas vencem o
`.env`): `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<ANON_KEY de supabase status> npm run dev`.

O banco tem duas partes de dados. A **estrutura do condomínio** (configuração com o agrupamento "Bloco", o ponto de acesso
"Portaria social", as 7 áreas comuns e as unidades: 9 blocos, A a I, 165 unidades) entra pelas migrações
`supabase/migrations/…_0035_estrutura_condominio.sql` e `…_0036_estrutura_terreo_02.sql`, no banco local e no hospedado
(`db push`). Os **dados de teste de desenvolvimento** (`supabase/seed/demo.sql`) rodam **só no banco local**: o arquivo
recusa um banco que já tenha usuário ou pessoa, e a senha dos usuários de teste é pública, por isso nunca use
`--include-seed` no `db push`. Credenciais e conteúdo: [docs/desenvolvimento-local.md](docs/desenvolvimento-local.md).

A estrutura não tem usuário, pessoa nem senha, e só insere: reaplicada num banco já usado, não muda nada (as unidades
da 0035 só entram com a tabela vazia, e as três da 0036 só se ainda não existirem; depois da carga, unidades se cadastram, editam e desativam nas telas do sistema, com
trilha). **A distribuição das unidades é provisória:** as 165 do estudo de caso ficaram como 18 por bloco (térreo com 03
e 04) e 19 nos blocos G, H e I (térreo também com 02), escolha provisória que ainda precisa ser confirmada com o
síndico.

## Primeiro síndico (projeto hospedado)

O projeto hospedado nasce sem nenhum usuário, e a gestão de usuários exige alguém logado. A estrutura do condomínio
chega pelas migrações; o primeiro usuário, um síndico, é criado por um script que o dono do projeto roda no próprio
terminal:

```bash
npm run db:push:dry      # confere o que vai subir (só migrações; nunca use --include-seed)
npm run db:push          # aplica as migrações pendentes (a 0034 traz o bootstrap; a 0035 e a 0036, a estrutura do condomínio)
npm run sb:sindico       # pede nome, login e senha (sem eco, duas vezes) e o ID do projeto para confirmar
```

O script lê do `.env` só `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` e `SUPABASE_ACCESS_TOKEN`. Com o token, pede à
Management API a chave secreta do projeto e a mantém só em memória (nada vai para disco nem para o log). A senha segue a
mesma política do sistema (mínimo de 12 caracteres, até 72 bytes, sem senha comum nem o login) e não há troca obrigatória
no primeiro acesso, porque foi escolhida por quem vai usá-la. O banco recusa se já existir **qualquer** usuário, e duas
execuções simultâneas se enfileiram: a segunda recusa e apaga a conta que tinha criado no Auth. Os demais usuários são
criados pelo síndico, no sistema.

O bootstrap não depende de seed algum: a demonstração (`supabase/seed/demo.sql`) nunca roda no projeto hospedado, porque a
senha dela é pública.

Detalhes do login, da autorização no banco, da trilha, da importação e dos anexos: [docs/arquitetura.md](docs/arquitetura.md).

## Testes

```bash
npm run typecheck        # front e domain
npm test                 # Vitest + Testing Library (front) e regras do domain
npm run test:supabase    # Edge Functions (auth e anexos), paridade TS-SQL das regras, concorrência e operação (stack local + functions serve)
npm run test:supabase:sindico  # banco local SEM a demonstração, como o hospedado: primeiro síndico e estrutura (rode `supabase db reset` depois, para as outras suítes)
npx playwright test e2e/30-supabase-auth.spec.ts e2e/31-supabase-portaria.spec.ts e2e/32-supabase-operacao.spec.ts e2e/33-supabase-anexos.spec.ts e2e/34-supabase-usuarios.spec.ts e2e/35-supabase-usuarios-editar.spec.ts e2e/36-supabase-admin-sistema.spec.ts  # e2e (stack local)
```

Na primeira vez, rode `npx playwright install chromium`.

Não há CI: os testes rodam só na máquina, com os comandos acima (o pgTAP e a integração precisam do Supabase local aberto).

## Versão publicada

O front é publicado na Vercel a partir da raiz (`vercel.json`). A CSP libera `connect-src` apenas para o projeto
Supabase hospedado, que recebe só as migrações (com a estrutura do condomínio), nunca o seed de desenvolvimento. Os
usuários de lá são criados pelo síndico, pelas telas do sistema. A equipe inicial foi provisionada pelo responsável
técnico por um script avulso, com o registro `(provisionamento manual)` na trilha de auditoria e troca de senha
obrigatória no primeiro acesso.

## Proteção de dados

Nenhum dado pessoal real está publicado aqui. As chaves e senhas vêm do ambiente e as respostas dos questionários
não são publicadas.

## Direitos

Todos os direitos reservados aos autores (ver `LICENSE`), inclusive sobre o código deste repositório. Citação
acadêmica permitida, com a referência ao trabalho.
