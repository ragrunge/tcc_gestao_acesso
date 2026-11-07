# Desenvolvimento local: dados de teste

Este arquivo guarda o que o README não exibe: o seed de desenvolvimento do banco local e a carga de dados de teste.
Nada daqui roda no projeto hospedado por padrão, e nenhum dado é real.

## Seed de desenvolvimento (só local)

O `supabase/seed.sql` (`[db.seed]` do `supabase/config.toml`) roda em `supabase db reset` e só no banco local.

**Usuários de demonstração (só no banco local, criados por `supabase/seed.sql`; dados fictícios):** `roberto.faria`
(síndico), `paula.nogueira` (administração), `joao.lima` (porteiro) e `luiza.campos` (auditor), todos com a senha
`Demo-Portaria-2026`. Essa senha é pública: a demonstração nunca roda no projeto hospedado (não use `--include-seed` no
`db push`), e o arquivo recusa um banco que já tenha usuário ou pessoa. Ela cria também pessoas fictícias para
demonstrar a portaria: moradores com vínculo (por exemplo Fernanda Costa na B-21 e Carla Mendes na A-11), visitantes,
prestadores, um funcionário em escala, uma autorização prévia e uma restrição (Sérgio Prado na A-11). Os CPFs são
inventados, com dígito válido.

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
npm run test:integracao:sem-seed      # opcional, depois: reseta o banco local e roda a suíte sem seed
```

Confira também nas telas (front apontado para o local, ver "Como rodar localmente"): unidades, vínculos legados,
painel do turno, histórico e a verificação de integridade da trilha.

**2. Projeto hospedado.** Depois do ensaio:

```bash
npm run db:push:dry                # deve listar só as pendentes (hoje: a 0039, edição de usuários e gestão só do síndico)
npm run db:push
npm run popular:dry
POPULAR_CONFIRMAR=<id-do-projeto>.supabase.co npm run popular   # usa VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env
```

Se parar (rede, sessão, recusa do banco), corrija a causa e rode o mesmo comando: o que já foi gravado é conferido e
não se repete. Os 44 vínculos legados vencem 90 dias depois da carga (os moradores passam a entrar como visitantes até
a regularização pela tela).

## Tipos do banco e lint

- `npm run gen:types` (banco local no ar) regenera `src/integrations/supabase/type.ts` a partir do schema `api`. O arquivo é versionado: o `rpc()` do adaptador deriva dele o nome da RPC e as chaves dos argumentos, então depois de toda migração que cria ou renomeia função ou parâmetro, rodar o comando e commitar o resultado.
- O retorno das RPCs é `jsonb` e continua tipado à mão em `src/api/types/`; o gerador não cobre o formato do retorno.
- `npm run lint` (ESLint 9 com `react-hooks`) está limpo. `npm run format:check` ainda aponta 143 arquivos fora do Prettier; não foi aplicado em massa para não poluir o histórico.
