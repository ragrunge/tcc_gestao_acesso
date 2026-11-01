# Rastreabilidade: requisito funcional → backend → tela

Cada linha liga um RF de `docs/requisitos.md` ao código que o implementa. Caminhos a partir da raiz do repositório.
O backend é o Supabase: regras e permissões ficam em funções SQL do schema `api` (RPCs chamadas pelo front) em
`supabase/migrations/`, e as operações que precisam da API admin do Auth ou do Storage ficam em Edge Functions em
`supabase/functions/`. As regras puras compartilhadas com a UI ficam em `src/domain/` (`rules.ts`, `rbac.ts`,
`units.ts`, `hashChain.ts`). Os adaptadores do front estão em `src/api/supabase/`. A API NestJS anterior está na tag
`nestjs-final`. A trilha RN/UC → arquivo mais detalhada está nos comentários do código (`git grep -n 'RF-'`).

| RF | Descrição resumida | Backend (`supabase/migrations/`) | Tela (`src/`) |
|---|---|---|---|
| RF-01 | Cadastro de unidades (bloco e número) | `api.unidade_criar`, `unidade_editar`, `unidade_desativar`, `unidade_reativar`, `unidades_listar`, `unidade_detalhe` (0022, 0029); totais: `unidades_resumo` (0037) | `features/unidades/UnidadesPage.tsx` |
| RF-02 | Cadastro de pessoas (CPF, exceção sem CPF) | `api.pessoa_criar`, `pessoa_editar`, `pessoa_ficha`, `pessoas_listar`, `pessoa_desativar`, `pessoa_reativar` (0022, 0028, 0029); página numerada e totais: `pessoas_listar`, `pessoas_resumo` (0037); HMAC do CPF no Vault (0020) | `features/cadastro/CadastroPage.tsx`, `features/cadastro/FichaPessoaModal.tsx` |
| RF-03, RF-04, RF-06 | Vínculo com a unidade, pendente até aprovação, quem aprovou/rejeitou | `api.vinculo_criar`, `vinculo_aprovar`, `vinculo_rejeitar`, `vinculos_listar`, `vinculos_contar`, `vinculos_autorizadores` (0025); página numerada e totais: `vinculos_listar`, `vinculos_resumo` (0037) | `features/vinculos/VinculosPage.tsx` |
| RF-05 | Conferência do comprovante de vínculo | `api.vinculo_conferir`, `vinculo_regularizar` (0002, 0025) | `features/vinculos/VinculosPage.tsx` |
| RF-07 | Encerramento do vínculo no fim da vigência | `api.vinculo_encerrar` (0025) | `features/vinculos/VinculosPage.tsx` |
| RF-08 | Veículos da unidade | `api.veiculo_criar`, `veiculo_editar` (0029) | `features/unidades/UnidadeDetalhePage.tsx` |
| RF-09 | Funcionários, função e escala | `api.funcionario_criar`, `funcionario_editar`, `funcionarios_listar`, `pessoa_funcionario` (0028) | `features/funcionarios/FuncionariosPage.tsx`, `features/funcionarios/escala.ts` |
| RF-10 | Dispositivos de acesso (prioridade C) | não implementado | não implementado |
| RF-11 | Importação da planilha de moradores | `api.importacao_analisar`, `importacao_confirmar` (0032); o banco guarda só a impressão HMAC de cada linha | `features/importacao/ImportacaoPage.tsx`, `features/importacao/csv.ts` |
| RF-12, RF-13, RF-17 | Entrada e saída, quem autorizou, justificativa da exceção | `api.evento_entrada`, `evento_saida`, `evento_obter`, `evento_ultimo_veiculo` (0023) | `features/portaria/EntradaPage.tsx`; saída (UC07): `features/portaria/SaidaPage.tsx`, `features/portaria/saida.tsx` |
| RF-14 | Autorização prévia | `api.autorizacao_criar`, `autorizacao_revogar`, `autorizacoes_hoje`, `autorizacoes_previstas`, `autorizacoes_vigentes` (0024) | `features/unidades/UnidadeDetalhePage.tsx` |
| RF-15 | Restrições da unidade | `api.restricao_criar`, `restricao_aprovar`, `restricao_revogar`, `restricoes_pendentes` (0024) | `features/unidades/UnidadeDetalhePage.tsx`, `features/portaria/PainelPage.tsx` |
| RF-16 | Bloqueio por restrição (evento `negado`) | `api.restricao_verificar`, `evento_recusa`; o evento negado persiste e o adaptador o converte em erro 422 (0023, 0024) | `features/portaria/EntradaPage.tsx`, `features/portaria/negado.ts` |
| RF-18, RF-34 | Busca de pessoa e reaproveitamento de cadastro | `api.pessoas_buscar`, `busca_global` (0022) | `components/PessoaPicker.tsx`, `features/portaria/EntradaPage.tsx` |
| RF-19 | Histórico de acessos | `api.eventos_listar`, `evento_obter`, `evento_correcoes` (0023); página numerada com `ateSeq`, total e contagem por tipo (0037) | `features/historico/HistoricoPage.tsx`, `features/historico/EventoGaveta.tsx` |
| RF-20 | Pessoas dentro do condomínio | `api.eventos_presentes` (0023) | `features/portaria/PessoasDentroPage.tsx`, `features/portaria/presentes.tsx` |
| RF-22, RF-23, RF-25, RF-26 | Encomendas: recebimento, conferência da unidade, retirada, atrasadas | `api.encomenda_receber`, `encomenda_autorizar_retirada`, `encomenda_entregar`, `encomendas_listar`, `encomendas_resumo`, `encomenda_obter` (0026); página numerada (0037) | `features/encomendas/EncomendasPage.tsx` |
| RF-24 | Notificação da unidade (interfone no MVP) | fora do sistema no MVP | fora do sistema no MVP |
| RF-27, RF-28 | Ocorrências e vínculo com eventos | `api.ocorrencia_criar`, `ocorrencia_alterar_status`, `ocorrencia_vincular_eventos`, `ocorrencias_listar`, `ocorrencia_obter` (0027); página numerada e totais: `ocorrencias_resumo` (0037); anexos: Edge Function `anexos` (0033) | `features/ocorrencias/OcorrenciasPage.tsx` |
| RF-29, RF-38 | Passagem de turno e painel da portaria | `api.turno_resumo` (0023) | `features/portaria/PainelPage.tsx` |
| RF-30, RF-31 | Relatórios (acessos e liberações por exceção) | `api.relatorio_resumo` (0031); CSV em `src/domain/relatorio.ts` | `features/relatorios/RelatoriosPage.tsx` |
| RF-32, RF-37 | Exportação verificável e verificação de integridade da trilha | `api.auditoria_exportar`, `auditoria_cadeia`, `auditoria_alteracoes` (0030; na 0037 a exportação ignora os parâmetros de página e as alterações ganham página numerada); formato em `src/domain/exportacao.ts` e `hashChain.ts`; o selo diário e a âncora ainda não foram migrados | `features/historico/HistoricoPage.tsx`, `features/historico/TrilhaAlteracoes.tsx`; `features/historico/SeloAncora.tsx` (selo pendente) |
| RF-33 | Gestão de usuários do sistema | Edge Function `usuarios-admin` (criar, desativar, reativar, redefinir senha) e `srv.usuario_*` (0018); listagem paginada e totais: `api.usuarios_listar`, `usuarios_resumo` (0038), testados em `supabase/tests/database/12_usuarios.test.sql` (inclui a garantia de síndico ativo); primeiro síndico com o sistema vazio: script `npm run sb:sindico` (`scripts/sindico/`) e `srv.bootstrap_sindico_*` (0034), testados em `supabase/tests/database/10_bootstrap_sindico.test.sql` e `supabase/tests/sindico/` | `features/usuarios/UsuariosPage.tsx`, `features/usuarios/regras.ts`, `features/usuarios/useUsuarios.ts`; e2e `e2e/34-supabase-usuarios.spec.ts` |
| RF-35 | Registro retroativo (contingência) | `api.evento_entrada` e `evento_saida` com `retroativo` e número do formulário de contingência (0023) | `features/portaria/EntradaPage.tsx` (`?retroativo=1`) |
| RF-36 | Prestador com empresa/serviço e áreas comuns | `api.evento_entrada` (empresa e serviço) e `autorizacao_criar` (0023, 0024) | `features/portaria/EntradaPage.tsx` |

