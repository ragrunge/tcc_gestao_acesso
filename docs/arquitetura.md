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
devolve a pessoa, nunca o hash. Busca por CPF (`app.buscar_pessoas`, regra da 0042): 11 dígitos, igualdade pelo HMAC;
parcial, só contra os dígitos visíveis da máscara: no formato novo (`123.45*.***-**`) pelo começo, com 3 a 5 dígitos, e no
antigo (`***.456.789-**`) em qualquer ponto, com 3 a 6. Consulta parcial maior que a parte visível não casa por CPF (a
0022 cortava a consulta em 5 dígitos e devolvia todo CPF com o mesmo começo); nome, unidade e placa continuam valendo, e
as telas de busca pedem os 11 dígitos quando a consulta é numérica com 6 a 10 (`dicaBuscaCpf`, `src/domain/cpf.ts`).
Limite conhecido, decisão declarada do projeto: a máscara nova expõe 5 dos 11 dígitos (cerca de 45%), e a busca por
prefixo permite confirmar que existe alguém cadastrado com aquele começo. A mitigação é não aceitar busca parcial acima
de 5 dígitos nesse formato: a partir daí só os 11 identificam a pessoa. As regras do servidor (autorização da entrada, restrições, escala, permanência) têm uma
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

**Estrutura do condomínio** (migrações 0035 e 0036): a estrutura do condomínio (configuração,
ponto de acesso "Portaria social", áreas comuns e unidades) é dado de referência numa migração, para chegar ao projeto
hospedado pelo mesmo `db push` revisável das outras, com registro de aplicação e sem credencial nova. Ela só insere
(`ON CONFLICT DO NOTHING`; as unidades só com a tabela vazia), não toca na trilha nem na cabeça da cadeia (a gênese é
da 0001) e não troca o id do ponto nem das unidades, que entram no hash dos eventos. Depois da carga, mudanças de
unidade são feitas nas telas, com trilha. A 0036 acrescenta o 02 do térreo dos blocos G, H e I (165 unidades), com as
mesmas regras; a distribuição é provisória até a confirmação do síndico. 
Não há usuário nem dado de demonstração no banco: os dados fictícios entram pela carga (`scripts/popular`), pelas RPCs.

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

**Usuários do sistema** (migrações 0038 e 0039, Edge `usuarios-admin`): a tela lista por `api.usuarios_listar` e
`api.usuarios_resumo`, só leitura, com `usuario.ver` (síndico e administração) e o contrato da 0037 (deslocamento ou
cursor, `total`, desempate por id). O item não leva o vínculo com o Auth nem o e-mail sintético, a busca por nome ou
login vai só no corpo do POST, e o usuário anonimizado pela retenção fica fora da lista e dos totais. Criar, editar
(nome, login e papel), desativar, reativar e redefinir senha são só do síndico (`usuario.gerenciar`, desde a 0039) e
passam pela Edge, que decide no banco (`srv.usuario_*`, 0018 e 0039); a administração vê a tela sem nenhuma ação. A
senha temporária sai uma vez na resposta e a tela a guarda só no estado do modal. Mudar o login não toca no Auth (a
conta do Auth é o e-mail sintético); mudar o papel revoga as sessões do alvo na mesma transação, e ninguém muda o próprio
papel. O sistema não fica sem síndico ativo: só o síndico desativa ou rebaixa síndico, ninguém desativa a si mesmo nem
muda o próprio papel, e o ator fica travado e ativo até o fim da transação (coberto por pgTAP na tag `pgtap-final`). A edição confere isso também
de forma explícita: rebaixar o último síndico ativo dá 409, com os outros síndicos ativos travados.

**Administrador do sistema** (migrações 0040 e 0041): o papel `admin_sistema` é o técnico que cuida das contas. Não lê dado
pessoal de morador por nenhuma tela ou RPC. Tem só `usuario.ver` e `usuario.gerenciar`; a tela inicial e única é Usuários (mais "Trocar
minha senha"). Contas de síndico e de administrador do sistema, e atribuir um desses papéis, exigem
`usuario.gerenciar_sindico`, só do síndico (`app.exigir_gestao_sindico`, chamado por todas as `srv.usuario_*`): o técnico
não se promove, não cria outro técnico nem edita o próprio cadastro. Toda RPC de `api.*` começa por `app.exigir(ação)`,
então o papel novo é negado no resto pela falta de linha na matriz (o pgTAP 14 da tag `pgtap-final` percorria todas). Ficam abertas a ele só a
própria sessão, o catálogo (estrutura do condomínio, sem dado pessoal) e a lista de usuários. Limite conhecido, aceito e declarado (decisão do projeto): a restrição é de interface e de RPC, não impede o
acesso indireto. Quem
cria conta ou redefine senha de um papel com acesso a dado pessoal recebe a senha temporária e poderia entrar com ela;
o freio é a trilha (`usuario.criar`, `usuario.redefinir_senha`, `usuario.editar`, com o ator).

**Carga fictícia** (`scripts/popular/`): o porte do estudo de caso (543 moradores, 175 veículos, histórico curto) entra
no hospedado como o síndico logado, só pelas RPCs `api.*` das telas, para que cada cadastro passe pelas regras e vá
para a trilha. Moradores adultos entram pela importação de planilha (vínculo legado) e são regularizados com a
conferência do comprovante; menores, pelo cadastro sem CPF. Os eventos são do momento da carga (nada retroativo). O
carregador é idempotente: cada fase confere o que já existe (listagens, recusas 409 e chaves naturais, como o rastreio
da encomenda e a descrição da ocorrência) antes de gravar; o fluxo é testado contra um banco falso em memória, e as
regras reais, no ensaio contra o Supabase local.
