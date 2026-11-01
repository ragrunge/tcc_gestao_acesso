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
| `scripts/` | Geração dos ícones e da marca, do SQL da matriz de permissões (`rbac-sql.mjs`), primeiro síndico (`sindico/`) e carga fictícia da demonstração (`popular/`) |

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
supabase db reset        # recria o banco, aplica supabase/migrations do zero e roda supabase/seed/demo.sql
supabase test db         # pgTAP de supabase/tests/database: superfície, imutabilidade, sessão, login, matriz RBAC, cadeia, portaria, operação, anexos e paginação
# KEK local dos anexos (32 bytes aleatórios, só desta máquina; o arquivo é ignorado pelo git). Uma vez:
(umask 077; printf 'PORTARIA_KEK_V1=%s\n' "$(openssl rand -base64 32)" > supabase/functions/.env.local)
supabase functions serve --env-file supabase/functions/.env.local  # Edge Functions (auth-entrar, auth-trocar-senha, usuarios-admin, anexos)
```

Sem a KEK, a Edge `anexos` recusa envio e leitura com `CHAVE_INDISPONIVEL` (falha fechada). Trocar a KEK local torna
ilegíveis os anexos já enviados com a anterior (só dado fictício).

Para o front falar com o stack local, passe a URL e a anon key **locais** por variável de ambiente (elas vencem o
`.env`): `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<ANON_KEY de supabase status> npm run dev`.

O banco tem duas partes de dados, e só a primeira vai ao projeto hospedado:

| O quê | Onde | Roda em |
|---|---|---|
| **Estrutura do condomínio:** configuração (agrupamento "Bloco"), o ponto de acesso "Portaria social", as 7 áreas comuns e as unidades (9 blocos, A a I, 165 unidades) | migrações `supabase/migrations/…_0035_estrutura_condominio.sql` e `…_0036_estrutura_terreo_02.sql` | local e hospedado (`db push`), como as outras migrações |
| **Demonstração:** usuários, pessoas, vínculos, veículos, funcionário, autorização e restrição fictícios | `supabase/seed/demo.sql` (`[db.seed]` do `supabase/config.toml`) | **só local** (`supabase db reset`) |

A estrutura não tem usuário, pessoa nem senha, e só insere: reaplicada num banco já usado, não muda nada (as unidades
da 0035 só entram com a tabela vazia, e as três da 0036 só se ainda não existirem; depois da carga, unidades se cadastram, editam e desativam nas telas do sistema, com
trilha). **A distribuição das unidades é provisória:** as 165 do estudo de caso ficaram como 18 por bloco (térreo com 03
e 04) e 19 nos blocos G, H e I (térreo também com 02), escolha da demonstração que ainda precisa ser confirmada com o
síndico.

**Usuários de demonstração (só no banco local, criados por `supabase/seed/demo.sql`; dados fictícios):** `roberto.faria`
(síndico), `paula.nogueira` (administração), `joao.lima` (porteiro) e `luiza.campos` (auditor), todos com a senha
`Demo-Portaria-2026`. Essa senha é pública: a demonstração nunca roda no projeto hospedado (não use `--include-seed` no
`db push`), e o arquivo recusa um banco que já tenha usuário ou pessoa. Ela cria também pessoas fictícias para
demonstrar a portaria: moradores com vínculo (por exemplo Fernanda Costa na B-21 e Carla Mendes na A-11), visitantes,
prestadores, um funcionário em escala, uma autorização prévia e uma restrição (Sérgio Prado na A-11). Os CPFs são
inventados, com dígito válido.

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

**A demonstração (`supabase/seed/demo.sql`) nunca roda no projeto hospedado**: a senha dela é pública. O bootstrap
não depende dela. O hospedado recebe, no lugar, a carga fictícia de `scripts/popular/` (ver abaixo), que não cria
usuário nem senha.

Detalhes do login, da autorização no banco, da trilha, da importação e dos anexos: [docs/arquitetura.md](docs/arquitetura.md).

## Carga fictícia da demonstração

Para a demonstração ter o porte do estudo de caso, `scripts/popular/` gera um conjunto **100% fictício** e o grava
entrando como o síndico, pelo login normal (Edge `auth-entrar`) e **só pelas RPCs `api.*` que as telas usam**: cada
cadastro passa pelas regras do banco e vai para a trilha, com o síndico como autor. Não cria usuário, não usa chave de
serviço e não grava nada por SQL direto.

O conjunto é determinístico (semente fixa em `scripts/popular/gerador.ts`) e tem quantidades fixas:

| O quê | Quantidade | Como entra |
|---|---|---|
| Moradores | 543 em 157 unidades (8 vazias, 44 alugadas): 406 adultos e 137 menores; 164 proprietários, 63 inquilinos, 316 dependentes | adultos pela importação de planilha (um arquivo por bloco, `api.importacao_*`), como vínculo legado (RN-09); 362 deles têm a conferência do comprovante e a regularização, e 44 (de 16 unidades) ficam legados, com o prazo de 90 dias, para mostrar a fila de regularização; menores pelo cadastro (sem CPF e sem telefone), vínculo de dependente conferido e aprovado |
| Veículos | 175 (25 unidades ocupadas sem carro), placas antigas e Mercosul | `api.veiculo_criar` |
| Funcionários | 6 (3 porteiros em turnos que cobrem as 24 horas, zelador, limpeza, jardinagem) | `api.funcionario_criar` |
| Visitantes e prestadores | 18 e 6 | `api.pessoa_criar` |
| Autorizações prévias | 8 (2 de área comum) | `api.autorizacao_criar` |
| Restrições | 3 (2 de unidade e 1 de condomínio, aprovada) | `api.restricao_criar` e `restricao_aprovar` |
| Eventos de acesso | 38: 18 entradas (interfone, celular, morador presente, autorização prévia, exceção, escala e moradores), 18 saídas, 1 negado por restrição e 1 recusa | `api.evento_entrada`, `evento_saida`, `evento_recusa` |
| Encomendas e ocorrências | 8 encomendas (5 entregues) e 4 ocorrências sem anexo (3 mudanças de status) | `api.encomenda_*` e `api.ocorrencia_*` |

Os CPFs têm dígito verificador válido e não se repetem, os telefones seguem `(11) 9xxxx-xxxx` e os nomes são combinações
ao acaso de nomes e sobrenomes comuns. Os eventos são registrados **no momento da carga**, sem lançamento retroativo:
a contingência é para queda do sistema, e um formulário inventado deixaria na trilha um registro falso de queda.

**A trilha e a cadeia de hash são só de inclusão: no projeto hospedado, a carga é permanente.** O carregador é
idempotente e retomável (rodar de novo não duplica; se parar no meio, continua de onde parou), anda num ritmo fixo
(`POPULAR_INTERVALO_MS`, padrão 250 ms) e só sai com `POPULAR_CONFIRMAR` igual ao host do alvo. Login e senha do síndico
vêm de `local.credentials.txt` na raiz (linhas `login: ...` e `senha: ...`; o arquivo é ignorado pelo git) ou de
`POPULAR_LOGIN` e `POPULAR_SENHA`; nenhum dos dois é impresso.

**1. Ensaio local (recomendado antes de qualquer carga no hospedado).** Com o Docker aberto:

```bash
supabase start
supabase db reset --no-seed        # como o hospedado: só as migrações (inclusive a 0036), sem a demonstração
supabase functions serve --env-file supabase/functions/.env.local   # outro terminal: auth-entrar
npm run popular:sindico-local      # primeiro síndico local, com o login e a senha do arquivo de credenciais (ou POPULAR_LOGIN/POPULAR_SENHA)
npm run popular:dry                # valida o conjunto, sem rede
POPULAR_SUPABASE_URL=http://127.0.0.1:54321 POPULAR_SUPABASE_ANON_KEY=<ANON_KEY de supabase status> \
  POPULAR_CONFIRMAR=127.0.0.1:54321 npm run popular
