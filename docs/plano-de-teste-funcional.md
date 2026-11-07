# Plano de teste funcional — portaria, vínculos, acesso e trilha

**Objetivo:** validar à mão, contra o projeto hospedado, os fluxos de maior risco do sistema (RF-12 a RF-20, RF-33 a RF-37, RN de autorização e de trilha). O módulo de encomendas tem plano próprio: [plano-de-teste-encomendas.md](plano-de-teste-encomendas.md).
**Versão / data:** migrações até a 0046, 07/11/2026. **Resultados:** nenhum caso executado ainda; todos em "não executado".
**Escopo:** dentro: entrada, saída, retroativo, restrição, autorização prévia, vínculos, papéis, usuários, verificação da trilha. Fora: foto da embalagem (RF-40), notificação automática (RF-24), compatibilidade de navegadores (painel só em Chrome e Safari de tablet, sem matriz), performance (um condomínio), carga de dados.
**Riscos:** entrada de pessoa sem direito (restrição, vínculo pendente); registro em unidade errada; permanência duplicada que mantém a pessoa "dentro"; retroativo usado para forjar histórico; ação fora do papel; trilha adulterada sem detecção.

## Abordagem

| Tipo | Como |
| --- | --- |
| Unitário | Vitest (`npm test`): regras de `src/domain` (prazo, autorização, RBAC, hash chain), adaptadores e telas da portaria. É o nível mais barato e roda a cada mudança |
| Banco | sem teste automático: o pgTAP foi retirado (tag `pgtap-final`); as regras do SQL se conferem pelos casos abaixo, na interface |
| Funcional | os casos abaixo, executados à mão na interface, um por técnica |
| Segurança | papel sem permissão tenta a ação (esperado `SEM_PERMISSAO` do servidor, não só botão escondido) |
| Regressão | todo bug vira caso; rodar tudo antes de cada publicação |
| Fora | performance, compatibilidade, usabilidade (TAM n = 9 já mede percepção) |

Técnicas: valor limite, partição de equivalência, tabela de decisão (meio de autorização por categoria), transição de estado (permanência), suposição de erro (os bugs 5 a 8 da rodada 2).

**Critério de entrada:** migrações até a 0046 aplicadas no ambiente de teste (o hospedado está na 0046 desde 07/11/2026); build publicado do mesmo commit; usuários de teste, um por papel (síndico, administração, porteiro, auditor, admin_sistema); unidades e pessoas fictícias.
**Critério de saída:** 100% dos casos críticos (C) passando; nenhum bug crítico ou alto aberto; risco residual das perguntas ao síndico registrado.

## Casos

Prioridade: C = crítico, A = alto, M = médio. Resultado esperado é o que se observa na tela ou no erro devolvido.

