# Anexos de ocorrência (F4): decisões e trade-offs

Porte da regra do legado (`apps/api/src/documentos/cofre.ts` e `ocorrencias.module.ts`, no histórico até `6a45b50^`) para
o Supabase: migração `supabase/migrations/20261031003300_0033_anexos.sql`, Edge `supabase/functions/anexos/` e
`supabase/functions/_shared/anexo.ts`, adaptador `src/api/supabase/anexos.ts`. RF-27, RNF-03, RN-10.

## Regra (igual ao legado)

| Item | Regra |
|---|---|
| Quem anexa | `ocorrencia.operar` (síndico, administração, porteiro); o porteiro só na ocorrência que ele abriu (403 `SO_PROPRIA_OCORRENCIA`); encerrada não recebe (409) |
| Quem abre o conteúdo | `documento.ver`: síndico e administração. O porteiro anexa mas não abre, nem o que enviou; o auditor vê só os metadados |
| Tipo | Pelos primeiros bytes (JPEG, PNG, PDF), nunca pelo nome nem pelo Content-Type do cliente (415) |
| Tamanho | 1 byte a 4 MiB (vazio 422, acima 413); no máximo 5 por ocorrência (422) |
| Nome | O original não é guardado. O objeto é `<uuid>.bin`, com id gerado na Edge; o download se chama `anexo-<8 hex>.<ext>` |
| Trilha | `ocorrencia.anexar` (só metadados: id, tipo, tamanho, SHA-256) e `documento.ler` a cada leitura |
| Duplicado | O mesmo arquivo duas vezes vira dois anexos (ids distintos), como no legado. Id repetido é 409 e o objeto nunca é sobrescrito (`upsert: false`) |

## Decisão 1: manter a cifra em nível de aplicação (AES-256-GCM com envelope)

A cifra em repouso do Storage é do provedor: protege o disco, mas qualquer um com a chave `service_role` ou acesso ao
painel lê o arquivo em claro. Com o envelope, o Storage só guarda cifra + tag, e a DEK de cada arquivo fica no banco
cifrada pela KEK. Para ler um anexo é preciso **juntar três coisas**: o objeto (Storage), a linha (banco) e a KEK
(secret da Edge). Isso sustenta a afirmação do artigo (RNF-03, "anexos criptografados em repouso") e mantém o formato
do legado byte a byte (`src/test/anexoCofre.test.ts` cifra com o código antigo e abre com o novo, e vice-versa).

Custo: a Edge processa o arquivo em claro na memória (até 4 MiB) e o download não pode ser URL assinada (decisão 3).

## Decisão 2: a KEK fica como secret da Edge Function, não no Vault

O critério da F2 para o HMAC do CPF foi "a chave fica onde o cálculo precisa acontecer": o HMAC precisava estar no SQL
para cadastro, busca e auditoria serem uma transação só, e por isso foi para o Vault. Aqui a cifra acontece na Edge.
Pôr a KEK no Vault deixaria a KEK e a DEK cifrada no **mesmo** banco (quem tem o papel `postgres` lê
`vault.decrypted_secrets`): o envelope deixaria de separar nada, e a KEK teria que sair do banco por uma RPC para a Edge
a cada chamada. Como secret da Edge (`PORTARIA_KEK_V1`, 32 bytes em base64), um dump do banco somado a uma cópia do
bucket não abre nenhum anexo. Ressalva (premissa P4 do desenho): a mesma pessoa administra a conta, então a separação é
de componente, não de pessoa.

Sem a KEK (ausente, fora de base64 ou com tamanho diferente de 32 bytes), envio e leitura falham com
`CHAVE_INDISPONIVEL` antes de ler o corpo.

**Rotação.** Cada documento grava `chave_versao`. A Edge cifra com `PORTARIA_KEK_VERSAO` (padrão 1) e lê com
`PORTARIA_KEK_V<versão do registro>`. Rotacionar = criar a `V2`, apontar `PORTARIA_KEK_VERSAO=2` e **manter** a `V1`
enquanto houver documento dela. Não há recifragem: `documento` é só de inclusão, e reescrever a DEK exigiria uma exceção
controlada nova (fora do escopo; o legado também não tinha rotação). Perder uma versão da KEK torna ilegíveis todos os
anexos dela. Guardar a KEK fora do Supabase (gerenciador de senhas) é parte do procedimento.

## Decisão 3: download por stream na Edge, não por URL assinada