# rode a mesma linha de novo: o relatório deve mostrar 0 criados em tudo. Interrompa uma terceira execução no meio
# (Ctrl+C) e rode outra vez: deve terminar sem duplicar.
npm run test:supabase:sindico      # opcional, depois: reseta o banco local e roda a suíte sem seed
```

Confira também nas telas (front apontado para o local, ver "Como rodar localmente"): unidades, vínculos legados,
painel do turno, histórico e a verificação de integridade da trilha.

**2. Projeto hospedado.** Depois do ensaio:

```bash
npm run db:push:dry                # deve listar só as pendentes (depois da carga: a 0037, paginação)
npm run db:push
npm run popular:dry
POPULAR_CONFIRMAR=<id-do-projeto>.supabase.co npm run popular   # usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env
```

Se parar (rede, sessão, recusa do banco), corrija a causa e rode o mesmo comando: o que já foi gravado é conferido e
não se repete. Os 44 vínculos legados vencem 90 dias depois da carga (os moradores passam a entrar como visitantes até
a regularização pela tela).

## Testes

```bash
npm run typecheck        # front e domain
npm test                 # Vitest + Testing Library (front) e regras do domain
npm run test:supabase    # Edge Functions (auth e anexos), paridade TS-SQL das regras, concorrência e operação (stack local + functions serve)
npm run test:supabase:sindico  # banco local SEM a demonstração, como o hospedado: primeiro síndico e estrutura (rode `supabase db reset` depois, para as outras suítes)
npx playwright test e2e/30-supabase-auth.spec.ts e2e/31-supabase-portaria.spec.ts e2e/32-supabase-operacao.spec.ts e2e/33-supabase-anexos.spec.ts  # e2e (stack local)
```

Na primeira vez, rode `npx playwright install chromium`.

Não há CI: os testes rodam só na máquina, com os comandos acima (o pgTAP e a integração precisam do Supabase local aberto).

## Versão publicada

O front é publicado na Vercel a partir da raiz (`vercel.json`). A CSP libera `connect-src` apenas para o projeto
Supabase hospedado, que recebe só as migrações (com a estrutura do condomínio), nunca a demonstração: os usuários de
lá são criados pelo primeiro síndico e pelas telas do sistema.

## Proteção de dados

Nenhum dado pessoal real está publicado aqui. Os exemplos de pessoas, unidades e placas são fictícios, as chaves e
senhas vêm do ambiente e as respostas dos questionários não são publicadas, apenas os instrumentos.

## Direitos

Todos os direitos reservados aos autores (ver `LICENSE`), inclusive sobre o código deste repositório. Citação
acadêmica permitida, com a referência ao trabalho.
