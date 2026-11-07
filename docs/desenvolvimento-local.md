# Dados de teste e tipos do banco

Este arquivo guarda o que o README não exibe: a carga de dados de teste no projeto Supabase hospedado e os tipos gerados do banco.
Não há banco local nem Docker no fluxo de trabalho; nenhum dado aqui é real.

## Carga de dados de teste (`scripts/popular/`)

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

**Carga no projeto hospedado** (a trilha é permanente: confira o alvo antes):

```bash
npm run db:push:dry                # deve listar só as migrações pendentes
npm run db:push
npm run popular:dry                # valida o conjunto, sem rede
POPULAR_CONFIRMAR=<id-do-projeto>.supabase.co npm run popular   # usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env
```

Rode `popular` de novo para conferir: o relatório deve mostrar 0 criados em tudo. Se parar (rede, sessão, recusa do
banco), corrija a causa e rode o mesmo comando: o que já foi gravado é conferido e não se repete. Os 44 vínculos legados
vencem 90 dias depois da carga (os moradores passam a entrar como visitantes até a regularização pela tela). Depois da
carga, confira nas telas: unidades, vínculos legados, painel do turno, histórico e a verificação de integridade da trilha.

## Tipos do banco e lint

- `npm run gen:types` (usa `VITE_SUPABASE_PROJECT_ID` e `SUPABASE_ACCESS_TOKEN` do `.env`) regenera `src/integrations/supabase/type.ts` a partir do schema `api`. O arquivo é versionado: o `rpc()` do adaptador deriva dele o nome da RPC e as chaves dos argumentos, então depois de toda migração que cria ou renomeia função ou parâmetro, rodar o comando e commitar o resultado.
- O retorno das RPCs é `jsonb` e continua tipado à mão em `src/api/types/`; o gerador não cobre o formato do retorno.
- `npm run check` roda `type-check`, `lint` (ESLint 9 com `react-hooks`) e `format:check` (Prettier); o CI exige os três.
