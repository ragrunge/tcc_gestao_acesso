# Arquitetura do backend

Resumo das decisões de segurança do backend no Supabase. A rastreabilidade requisito → código está em
`docs/rastreabilidade.md`, e as decisões dos anexos em `docs/anexos.md`.

**Autenticação.** O login funciona assim: o front chama a Edge `auth-entrar` com o **usuário** (não e-mail). A conta do Supabase Auth de
cada usuário tem um e-mail sintético aleatório que só o banco conhece, e a Edge aplica o limite de tentativas por
login+IP e a trilha de falhas antes de consultar o Auth. Papel, desativação, troca obrigatória e prazos da sessão são
lidos do banco a cada chamada (`app.ator()`), nunca do token. A matriz de permissões do banco é gerada de
`src/domain/rbac.ts` (`node scripts/rbac-sql.mjs`).

**Portaria** (migrações 0020–0024): cada operação é uma função `api.*` no Postgres que começa por `app.exigir(ação)` e
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

**Estrutura e demonstração** (migrações 0035 e 0036 e `supabase/seed/demo.sql`): a estrutura do condomínio (configuração,
ponto de acesso "Portaria social", áreas comuns e unidades) é dado de referência numa migração, para chegar ao projeto
hospedado pelo mesmo `db push` revisável das outras, com registro de aplicação e sem credencial nova. Ela só insere
(`ON CONFLICT DO NOTHING`; as unidades só com a tabela vazia), não toca na trilha nem na cabeça da cadeia (a gênese é
da 0001) e não troca o id do ponto nem das unidades, que entram no hash dos eventos. Depois da carga, mudanças de
unidade são feitas nas telas, com trilha. A 0036 acrescenta o 02 do térreo dos blocos G, H e I (165 unidades), com as
mesmas regras; a distribuição é provisória até a confirmação do síndico. A
demonstração (usuários com a senha pública `Demo-Portaria-2026`, pessoas e cadastros fictícios) roda só no
`supabase db reset` local e recusa banco que já tenha usuário ou pessoa. O teste `supabase/tests/sem-seed` confere,
num banco só com as migrações, a estrutura completa, a ausência de qualquer dado da demonstração e que reaplicar a
0035 e a 0036 num banco já usado não muda estrutura, eventos nem cadeia.

**Paginação e totais** (migração 0037): as listagens que crescem (pessoas, vínculos, encomendas, ocorrências, trilha de
acessos e trilha de alterações) aceitam `deslocamento` além do `cursor` (os dois juntos são recusados), com teto de 100
por página e de 100 000 no deslocamento, e devolvem `total`, contado no mesmo conjunto filtrado da página, depois do
mesmo `app.exigir`. A ordem tem desempate por id. Nas trilhas, a página 1 devolve `ateSeq` e as seguintes o repassam,
para um registro novo não empurrar a página; na trilha de acessos o caminho por cursor é o da 0023 sem total, porque a
exportação o percorre página a página. A exportação ignora os parâmetros de página e a verificação da cadeia continua em
`api.auditoria_cadeia`, que não mudou: as duas percorrem o conjunto inteiro. Os totais das telas vêm de resumos no banco
(`api.pessoas_resumo`, `vinculos_resumo`, `unidades_resumo`, `ocorrencias_resumo` e o `encomendas_resumo` da 0026), com a
mesma permissão da listagem, nunca da soma de páginas no navegador. As assinaturas não mudaram: o front publicado e o
carregador da carga fictícia seguem pelo cursor. Unidades, presentes, funcionários e catálogo não são paginados: a grade
mostra um bloco por vez e os outros conjuntos são pequenos.

**Usuários do sistema** (migração 0038 e Edge `usuarios-admin`): a tela lista por `api.usuarios_listar` e
`api.usuarios_resumo`, só leitura, com a mesma ação da gestão (`usuario.gerenciar`) e o contrato da 0037 (deslocamento
ou cursor, `total`, desempate por id). O item não leva o vínculo com o Auth nem o e-mail sintético, a busca por nome ou
login vai só no corpo do POST, e o usuário anonimizado pela retenção fica fora da lista e dos totais. Criar, desativar,
reativar e redefinir senha continuam na Edge, que decide no banco (`srv.usuario_*`, 0018); a senha temporária sai uma
vez na resposta e a tela a guarda só no estado do modal. O sistema não fica sem síndico ativo: só o síndico desativa
síndico, ninguém desativa a si mesmo e o ator fica travado e ativo até o fim da transação, então quem desativa o último
outro síndico continua ativo (pgTAP 12). Uma troca de papel, se vier, precisa conferir isso explicitamente, porque
rebaixar o último síndico quebraria a garantia.

**Carga fictícia** (`scripts/popular/`): o porte do estudo de caso (543 moradores, 175 veículos, histórico curto) entra
no hospedado como o síndico logado, só pelas RPCs `api.*` das telas, para que cada cadastro passe pelas regras e vá
para a trilha. Moradores adultos entram pela importação de planilha (vínculo legado) e são regularizados com a
conferência do comprovante; menores, pelo cadastro sem CPF. Os eventos são do momento da carga (nada retroativo). O
carregador é idempotente: cada fase confere o que já existe (listagens, recusas 409 e chaves naturais, como o rastreio
da encomenda e a descrição da ocorrência) antes de gravar; o fluxo é testado contra um banco falso em memória, e as
regras reais, no ensaio contra o Supabase local.