RF-21 foi removido em 2026-10-17 (ver `docs/requisitos.md` §14).

Requisitos não funcionais com código próprio:

| RNF | Onde |
|---|---|
| RNF-01 (auditabilidade) | `supabase/migrations/` 0001 e 0016 (triggers de imutabilidade e permissões), cadeia de hash nos triggers `evento_acesso_*` e `canon_*` (0000, 0001), `src/domain/hashChain.ts`; testes em `supabase/tests/database/02_imutabilidade.test.sql` |
| RNF-02 (autenticação) | Edge Functions `auth-entrar` e `auth-trocar-senha`; `supabase/migrations/` 0003, 0018 (sessão, `app.ator`, limite de tentativas) e 0019 (guarda de credencial em `auth.users`); primeiro síndico (0034 e `scripts/sindico/`, com a mesma política de senha de `supabase/functions/_shared/senha.ts`) |
| RNF-03 (anexos cifrados) | `supabase/functions/anexos/index.ts`, `supabase/functions/_shared/anexo.ts` (envelope AES-256-GCM), `supabase/migrations/20261031003300_0033_anexos.sql` (bucket privado, `srv.anexo_*`, append-only); decisões em `docs/anexos.md` |
| RNF-04 (RBAC) | `src/domain/rbac.ts` (fonte), `supabase/migrations/` 0017 (matriz gerada por `scripts/rbac-sql.mjs`) e `app.exigir` nas RPCs; `RequireRole` em `src/auth/AuthContext.tsx` |
| RNF-07 (teclado) | `src/app/Layout.tsx` (F2 entrada, F8 saída, F3 encomenda, F4 ocorrência), `src/features/portaria/EntradaPage.tsx`, `src/features/portaria/SaidaPage.tsx`, `src/components/TowerUnitPicker.tsx` |
| RNF-09 (retenção e LGPD) | estrutura em `supabase/migrations/` 0004 e 0007; as rotinas de retenção e os pedidos do titular ainda não foram migrados |
