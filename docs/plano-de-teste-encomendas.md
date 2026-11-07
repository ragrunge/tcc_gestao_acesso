# Plano de teste — Encomendas e ficha da unidade

**Objetivo:** validar o módulo M3 (RF-22 a RF-26, RN-08) e a seção de encomendas da ficha da unidade (RF-39).
**Versão / data:** migrações até a 0046, 06/11/2026.
**Escopo:** dentro: receber, entregar, autorizar retirada, listas e contagens, ficha da unidade. Fora: foto da embalagem (RF-40, fase futura), notificação automática (RF-24, interfone no MVP), restante do sistema (portaria, ocorrências, LGPD, relatórios, usuários: próxima rodada).
**Riscos:** retirada por pessoa sem direito (RN-08); encomenda registrada em unidade errada (P4); duplicidade por duplo envio; regressão de RBAC.

## Estratégia

| Tipo | Cobertura |
| --- | --- |
| Funcional | pgTAP `08_operacao` (receber, entregar, autorizar, listas) e a verificação manual da ficha da unidade |
| Regressão | todas as suítes abaixo; todo bug virou caso |
| API | contrato das RPCs `api.encomenda*` e `api.unidade_detalhe`, limites de tamanho, códigos de erro |
| Segurança | RBAC por papel (porteiro, administração, auditor, admin_sistema), pessoa desativada, anonimizada |
| Performance | fora: um condomínio, índice parcial `encomenda_pendente_ix` cobre a consulta da ficha |
| Compatibilidade | fora: sem matriz de navegadores e sem E2E automatizado |
| Usabilidade | fora desta rodada: só o TAM (n = 9) |

Técnicas: valor limite (7 dias, tamanhos de campo), transição de estado (aguardando para entregue, e as transições proibidas), tabela de decisão por papel.

## Casos

| ID | Técnica | Esperado | Onde | Resultado |
| --- | --- | --- | --- | --- |
| TC-ENC-01 | valor limite | 7 d 23 h 59 min: não atrasada; 8 dias: atrasada | pgTAP 08 | passou |
| TC-ENC-02 | valor limite | destinatário 120 ok e 121 `VALIDACAO`; transportadora e rastreio 60 ok e 61 `VALIDACAO` | pgTAP 08 | passou |
| TC-ENC-03 | decisão por papel | administração opera (a matriz permite); auditor recebe `SEM_PERMISSAO` em receber, entregar e autorizar | pgTAP 08 | passou |
| TC-ENC-04 | estado | autorizar retirada de encomenda já entregue: `ENCOMENDA_JA_ENTREGUE` | pgTAP 08 | passou |
| TC-ENC-BUG1a | estado | autorizar retirada de pessoa desativada: `PESSOA_DESATIVADA` | pgTAP 08 | passou; falha na 0026 |
| TC-ENC-BUG1b | estado | entregar a pessoa desativada que já tinha autorização: `PESSOA_DESATIVADA` | pgTAP 08 | passou; falha na 0026 |
| TC-UNI-01 | decisão por papel | os 4 papéis com `unidade.ver` recebem a chave `encomendas`; `admin_sistema` recebe `SEM_PERMISSAO` | pgTAP 08 | passou |
| TC-UNI-02 | valor limite | 21 aguardando: contagem 21, 20 itens, da mais antiga para a mais nova | pgTAP 08 | passou |
| TC-UNI-03 | estado | unidade desativada ainda lista as aguardando | pgTAP 08 | passou |
| TC-UNI-04 | fluxo | encomenda recebida aparece na ficha com contagem, código e transportadora; entregue, sai | manual (sem E2E automatizado) | verificado em 06/11/2026 |

Regressão do BUG-1: reaplicando as funções da 0026, falham exatamente os testes 50 e 53 de `08_operacao`; com a 0044 passa tudo.

## Bugs

**BUG-1 — média/alta — corrigido (0044).** Pessoa desativada podia ser autorizada a retirar e retirar. Passos: desativar uma pessoa sem vínculo, autorizá-la para uma encomenda aguardando (porteiro), registrar a entrega. Esperado: 422 `PESSOA_DESATIVADA`. Obtido: sucesso. Ambiente: banco local, migração 0043.

**BUG-2 — baixa — corrigido.** Dois Enter no mesmo instante na conferência da unidade criavam duas encomendas (K108 e K109). Causa: `salvando` só muda após o re-render. Correção: trava por `useRef` em `EncomendasPage.tsx`. Sem teste automatizado: a corrida é difícil de provocar no navegador. Verificação manual: na conferência, pressionar Enter repetidamente e conferir que a lista tem uma encomenda só.