### Entrada e autorização (RF-12, RF-13, RF-17, RF-16)

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-ENT-01 | C | decisão | Porteiro: visitante com CPF, unidade com morador vinculado, meio "Interfone" e morador escolhido, confirmar | Toast "Entrada registrada", evento na trilha com `autorizadoPorTipo` interfone e o morador; pessoa aparece em "dentro" | não executado |
| TC-ENT-02 | C | decisão | Repetir TC-ENT-01 para celular, morador presente, autorização prévia válida, escala (funcionário em horário) e exceção com justificativa de 15 ou mais caracteres (`MIN_JUSTIFICATIVA`) | Cada meio registra; exceção aparece no relatório de exceções com o porteiro como responsável | não executado |
| TC-ENT-03 | C | valor limite | Exceção com justificativa de comprimento 14, 15 e 16 caracteres | Botão "Confirmar" só habilita no mínimo; o contador mostra "suficiente" | não executado |
| TC-ENT-04 | C | partição | Pessoa cadastrada sem CPF: escolher interfone, celular, morador presente e autorização prévia | Os quatro ficam desabilitados com o motivo "Pessoa sem CPF"; só exceção do porteiro libera | não executado |
| TC-ENT-05 | C | estado | Pessoa que já está dentro: tentar nova entrada | Recusa `JA_ESTA_DENTRO` com a mensagem do servidor; nenhuma permanência nova | não executado |
| TC-ENT-06 | C | partição | Morador escolhe a própria unidade | Alerta "Morador não registra entrada na própria unidade" e botão desabilitado; em outra unidade segue como visitante | não executado |
| TC-ENT-07 | C | fluxo | Pessoa com restrição vigente para a unidade: confirmar a entrada | Modal "Entrada não permitida"; os dois caminhos ("Registrar ocorrência" e "Cancelar") gravam um único evento `negado`; não há opção de liberar | não executado |
| TC-ENT-08 | C | fluxo | Restrição vigente para todo o condomínio, funcionário sem unidade | Modal ao escolher a pessoa; um só `negado` | não executado |
| TC-ENT-09 | A | partição | Prestador em área comum: sem autorização prévia da área e com ela; visitante tentando área comum | Prestador com prévia: libera; sem: só exceção; visitante nem vê a opção de área comum (RF-36) | não executado |
| TC-ENT-10 | A | fluxo | Morador recusa a visita ("Morador recusou") | Evento `recusado` na trilha com o morador, nenhuma entrada, tela limpa | não executado |
| TC-ENT-11 | A | valor limite | Autorização prévia com janela de horário: entrar 1 minuto antes do início, no início, no fim e 1 minuto depois | Vale só dentro da janela; fora mostra "fora do horário" e o meio fica desabilitado | não executado |
| TC-ENT-12 | M | suposição de erro | Dois Enter seguidos no botão confirmar; recarregar no meio do cadastro rápido | Uma entrada só; nada gravado pela metade | não executado |
| TC-ENT-13 | M | fluxo | Previsto no painel: "Registrar entrada" | Pessoa e destino vêm preenchidos; parâmetros somem da URL; recarregar não repete | não executado |

### Retroativo e correção (RF-35, rodada 2)

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-RET-01 | C | fluxo | Porteiro lança entrada retroativa 2 h atrás com número do formulário | Evento marcado "Retroativo", hora real no `ocorridoEm`, hora do lançamento gravada pelo sistema | não executado |
| TC-RET-02 | C | valor limite | Retroativo do porteiro com 71 h, 72 h e 73 h de idade | 71 h e 72 h aceitam; 73 h recusa `RETROATIVO_FORA_DA_JANELA`; síndico aceita os 73 h (janela de 72 h a confirmar com o síndico) | não executado |
| TC-RET-03 | C | suposição de erro | Pessoa já dentro (entrada aberta há 3 h): lançar retroativo 1 h atrás | Recusa `JA_ESTA_DENTRO` (bug 5) | não executado |
| TC-RET-04 | C | suposição de erro | Entrada retroativa 3 h atrás e saída 2 h atrás; síndico corrige a hora da entrada para 1 h atrás | Recusa `DATA_INCONSISTENTE` (bug 7) | não executado |
| TC-RET-05 | C | suposição de erro | Corrigir a pessoa de uma entrada aberta para outra que já está dentro | Recusa `JA_ESTA_DENTRO` (bug 8) | não executado |
| TC-RET-06 | A | valor limite | Retroativo com hora igual a agora e hora futura | Futura e igual ao agora recusam: "deve ser anterior ao momento atual" | não executado |
| TC-RET-07 | A | decisão | Sem número do formulário | Botão desabilitado, "Falta: nº do formulário de papel" | não executado |

### Saída e permanência

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-SAI-01 | C | estado | Saída de quem está dentro; segunda saída da mesma permanência | Primeira fecha; segunda recusa (já encerrada) | não executado |
| TC-SAI-02 | C | estado | Saída retroativa anterior à entrada | Recusa `DATA_INCONSISTENTE` | não executado |
| TC-SAI-03 | A | valor limite | Prorrogar a permanência até o limite de 4 prorrogações e tentar a quinta | Quarta aceita, quinta recusa | não executado |
| TC-SAI-04 | A | partição | Tipo de visita visita, entrega, transporte por app, serviço | Prazo mostrado no resumo segue o tipo; "Sai até" bate com a hora de entrada mais o prazo | não executado |

