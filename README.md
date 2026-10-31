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
| `diagramas/` | Diagramas de casos de uso (portaria, administração e auditoria), em PlantUML, SVG e PNG, e a visão geral da arquitetura |
| `pesquisa/` | Instrumento de avaliação de aceitação (TAM) pós-uso, com termo de consentimento, roteiro da demonstração e plano de análise, e o registro do pré-teste do instrumento |
| `src/`, `public/`, `index.html` | Front-end: SPA React 18 + Vite 5 + TypeScript + Tailwind + React Query (telas da portaria e da administração) |
| `packages/domain` | Regras de negócio puras (RBAC, hash chain, unidades, prazos), usadas pelo front e pelos testes de paridade do banco |
| `supabase/` | Backend no Supabase. `legado-drizzle/` guarda as 16 migrações SQL da API NestJS antiga, base do port; as migrações novas ficam em `migrations/` |
| `e2e/` | Specs Playwright, a portar para o Supabase local (foram escritas contra a API antiga) |
| `scripts/` | Geração dos ícones e da marca |

## O sistema

O protótipo atende **um condomínio**, com um banco de dados só. Funções:

- **Portaria:** registro de entrada e saída; meios de autorização (interfone, celular, morador presente, autorização
  prévia, escala de funcionário e exceção do porteiro com justificativa); registro retroativo para queda do sistema
  (contingência); prazo de permanência por tipo de visita; restrições de acesso; painel do turno; encomendas e
  ocorrências com anexos cifrados (AES-256-GCM).
- **Administração:** cadastro de pessoas, vínculos com a unidade e conferência do comprovante, unidades e veículos,
  funcionários e escala, usuários por papel (síndico, administração, porteiro, auditor), importação de planilha e
  relatórios.
- **Auditoria:** trilha de acessos só de inclusão, encadeada por hash (SHA-256), com verificação de integridade,
  exportação verificável, filtro por placa e selo diário com âncora externa.
- **Privacidade (LGPD):** pedidos do titular (exportação e anonimização), retenção por prazo e registro das
  anonimizações fora do banco, para reaplicá-las depois de uma restauração de backup.

Segurança (alvo da migração para o Supabase, ainda em andamento): autenticação pelo Supabase Auth, autorização por
papel no banco (RLS e funções), trilha só de inclusão protegida por trigger e CPF guardado só como máscara e HMAC. A
chave `service_role` nunca vai para o front nem para este repositório.

> **Estado atual:** o backend está sendo migrado de uma API NestJS (removida deste repositório, disponível no histórico
> do git até o commit `eae0555`) para o Supabase. Enquanto o adaptador do front não for concluído, as telas abrem mas
> não carregam dados.

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
supabase start           # sobe o Postgres e a API locais (http://127.0.0.1:54321)
supabase db reset        # recria o banco e aplica supabase/migrations do zero
supabase test db         # pgTAP de supabase/tests: superfície exposta e imutabilidade
```

Roteiros do que testar em cada tela: [docs/front.md](docs/front.md#roteiros-de-demonstração).

## Testes

```bash
npm run typecheck        # front e domain
npm test                 # Vitest + Testing Library (front) e regras do domain
npx playwright test      # e2e: a portar para o Supabase (1ª vez: npx playwright install chromium)
```

No GitHub Actions, `testes-web.yml` roda o typecheck, o build e os testes unitários, e `testes-banco.yml` aplica as
migrações num Supabase local e roda o pgTAP.

## Versão publicada

O front é publicado na Vercel a partir da raiz (`vercel.json`). A CSP libera `connect-src` apenas para o projeto
Supabase da demonstração. Os dados são fictícios.

## Proteção de dados

Nenhum dado pessoal real está publicado aqui. Os exemplos de pessoas, unidades e placas são fictícios, as chaves e
senhas vêm do ambiente e as respostas dos questionários não são publicadas, apenas os instrumentos.

## Direitos

Todos os direitos reservados aos autores (ver `LICENSE`), inclusive sobre o código deste repositório. Citação
acadêmica permitida, com a referência ao trabalho.