**BUG-3 — baixa — corrigido (0046).** A tela exigia transportadora e o servidor aceitava vazio. Decisão: obrigatória nos dois (`TRANSPORTADORA_OBRIGATORIA`; a opção "Outra" cobre o resto). Teste TC-ENC-BUG3 em pgTAP 08.

**BUG-4 — alta — corrigido antes da entrega.** O adaptador `detalhe` (`src/api/supabase/portaria/`) descartava a chave `encomendas`; a seção da ficha nunca aparecia, e `tsc` e Vitest passavam. Pego pelo E2E que existia na época (removido na padronização); hoje só a verificação manual da ficha da unidade cobre esse caminho.

## Perguntas ao síndico (passo 0)
1. Pessoa com restrição vigente, inclusive a de todo o condomínio, pode retirar encomenda? Hoje pode.
2. O nome do destinatário deve ser conferido com os moradores da unidade, ou o texto livre basta?

## Critério de finalização
Todos os casos críticos passam em banco recém-resetado; nenhum bug crítico ou alto aberto. Estado em 06/11/2026: casos passando, BUG-3 e as perguntas abertas, rodada final limpa pendente (a integração exige banco recém-resetado).

## Rodada 2 (parcial) — entrada retroativa na portaria

Escopo lido: `api.evento_entrada`, `evento_saida`, `evento_corrigir`, `evento_prorrogar` e `app.resolver_instante` (0023). Não cobre autorização prévia nem restrição.
Método: sondas pgTAP numa cópia de `07_portaria` (fora do repositório), rodadas no banco local. Resultado das sondas, não suíte permanente: dependem de decisão do síndico.

**BUG-5 — média — corrigido (0045).** Retroativo de quem já está dentro é aceito. Passos: pessoa com entrada aberta; lançar entrada retroativa (formulário informado, data 1 h atrás). Esperado: `JA_ESTA_DENTRO`, como na entrada comum. Obtido: `ok`, e a pessoa passa a ter duas entradas abertas; uma saída fecha só uma e ela continua constando como dentro. A checagem é pulada de propósito (`IF NOT retro AND app.esta_dentro`), talvez porque o lançamento da contingência chega fora de ordem. Decisão aplicada: barra quando a pessoa já estava dentro no instante informado (entrada aberta igual ou anterior); retroativo anterior a uma entrada aberta mais nova continua aceito.

**BUG-6 — média — corrigido (0045).** Retroativo não tem limite de idade. Passos: porteiro lança exceção retroativa com formulário e data de 01/01/2000. Obtido: `ok`. Para entradas autorizadas por morador, o limite vem por acaso (o autorizador precisa ter vínculo na data); para exceção do porteiro, não há limite. RF-35 não fixa prazo. Num sistema cuja trilha é argumento jurídico, um porteiro poder datar um acesso anos atrás pesa. Decisão aplicada: 72 h para o porteiro; acima disso, permissão `evento.retroativo_antigo` (síndico e administração), erro `RETROATIVO_FORA_DA_JANELA`. O número segue sujeito à confirmação do síndico.

**BUG-7 — média — corrigido (0045).** A correção aceita datar a entrada depois da saída. Passos: entrada retroativa 3 h atrás, saída retroativa 2 h atrás, síndico corrige `ocorridoEm` da entrada para 1 h atrás. Esperado: `DATA_INCONSISTENTE`, como na saída anterior à entrada. Obtido: `ok`; a permanência fica com saída antes da entrada. `evento_corrigir` só confere `t < now()`. Correção provável: comparar com a saída ligada (e, na correção da saída, com a entrada).

**BUG-8 — média — corrigido (0045).** A correção de pessoa aceita quem já está dentro. Passos: entrada aberta de A; corrigir a pessoa dessa entrada para B, que já tem entrada aberta. Esperado: `JA_ESTA_DENTRO`. Obtido: `ok`, B com duas permanências abertas (mesmo efeito do BUG-5). Sem decisão de produto: é regra de consistência; pode entrar junto com a do BUG-5.

Cobertos sem achado: saída dupla (índice único `evento_saida_unica_uq`), saída retroativa anterior à entrada, correção de correção, limite de 4 prorrogações. Não testado: corrida de duas saídas ou prorrogações simultâneas (a prorrogação não trava a linha; o índice `permanencia_evento_ordem_uq` protege a ordem).

Perguntas ao síndico: qual a janela razoável para lançar uma contingência? Um retroativo pode coexistir com uma permanência aberta?