### Papéis e usuários (RF-33, RBAC)

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-RBAC-01 | C | decisão | Para cada papel, tentar: registrar entrada, correção de evento, cadastrar vínculo, aprovar vínculo, gerenciar usuário, exportar auditoria | Resultado igual à matriz de `src/domain/rbac.ts`; negados devolvem `SEM_PERMISSAO` (conferir também com o botão escondido, chamando pela tela de outro papel) | não executado |
| TC-RBAC-02 | C | decisão | Só o síndico cria, edita ou desativa conta de síndico e de admin_sistema | Administração e porteiro não veem nem executam | não executado |
| TC-USU-01 | C | estado | Síndico tenta desativar a si mesmo, mudar o próprio papel e desativar o último síndico | Todos recusados; o sistema nunca fica sem síndico ativo | não executado |
| TC-USU-02 | C | fluxo | Criar usuário com senha temporária; primeiro login | Senha mostrada uma vez; login exige troca; senha nova segue a política (12 caracteres, sem senha comum nem o login) | não executado |
| TC-USU-03 | A | partição | Login com senha errada, usuário desativado, sessão expirada no meio de uma ação | Mensagem sem revelar qual campo errou; desativado recusado; expirada leva ao login sem perder a tela de forma silenciosa | não executado |

### Vínculos e cadastro (RF-03 a RF-07)

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-VIN-01 | C | estado | Vínculo pendente não dá acesso de morador: tentar autorizar entrada por esse morador | Morador não aparece como autorizador; mensagem "vínculo pendente não dá acesso" | não executado |
| TC-VIN-02 | A | estado | Aprovar e rejeitar vínculo; encerrar no fim da vigência | Estados e quem decidiu aparecem na ficha e na trilha | não executado |
| TC-VIN-03 | A | partição | Duplicidade: mesma pessoa e unidade com vínculo ativo; segunda unidade | Mesma unidade recusa; outra unidade aceita | não executado |
| TC-VIN-04 | A | fluxo | Conferir comprovante de vínculo legado | Estado muda para regularizado e registra o conferente | não executado |

### Trilha e LGPD (RF-32, RF-37)

| ID | Pri. | Técnica | Passos | Resultado esperado | Status |
| --- | --- | --- | --- | --- | --- |
| TC-TRI-01 | C | fluxo | Verificação de integridade no Histórico depois de registrar entrada, correção e saída | "Íntegra", com o número de eventos | não executado |
| TC-TRI-02 | C | segurança | Correção de evento: o original permanece e a correção aparece como evento novo ligado | Linha do tempo mostra original e correção; o original não é editado | não executado |
| TC-TRI-03 | A | fluxo | Exportação verificável e conferência do hash fora do sistema | Hash recalculado igual ao informado | não executado |
| TC-LGPD-01 | A | segurança | Anonimizar pessoa; buscar por nome e CPF; abrir eventos antigos | Dados pessoais não aparecem; eventos permanecem na trilha | não executado |

## Execução e registro

1. Aplicar o critério de entrada; anotar commit e data na tabela de execução abaixo.
2. Executar por prioridade (C, depois A e M). Falha vira bug no formato abaixo e, depois de corrigida, caso de regressão.
3. Evidência: print da tela e, para erro de servidor, o código devolvido. Sem dado pessoal real.

```markdown
**Título:** {sintoma e onde}
**Severidade / prioridade:**
**Ambiente:** {URL, commit}
**Passos:** 1. ...
**Esperado / obtido:**
**Evidência:**
```

| Rodada | Data | Commit | Executados | Passou | Falhou | Bloqueado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | — | — | 0 | 0 | 0 | 0 |

## Perguntas em aberto (passo 0)

1. Janela do retroativo: 72 h é razoável para o porteiro, ou outro valor? Um retroativo pode coexistir com uma permanência aberta (hoje barra)?
2. Pessoa com restrição vigente pode retirar encomenda? (plano de encomendas)
3. Prazo de cada tipo de visita: os valores padrão em `src/domain/rules` são os do condomínio?