O objeto no bucket é cifrado com a DEK do registro: uma URL assinada entregaria só o cifrado, e decifrar no navegador
exigiria mandar a DEK para ele. Além disso, a URL assinada é um token ao portador (vaza em histórico e log, e vale para
qualquer um durante o prazo) e a leitura por ela não passaria pela trilha. A Edge confere a permissão no banco, grava
`documento.ler`, baixa, decifra, confere o SHA-256 e responde `attachment` com `application/octet-stream`, `nosniff`,
`Content-Security-Policy: default-src 'none'; sandbox` e `no-store`. O front faz `fetch` com o token e monta o Blob.

A trilha de leitura é gravada **antes** de o conteúdo sair (o legado gravava depois de decifrar). Se a decifração falhar,
fica registrada a tentativa, e conteúdo nunca sai sem registro.

## Camadas

1. **Storage:** bucket `anexos` privado, limite do objeto 4 MiB + 16 bytes (a tag), só `application/octet-stream`. RLS
   do Storage sem nenhuma política permissiva, mais uma política **restritiva** para `anon`/`authenticated` que exclui o
   bucket mesmo se alguém criar depois uma política ampla (os GRANTs de `storage.objects` são do Supabase; ali a RLS é a
   única camada).
2. **Edge:** sessão e permissão decididas no banco antes de ler o corpo; teto de leitura do corpo (e o `Content-Length`);
   tipo pelos bytes; ids da query só no formato UUID (path traversal fechado); caminho vindo do banco conferido contra
   o id antes de virar caminho.
3. **Banco:** `srv.anexo_preparar` (checagem sem trava, nada sobe para quem não pode) e `srv.anexo_registrar` (as mesmas
   regras com a ocorrência travada: dois envios simultâneos na quarta vaga não passam de 5). CHECKs: caminho =
   `<id>.bin`, nonce de 12 bytes, DEK cifrada de 60, tipo e tamanho do anexo.
4. **Só de inclusão:** `app_rw` sem UPDATE/DELETE em `documento` e `ocorrencia_anexo`, e triggers que recusam UPDATE,
   DELETE e TRUNCATE. Única exceção: marcar `eliminado_em` uma vez, sem mudar outra coluna, pelas funções controladas de
   LGPD e retenção (dono da tabela). Elas não ligam o GUC `portaria.operacao` e as migrações 0000–0032 não são editadas,
   por isso a exceção é por dono e coluna.

Se o registro falhar depois do upload (limite atingido no meio, encerrada no meio), a Edge apaga o objeto. Queda da
Edge entre os dois passos deixa um objeto órfão sem registro: ilegível (a DEK não foi gravada) e removível por
varredura (a varredura em si é da F5).

## Divergências do legado e do desenho

- Trilha `documento.ler` antes de decifrar (acima).
- Erros: `DOCUMENTO_INVALIDO` (500) quando a Edge manda metadados fora do formato; `ARMAZENAMENTO_INDISPONIVEL` (503)
  quando o Storage recusa o upload; `DOCUMENTO_DUPLICADO` (409) para id repetido. O resto mantém os códigos do legado.
- O corpo do envio é o arquivo cru (`application/octet-stream`), não `multipart/form-data`: sem campo nem nome de arquivo.
- `ocorrencia_anexo` ganhou `UNIQUE (documento_id)`: um documento pertence a uma ocorrência só.
- As regras da Edge são cópia das de `packages/domain/src/rules.ts` (a Edge só enxerga `supabase/functions`), com teste
  de paridade em `src/test/anexoCofre.test.ts`. No banco, os mesmos números estão em `app.anexo_regras()` e nos CHECKs.

## Para o projeto hospedado (F6)

- A migração 0033 cria o bucket e a política por SQL (`supabase db push`). Conferir depois que o bucket existe, está
  privado e que não há política permissiva em `storage.objects`; o pgTAP `01_superficie` traz as consultas.
- `supabase secrets set PORTARIA_KEK_V1=...` pelo terminal (`!`), nunca pelo chat nem pelo repo. Guardar a KEK fora do
  Supabase.
- LGPD: a Edge processa o anexo em claro. Conferir a região de execução da Edge Function e se dá para fixá-la em
  `sa-east-1` (o supabase-js aceita `region` na chamada). Se não der, é transferência internacional durante o
  processamento, e o texto precisa dizer isso.
- Limites do plano gratuito: Storage de 1 GB e tamanho máximo de arquivo de 50 MB por projeto (o bucket limita a
  4 MiB); invocações e tempo de execução das Edge Functions. Conferir os números atuais no painel antes da TAM.
