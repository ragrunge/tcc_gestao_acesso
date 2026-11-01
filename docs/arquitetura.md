# Arquitetura do backend

Resumo das decisões de segurança do backend no Supabase. A rastreabilidade requisito → código está em
`docs/rastreabilidade.md`, e as decisões dos anexos em `docs/anexos.md`.

**Autenticação.** O login funciona assim: o front chama a Edge `auth-entrar` com o **usuário** (não e-mail). A conta do Supabase Auth de
cada usuário tem um e-mail sintético aleatório que só o banco conhece, e a Edge aplica o limite de tentativas por
login+IP e a trilha de falhas antes de consultar o Auth. Papel, desativação, troca obrigatória e prazos da sessão são
lidos do banco a cada chamada (`app.ator()`), nunca do token. A matriz de permissões do banco é gerada de
`src/domain/rbac.ts` (`node scripts/rbac-sql.mjs`).

**Portaria** (migrações 0020–0024): cada operação é uma função `api.*` no Postgres (migrações 0020–0024) que começa por `app.exigir(ação)` e
roda com as permissões mínimas do papel `app_rw`; nenhuma tabela é exposta. O hash da trilha continua sendo calculado
pelo trigger do banco. O CPF é guardado como máscara e HMAC, com a chave no Supabase Vault (nunca sai do banco); a busca
devolve a pessoa, nunca o hash. As regras do servidor (autorização da entrada, restrições, escala, permanência) têm uma
versão em SQL e um teste de paridade com as de `src/domain`.

**Operação** (migrações 0025–0032): mesmo padrão. Funcionário nunca devolve o telefone inteiro; a conferência de
vínculo recusa número de pessoa em texto livre (função e CHECK da tabela); a integridade da trilha é verificada no
navegador, em lotes devolvidos por `api.auditoria_cadeia`, e a exportação registra na trilha os filtros sem o nome nem a
placa digitados. A importação guarda só a impressão HMAC de cada linha (chave no Vault), nunca a planilha.

**Anexos** (migração 0033 e Edge `anexos`): o bucket `anexos` do Storage é privado e não tem política para `anon` nem
`authenticated` (só o `service_role` da Edge alcança). Envio e leitura passam pela Edge, que decide no banco
(`srv.anexo_*`: sessão, papel, porteiro só na própria ocorrência, encerrada, no máximo 5) e confere o tipo pelos
primeiros bytes (JPEG, PNG ou PDF) e o tamanho (até 4 MiB). Cada arquivo é cifrado com AES-256-GCM e chave própria
(envelope com a KEK, que fica nos secrets da Edge, fora do banco), guardado como `<id>.bin` (o nome original não é
guardado) e registrado com o SHA-256 numa tabela só de inclusão. Só síndico e administração baixam o conteúdo, e cada
leitura vai à trilha (`documento.ler`). Decisões e trade-offs: [docs/anexos.md](docs/anexos.md).
