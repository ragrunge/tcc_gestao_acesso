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
| `diagramas/` | Diagramas de casos de uso (portaria, administração e auditoria), em PlantUML, SVG e PNG, e a visão geral da arquitetura |
| `pesquisa/` | Instrumento de avaliação de aceitação (TAM) pós-uso, com termo de consentimento, roteiro da demonstração e plano de análise, e o registro do pré-teste do instrumento |
| `src/`, `public/`, `index.html` | Front-end: SPA React 18 + Vite 5 + TypeScript + Tailwind + React Query (telas da portaria e da administração) |
| `src/domain` | Regras de negócio puras (RBAC, hash chain, unidades, prazos), usadas pelo front e pelos testes de paridade do banco |
| `supabase/` | Backend no Supabase: migrações em `migrations/`, Edge Functions em `functions/`, testes pgTAP em `tests/` |
| `e2e/` | Testes de ponta a ponta (Playwright) contra o Supabase local |
| `scripts/` | Geração dos ícones e da marca e do SQL da matriz de permissões (`rbac-sql.mjs`) |

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
- **Acesso:** login por usuário e senha pelo Supabase Auth, quatro papéis (síndico, administração, porteiro e
  auditor), com permissões decididas no banco.

**Previstas, ainda não migradas** (essas telas somem do menu e mostram "ainda não está disponível nesta versão")

- **Privacidade (LGPD):** pedidos do titular (exportação e anonimização) e retenção por prazo.
- **Selo diário da trilha** com âncora externa.
- **Tela de gestão de usuários** (a criação de contas já existe no backend, pela Edge `usuarios-admin`).

**Segurança:** autenticação pelo Supabase Auth, autorização por papel no banco (funções SQL com RLS como contenção),
trilha só de inclusão protegida por trigger e CPF guardado só como máscara e HMAC. A chave `service_role` nunca vai para
o front nem para este repositório. O backend foi migrado de uma API NestJS própria para o Supabase; a versão anterior
está na tag `nestjs-final`.

## Artigo e demonstração

- Artigo: *a definir*.
- Demonstração publicada: *a definir* (ver "Versão publicada").

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
supabase db reset        # recria o banco, aplica supabase/migrations do zero e roda supabase/seed.sql
supabase test db         # pgTAP de supabase/tests/database: superfície, imutabilidade, sessão, login, matriz RBAC, cadeia, portaria, operação e anexos
# KEK local dos anexos (32 bytes aleatórios, só desta máquina; o arquivo é ignorado pelo git). Uma vez:
(umask 077; printf 'PORTARIA_KEK_V1=%s\n' "$(openssl rand -base64 32)" > supabase/functions/.env.local)
supabase functions serve --env-file supabase/functions/.env.local  # Edge Functions (auth-entrar, auth-trocar-senha, usuarios-admin, anexos)
```

Sem a KEK, a Edge `anexos` recusa envio e leitura com `CHAVE_INDISPONIVEL` (falha fechada). Trocar a KEK local torna
ilegíveis os anexos já enviados com a anterior (só dado fictício).

Para o front falar com o stack local, passe a URL e a anon key **locais** por variável de ambiente (elas vencem o
`.env`): `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<ANON_KEY de supabase status> npm run dev`.

**Usuários de demonstração (só no banco local, criados por `supabase/seed.sql`; dados fictícios):** `roberto.faria`
(síndico), `paula.nogueira` (administração), `joao.lima` (porteiro) e `luiza.campos` (auditor), todos com a senha
`Demo-Portaria-2026`. Essa senha é pública: o seed nunca deve rodar no projeto hospedado. O seed também cria a
estrutura do condomínio (blocos, unidades, áreas comuns, a portaria) e pessoas fictícias para demonstrar a portaria: moradores
com vínculo (por exemplo Fernanda Costa na B-21 e Carla Mendes na A-11), visitantes, prestadores, um funcionário em
escala, uma autorização prévia e uma restrição (Sérgio Prado na A-11). Os CPFs são inventados, com dígito válido.

Detalhes do login, da autorização no banco, da trilha, da importação e dos anexos: [docs/arquitetura.md](docs/arquitetura.md).

## Testes

```bash
npm run typecheck        # front e domain
npm test                 # Vitest + Testing Library (front) e regras do domain
npm run test:supabase    # Edge Functions (auth e anexos), paridade TS-SQL das regras, concorrência e operação (stack local + functions serve)
npx playwright test e2e/30-supabase-auth.spec.ts e2e/31-supabase-portaria.spec.ts e2e/32-supabase-operacao.spec.ts e2e/33-supabase-anexos.spec.ts  # e2e (stack local)
```

Na primeira vez, rode `npx playwright install chromium`.

Não há CI: os testes rodam só na máquina, com os comandos acima (o pgTAP e a integração precisam do Supabase local aberto).

## Versão publicada

O front é publicado na Vercel a partir da raiz (`vercel.json`). A CSP libera `connect-src` apenas para o projeto
Supabase da demonstração. Os dados são fictícios.

## Proteção de dados

Nenhum dado pessoal real está publicado aqui. Os exemplos de pessoas, unidades e placas são fictícios, as chaves e
senhas vêm do ambiente e as respostas dos questionários não são publicadas, apenas os instrumentos.

## Direitos

Todos os direitos reservados aos autores (ver `LICENSE`), inclusive sobre o código deste repositório. Citação
acadêmica permitida, com a referência ao trabalho.
