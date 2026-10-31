-- GERADO por `node scripts/rbac-sql.mjs teste` a partir de packages/domain/src/rbac.ts. NÃO editar à mão:
-- o teste src/test/rbac-paridade.test.ts falha se este arquivo divergir do gerado.
-- Matriz RBAC (desenho §3.4, item 2): a tabela do banco é a do TS, e app.exigir() decide igual para cada
-- papel x ação, passando pelo caminho real (claims da JWT -> sessão -> usuário -> papel ATUAL -> rbac_matriz).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(155);

-- Fixtures: um usuário e uma sessão válida por papel.
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  ('00000000-0000-4000-8000-000000000101', 'Teste sindico', 'rbac.sindico', 'sindico', false, '00000000-0000-4000-8000-000000000201', 'u-00000000-0000-4000-8000-000000000301@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-000000000102', 'Teste administracao', 'rbac.administracao', 'administracao', false, '00000000-0000-4000-8000-000000000202', 'u-00000000-0000-4000-8000-000000000302@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-000000000103', 'Teste porteiro', 'rbac.porteiro', 'porteiro', false, '00000000-0000-4000-8000-000000000203', 'u-00000000-0000-4000-8000-000000000303@usuarios.portaria.invalid'),
  ('00000000-0000-4000-8000-000000000104', 'Teste auditor', 'rbac.auditor', 'auditor', false, '00000000-0000-4000-8000-000000000204', 'u-00000000-0000-4000-8000-000000000304@usuarios.portaria.invalid');
INSERT INTO public.sessao (id, usuario_id, auth_session_id, expira_em) VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000502', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000503', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000504', now() + interval '1 hour');

-- Resultado de app.exigir(acao) com a JWT do papel: 'ok' ou o código do erro (JSON da mensagem PGRST).
CREATE FUNCTION pg_temp.exigir_como(p_papel text, p_acao text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n text := CASE p_papel WHEN 'sindico' THEN '1' WHEN 'administracao' THEN '2' WHEN 'porteiro' THEN '3' ELSE '4' END;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated',
    'sub', '00000000-0000-4000-8000-00000000020' || n, 'session_id', '00000000-0000-4000-8000-00000000050' || n)::text, true);
  PERFORM app.exigir(p_acao);
  RETURN 'ok';
EXCEPTION WHEN SQLSTATE 'PGRST' THEN
  RETURN (SQLERRM::jsonb) ->> 'code';
END $$;

SELECT set_eq(
  'SELECT acao FROM public.rbac_acao',
  ARRAY['auditoria.exportar', 'auditoria.selar', 'auditoria.verificar', 'autorizacao.area_comum', 'autorizacao.criar', 'documento.ver', 'encomenda.autorizar_retirada', 'encomenda.operar', 'encomenda.ver', 'evento.corrigir', 'evento.registrar', 'evento.retroativo', 'evento.ver', 'funcionario.gerenciar', 'funcionario.ver', 'importacao.executar', 'lgpd.anonimizar', 'lgpd.exportar', 'lgpd.retencao', 'ocorrencia.operar', 'ocorrencia.ver', 'pessoa.cadastrar_externo', 'pessoa.cadastrar_morador', 'pessoa.desativar', 'pessoa.editar', 'pessoa.ver', 'relatorio.ver', 'restricao.aprovar', 'restricao.criar', 'turno.ver', 'unidade.editar', 'unidade.ver', 'usuario.gerenciar', 'usuario.gerenciar_sindico', 'veiculo.cadastrar', 'vinculo.criar', 'vinculo.decidir', 'vinculo.ver']::text[],
  'rbac_acao tem exatamente as ações de MATRIZ (rbac.ts)');

SELECT set_eq(
  'SELECT acao || '':'' || papel::text FROM public.rbac_matriz',
  ARRAY['auditoria.exportar:sindico', 'auditoria.exportar:administracao', 'auditoria.exportar:auditor', 'auditoria.selar:sindico', 'auditoria.selar:auditor', 'auditoria.verificar:sindico', 'auditoria.verificar:administracao', 'auditoria.verificar:auditor', 'autorizacao.area_comum:sindico', 'autorizacao.area_comum:administracao', 'autorizacao.criar:sindico', 'autorizacao.criar:administracao', 'autorizacao.criar:porteiro', 'documento.ver:sindico', 'documento.ver:administracao', 'encomenda.autorizar_retirada:sindico', 'encomenda.autorizar_retirada:administracao', 'encomenda.autorizar_retirada:porteiro', 'encomenda.operar:sindico', 'encomenda.operar:administracao', 'encomenda.operar:porteiro', 'encomenda.ver:sindico', 'encomenda.ver:administracao', 'encomenda.ver:porteiro', 'encomenda.ver:auditor', 'evento.corrigir:sindico', 'evento.corrigir:administracao', 'evento.registrar:sindico', 'evento.registrar:administracao', 'evento.registrar:porteiro', 'evento.retroativo:sindico', 'evento.retroativo:administracao', 'evento.retroativo:porteiro', 'evento.ver:sindico', 'evento.ver:administracao', 'evento.ver:porteiro', 'evento.ver:auditor', 'funcionario.gerenciar:sindico', 'funcionario.gerenciar:administracao', 'funcionario.ver:sindico', 'funcionario.ver:administracao', 'funcionario.ver:auditor', 'importacao.executar:sindico', 'importacao.executar:administracao', 'lgpd.anonimizar:sindico', 'lgpd.exportar:sindico', 'lgpd.exportar:administracao', 'lgpd.retencao:sindico', 'ocorrencia.operar:sindico', 'ocorrencia.operar:administracao', 'ocorrencia.operar:porteiro', 'ocorrencia.ver:sindico', 'ocorrencia.ver:administracao', 'ocorrencia.ver:porteiro', 'ocorrencia.ver:auditor', 'pessoa.cadastrar_externo:sindico', 'pessoa.cadastrar_externo:administracao', 'pessoa.cadastrar_externo:porteiro', 'pessoa.cadastrar_morador:sindico', 'pessoa.cadastrar_morador:administracao', 'pessoa.desativar:sindico', 'pessoa.desativar:administracao', 'pessoa.editar:sindico', 'pessoa.editar:administracao', 'pessoa.ver:sindico', 'pessoa.ver:administracao', 'pessoa.ver:porteiro', 'pessoa.ver:auditor', 'relatorio.ver:sindico', 'relatorio.ver:administracao', 'relatorio.ver:auditor', 'restricao.aprovar:sindico', 'restricao.criar:sindico', 'restricao.criar:administracao', 'restricao.criar:porteiro', 'turno.ver:sindico', 'turno.ver:administracao', 'turno.ver:porteiro', 'unidade.editar:sindico', 'unidade.editar:administracao', 'unidade.ver:sindico', 'unidade.ver:administracao', 'unidade.ver:porteiro', 'unidade.ver:auditor', 'usuario.gerenciar:sindico', 'usuario.gerenciar:administracao', 'usuario.gerenciar_sindico:sindico', 'veiculo.cadastrar:sindico', 'veiculo.cadastrar:administracao', 'vinculo.criar:sindico', 'vinculo.criar:administracao', 'vinculo.decidir:sindico', 'vinculo.decidir:administracao', 'vinculo.ver:sindico', 'vinculo.ver:administracao', 'vinculo.ver:auditor']::text[],
  'rbac_matriz tem exatamente os pares (ação, papel) de MATRIZ (rbac.ts)');

SELECT is(pg_temp.exigir_como('sindico', 'auditoria.exportar'), 'ok', 'sindico pode auditoria.exportar');
SELECT is(pg_temp.exigir_como('administracao', 'auditoria.exportar'), 'ok', 'administracao pode auditoria.exportar');
SELECT is(pg_temp.exigir_como('porteiro', 'auditoria.exportar'), 'SEM_PERMISSAO', 'porteiro NÃO pode auditoria.exportar');
SELECT is(pg_temp.exigir_como('auditor', 'auditoria.exportar'), 'ok', 'auditor pode auditoria.exportar');
SELECT is(pg_temp.exigir_como('sindico', 'auditoria.selar'), 'ok', 'sindico pode auditoria.selar');
SELECT is(pg_temp.exigir_como('administracao', 'auditoria.selar'), 'SEM_PERMISSAO', 'administracao NÃO pode auditoria.selar');
SELECT is(pg_temp.exigir_como('porteiro', 'auditoria.selar'), 'SEM_PERMISSAO', 'porteiro NÃO pode auditoria.selar');
SELECT is(pg_temp.exigir_como('auditor', 'auditoria.selar'), 'ok', 'auditor pode auditoria.selar');
SELECT is(pg_temp.exigir_como('sindico', 'auditoria.verificar'), 'ok', 'sindico pode auditoria.verificar');
SELECT is(pg_temp.exigir_como('administracao', 'auditoria.verificar'), 'ok', 'administracao pode auditoria.verificar');
SELECT is(pg_temp.exigir_como('porteiro', 'auditoria.verificar'), 'SEM_PERMISSAO', 'porteiro NÃO pode auditoria.verificar');
SELECT is(pg_temp.exigir_como('auditor', 'auditoria.verificar'), 'ok', 'auditor pode auditoria.verificar');
SELECT is(pg_temp.exigir_como('sindico', 'autorizacao.area_comum'), 'ok', 'sindico pode autorizacao.area_comum');
SELECT is(pg_temp.exigir_como('administracao', 'autorizacao.area_comum'), 'ok', 'administracao pode autorizacao.area_comum');
SELECT is(pg_temp.exigir_como('porteiro', 'autorizacao.area_comum'), 'SEM_PERMISSAO', 'porteiro NÃO pode autorizacao.area_comum');
SELECT is(pg_temp.exigir_como('auditor', 'autorizacao.area_comum'), 'SEM_PERMISSAO', 'auditor NÃO pode autorizacao.area_comum');
SELECT is(pg_temp.exigir_como('sindico', 'autorizacao.criar'), 'ok', 'sindico pode autorizacao.criar');
SELECT is(pg_temp.exigir_como('administracao', 'autorizacao.criar'), 'ok', 'administracao pode autorizacao.criar');
SELECT is(pg_temp.exigir_como('porteiro', 'autorizacao.criar'), 'ok', 'porteiro pode autorizacao.criar');
SELECT is(pg_temp.exigir_como('auditor', 'autorizacao.criar'), 'SEM_PERMISSAO', 'auditor NÃO pode autorizacao.criar');
SELECT is(pg_temp.exigir_como('sindico', 'documento.ver'), 'ok', 'sindico pode documento.ver');
SELECT is(pg_temp.exigir_como('administracao', 'documento.ver'), 'ok', 'administracao pode documento.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'documento.ver'), 'SEM_PERMISSAO', 'porteiro NÃO pode documento.ver');
SELECT is(pg_temp.exigir_como('auditor', 'documento.ver'), 'SEM_PERMISSAO', 'auditor NÃO pode documento.ver');
SELECT is(pg_temp.exigir_como('sindico', 'encomenda.autorizar_retirada'), 'ok', 'sindico pode encomenda.autorizar_retirada');
SELECT is(pg_temp.exigir_como('administracao', 'encomenda.autorizar_retirada'), 'ok', 'administracao pode encomenda.autorizar_retirada');
SELECT is(pg_temp.exigir_como('porteiro', 'encomenda.autorizar_retirada'), 'ok', 'porteiro pode encomenda.autorizar_retirada');
SELECT is(pg_temp.exigir_como('auditor', 'encomenda.autorizar_retirada'), 'SEM_PERMISSAO', 'auditor NÃO pode encomenda.autorizar_retirada');
SELECT is(pg_temp.exigir_como('sindico', 'encomenda.operar'), 'ok', 'sindico pode encomenda.operar');
SELECT is(pg_temp.exigir_como('administracao', 'encomenda.operar'), 'ok', 'administracao pode encomenda.operar');
SELECT is(pg_temp.exigir_como('porteiro', 'encomenda.operar'), 'ok', 'porteiro pode encomenda.operar');
SELECT is(pg_temp.exigir_como('auditor', 'encomenda.operar'), 'SEM_PERMISSAO', 'auditor NÃO pode encomenda.operar');
SELECT is(pg_temp.exigir_como('sindico', 'encomenda.ver'), 'ok', 'sindico pode encomenda.ver');
SELECT is(pg_temp.exigir_como('administracao', 'encomenda.ver'), 'ok', 'administracao pode encomenda.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'encomenda.ver'), 'ok', 'porteiro pode encomenda.ver');
SELECT is(pg_temp.exigir_como('auditor', 'encomenda.ver'), 'ok', 'auditor pode encomenda.ver');
SELECT is(pg_temp.exigir_como('sindico', 'evento.corrigir'), 'ok', 'sindico pode evento.corrigir');
SELECT is(pg_temp.exigir_como('administracao', 'evento.corrigir'), 'ok', 'administracao pode evento.corrigir');
SELECT is(pg_temp.exigir_como('porteiro', 'evento.corrigir'), 'SEM_PERMISSAO', 'porteiro NÃO pode evento.corrigir');
SELECT is(pg_temp.exigir_como('auditor', 'evento.corrigir'), 'SEM_PERMISSAO', 'auditor NÃO pode evento.corrigir');
SELECT is(pg_temp.exigir_como('sindico', 'evento.registrar'), 'ok', 'sindico pode evento.registrar');
SELECT is(pg_temp.exigir_como('administracao', 'evento.registrar'), 'ok', 'administracao pode evento.registrar');
SELECT is(pg_temp.exigir_como('porteiro', 'evento.registrar'), 'ok', 'porteiro pode evento.registrar');
SELECT is(pg_temp.exigir_como('auditor', 'evento.registrar'), 'SEM_PERMISSAO', 'auditor NÃO pode evento.registrar');
SELECT is(pg_temp.exigir_como('sindico', 'evento.retroativo'), 'ok', 'sindico pode evento.retroativo');
SELECT is(pg_temp.exigir_como('administracao', 'evento.retroativo'), 'ok', 'administracao pode evento.retroativo');
SELECT is(pg_temp.exigir_como('porteiro', 'evento.retroativo'), 'ok', 'porteiro pode evento.retroativo');
SELECT is(pg_temp.exigir_como('auditor', 'evento.retroativo'), 'SEM_PERMISSAO', 'auditor NÃO pode evento.retroativo');
SELECT is(pg_temp.exigir_como('sindico', 'evento.ver'), 'ok', 'sindico pode evento.ver');
SELECT is(pg_temp.exigir_como('administracao', 'evento.ver'), 'ok', 'administracao pode evento.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'evento.ver'), 'ok', 'porteiro pode evento.ver');
SELECT is(pg_temp.exigir_como('auditor', 'evento.ver'), 'ok', 'auditor pode evento.ver');
SELECT is(pg_temp.exigir_como('sindico', 'funcionario.gerenciar'), 'ok', 'sindico pode funcionario.gerenciar');
SELECT is(pg_temp.exigir_como('administracao', 'funcionario.gerenciar'), 'ok', 'administracao pode funcionario.gerenciar');
SELECT is(pg_temp.exigir_como('porteiro', 'funcionario.gerenciar'), 'SEM_PERMISSAO', 'porteiro NÃO pode funcionario.gerenciar');
SELECT is(pg_temp.exigir_como('auditor', 'funcionario.gerenciar'), 'SEM_PERMISSAO', 'auditor NÃO pode funcionario.gerenciar');
SELECT is(pg_temp.exigir_como('sindico', 'funcionario.ver'), 'ok', 'sindico pode funcionario.ver');
SELECT is(pg_temp.exigir_como('administracao', 'funcionario.ver'), 'ok', 'administracao pode funcionario.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'funcionario.ver'), 'SEM_PERMISSAO', 'porteiro NÃO pode funcionario.ver');
SELECT is(pg_temp.exigir_como('auditor', 'funcionario.ver'), 'ok', 'auditor pode funcionario.ver');
SELECT is(pg_temp.exigir_como('sindico', 'importacao.executar'), 'ok', 'sindico pode importacao.executar');
SELECT is(pg_temp.exigir_como('administracao', 'importacao.executar'), 'ok', 'administracao pode importacao.executar');
SELECT is(pg_temp.exigir_como('porteiro', 'importacao.executar'), 'SEM_PERMISSAO', 'porteiro NÃO pode importacao.executar');
SELECT is(pg_temp.exigir_como('auditor', 'importacao.executar'), 'SEM_PERMISSAO', 'auditor NÃO pode importacao.executar');
SELECT is(pg_temp.exigir_como('sindico', 'lgpd.anonimizar'), 'ok', 'sindico pode lgpd.anonimizar');
SELECT is(pg_temp.exigir_como('administracao', 'lgpd.anonimizar'), 'SEM_PERMISSAO', 'administracao NÃO pode lgpd.anonimizar');
SELECT is(pg_temp.exigir_como('porteiro', 'lgpd.anonimizar'), 'SEM_PERMISSAO', 'porteiro NÃO pode lgpd.anonimizar');
SELECT is(pg_temp.exigir_como('auditor', 'lgpd.anonimizar'), 'SEM_PERMISSAO', 'auditor NÃO pode lgpd.anonimizar');
SELECT is(pg_temp.exigir_como('sindico', 'lgpd.exportar'), 'ok', 'sindico pode lgpd.exportar');
SELECT is(pg_temp.exigir_como('administracao', 'lgpd.exportar'), 'ok', 'administracao pode lgpd.exportar');
SELECT is(pg_temp.exigir_como('porteiro', 'lgpd.exportar'), 'SEM_PERMISSAO', 'porteiro NÃO pode lgpd.exportar');
SELECT is(pg_temp.exigir_como('auditor', 'lgpd.exportar'), 'SEM_PERMISSAO', 'auditor NÃO pode lgpd.exportar');
SELECT is(pg_temp.exigir_como('sindico', 'lgpd.retencao'), 'ok', 'sindico pode lgpd.retencao');
SELECT is(pg_temp.exigir_como('administracao', 'lgpd.retencao'), 'SEM_PERMISSAO', 'administracao NÃO pode lgpd.retencao');
SELECT is(pg_temp.exigir_como('porteiro', 'lgpd.retencao'), 'SEM_PERMISSAO', 'porteiro NÃO pode lgpd.retencao');
SELECT is(pg_temp.exigir_como('auditor', 'lgpd.retencao'), 'SEM_PERMISSAO', 'auditor NÃO pode lgpd.retencao');
SELECT is(pg_temp.exigir_como('sindico', 'ocorrencia.operar'), 'ok', 'sindico pode ocorrencia.operar');
SELECT is(pg_temp.exigir_como('administracao', 'ocorrencia.operar'), 'ok', 'administracao pode ocorrencia.operar');
SELECT is(pg_temp.exigir_como('porteiro', 'ocorrencia.operar'), 'ok', 'porteiro pode ocorrencia.operar');
SELECT is(pg_temp.exigir_como('auditor', 'ocorrencia.operar'), 'SEM_PERMISSAO', 'auditor NÃO pode ocorrencia.operar');
SELECT is(pg_temp.exigir_como('sindico', 'ocorrencia.ver'), 'ok', 'sindico pode ocorrencia.ver');
SELECT is(pg_temp.exigir_como('administracao', 'ocorrencia.ver'), 'ok', 'administracao pode ocorrencia.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'ocorrencia.ver'), 'ok', 'porteiro pode ocorrencia.ver');
SELECT is(pg_temp.exigir_como('auditor', 'ocorrencia.ver'), 'ok', 'auditor pode ocorrencia.ver');
SELECT is(pg_temp.exigir_como('sindico', 'pessoa.cadastrar_externo'), 'ok', 'sindico pode pessoa.cadastrar_externo');
SELECT is(pg_temp.exigir_como('administracao', 'pessoa.cadastrar_externo'), 'ok', 'administracao pode pessoa.cadastrar_externo');
SELECT is(pg_temp.exigir_como('porteiro', 'pessoa.cadastrar_externo'), 'ok', 'porteiro pode pessoa.cadastrar_externo');
SELECT is(pg_temp.exigir_como('auditor', 'pessoa.cadastrar_externo'), 'SEM_PERMISSAO', 'auditor NÃO pode pessoa.cadastrar_externo');
SELECT is(pg_temp.exigir_como('sindico', 'pessoa.cadastrar_morador'), 'ok', 'sindico pode pessoa.cadastrar_morador');
SELECT is(pg_temp.exigir_como('administracao', 'pessoa.cadastrar_morador'), 'ok', 'administracao pode pessoa.cadastrar_morador');
SELECT is(pg_temp.exigir_como('porteiro', 'pessoa.cadastrar_morador'), 'SEM_PERMISSAO', 'porteiro NÃO pode pessoa.cadastrar_morador');
SELECT is(pg_temp.exigir_como('auditor', 'pessoa.cadastrar_morador'), 'SEM_PERMISSAO', 'auditor NÃO pode pessoa.cadastrar_morador');
SELECT is(pg_temp.exigir_como('sindico', 'pessoa.desativar'), 'ok', 'sindico pode pessoa.desativar');
SELECT is(pg_temp.exigir_como('administracao', 'pessoa.desativar'), 'ok', 'administracao pode pessoa.desativar');
SELECT is(pg_temp.exigir_como('porteiro', 'pessoa.desativar'), 'SEM_PERMISSAO', 'porteiro NÃO pode pessoa.desativar');
SELECT is(pg_temp.exigir_como('auditor', 'pessoa.desativar'), 'SEM_PERMISSAO', 'auditor NÃO pode pessoa.desativar');
SELECT is(pg_temp.exigir_como('sindico', 'pessoa.editar'), 'ok', 'sindico pode pessoa.editar');
SELECT is(pg_temp.exigir_como('administracao', 'pessoa.editar'), 'ok', 'administracao pode pessoa.editar');
SELECT is(pg_temp.exigir_como('porteiro', 'pessoa.editar'), 'SEM_PERMISSAO', 'porteiro NÃO pode pessoa.editar');
SELECT is(pg_temp.exigir_como('auditor', 'pessoa.editar'), 'SEM_PERMISSAO', 'auditor NÃO pode pessoa.editar');
SELECT is(pg_temp.exigir_como('sindico', 'pessoa.ver'), 'ok', 'sindico pode pessoa.ver');
SELECT is(pg_temp.exigir_como('administracao', 'pessoa.ver'), 'ok', 'administracao pode pessoa.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'pessoa.ver'), 'ok', 'porteiro pode pessoa.ver');
SELECT is(pg_temp.exigir_como('auditor', 'pessoa.ver'), 'ok', 'auditor pode pessoa.ver');
SELECT is(pg_temp.exigir_como('sindico', 'relatorio.ver'), 'ok', 'sindico pode relatorio.ver');
SELECT is(pg_temp.exigir_como('administracao', 'relatorio.ver'), 'ok', 'administracao pode relatorio.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'relatorio.ver'), 'SEM_PERMISSAO', 'porteiro NÃO pode relatorio.ver');
SELECT is(pg_temp.exigir_como('auditor', 'relatorio.ver'), 'ok', 'auditor pode relatorio.ver');
SELECT is(pg_temp.exigir_como('sindico', 'restricao.aprovar'), 'ok', 'sindico pode restricao.aprovar');
SELECT is(pg_temp.exigir_como('administracao', 'restricao.aprovar'), 'SEM_PERMISSAO', 'administracao NÃO pode restricao.aprovar');
SELECT is(pg_temp.exigir_como('porteiro', 'restricao.aprovar'), 'SEM_PERMISSAO', 'porteiro NÃO pode restricao.aprovar');
SELECT is(pg_temp.exigir_como('auditor', 'restricao.aprovar'), 'SEM_PERMISSAO', 'auditor NÃO pode restricao.aprovar');
SELECT is(pg_temp.exigir_como('sindico', 'restricao.criar'), 'ok', 'sindico pode restricao.criar');
SELECT is(pg_temp.exigir_como('administracao', 'restricao.criar'), 'ok', 'administracao pode restricao.criar');
SELECT is(pg_temp.exigir_como('porteiro', 'restricao.criar'), 'ok', 'porteiro pode restricao.criar');
SELECT is(pg_temp.exigir_como('auditor', 'restricao.criar'), 'SEM_PERMISSAO', 'auditor NÃO pode restricao.criar');
SELECT is(pg_temp.exigir_como('sindico', 'turno.ver'), 'ok', 'sindico pode turno.ver');
SELECT is(pg_temp.exigir_como('administracao', 'turno.ver'), 'ok', 'administracao pode turno.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'turno.ver'), 'ok', 'porteiro pode turno.ver');
SELECT is(pg_temp.exigir_como('auditor', 'turno.ver'), 'SEM_PERMISSAO', 'auditor NÃO pode turno.ver');
SELECT is(pg_temp.exigir_como('sindico', 'unidade.editar'), 'ok', 'sindico pode unidade.editar');
SELECT is(pg_temp.exigir_como('administracao', 'unidade.editar'), 'ok', 'administracao pode unidade.editar');
SELECT is(pg_temp.exigir_como('porteiro', 'unidade.editar'), 'SEM_PERMISSAO', 'porteiro NÃO pode unidade.editar');
SELECT is(pg_temp.exigir_como('auditor', 'unidade.editar'), 'SEM_PERMISSAO', 'auditor NÃO pode unidade.editar');
SELECT is(pg_temp.exigir_como('sindico', 'unidade.ver'), 'ok', 'sindico pode unidade.ver');
SELECT is(pg_temp.exigir_como('administracao', 'unidade.ver'), 'ok', 'administracao pode unidade.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'unidade.ver'), 'ok', 'porteiro pode unidade.ver');
SELECT is(pg_temp.exigir_como('auditor', 'unidade.ver'), 'ok', 'auditor pode unidade.ver');
SELECT is(pg_temp.exigir_como('sindico', 'usuario.gerenciar'), 'ok', 'sindico pode usuario.gerenciar');
SELECT is(pg_temp.exigir_como('administracao', 'usuario.gerenciar'), 'ok', 'administracao pode usuario.gerenciar');
SELECT is(pg_temp.exigir_como('porteiro', 'usuario.gerenciar'), 'SEM_PERMISSAO', 'porteiro NÃO pode usuario.gerenciar');
SELECT is(pg_temp.exigir_como('auditor', 'usuario.gerenciar'), 'SEM_PERMISSAO', 'auditor NÃO pode usuario.gerenciar');
SELECT is(pg_temp.exigir_como('sindico', 'usuario.gerenciar_sindico'), 'ok', 'sindico pode usuario.gerenciar_sindico');
SELECT is(pg_temp.exigir_como('administracao', 'usuario.gerenciar_sindico'), 'SEM_PERMISSAO', 'administracao NÃO pode usuario.gerenciar_sindico');
SELECT is(pg_temp.exigir_como('porteiro', 'usuario.gerenciar_sindico'), 'SEM_PERMISSAO', 'porteiro NÃO pode usuario.gerenciar_sindico');
SELECT is(pg_temp.exigir_como('auditor', 'usuario.gerenciar_sindico'), 'SEM_PERMISSAO', 'auditor NÃO pode usuario.gerenciar_sindico');
SELECT is(pg_temp.exigir_como('sindico', 'veiculo.cadastrar'), 'ok', 'sindico pode veiculo.cadastrar');
SELECT is(pg_temp.exigir_como('administracao', 'veiculo.cadastrar'), 'ok', 'administracao pode veiculo.cadastrar');
SELECT is(pg_temp.exigir_como('porteiro', 'veiculo.cadastrar'), 'SEM_PERMISSAO', 'porteiro NÃO pode veiculo.cadastrar');
SELECT is(pg_temp.exigir_como('auditor', 'veiculo.cadastrar'), 'SEM_PERMISSAO', 'auditor NÃO pode veiculo.cadastrar');
SELECT is(pg_temp.exigir_como('sindico', 'vinculo.criar'), 'ok', 'sindico pode vinculo.criar');
SELECT is(pg_temp.exigir_como('administracao', 'vinculo.criar'), 'ok', 'administracao pode vinculo.criar');
SELECT is(pg_temp.exigir_como('porteiro', 'vinculo.criar'), 'SEM_PERMISSAO', 'porteiro NÃO pode vinculo.criar');
SELECT is(pg_temp.exigir_como('auditor', 'vinculo.criar'), 'SEM_PERMISSAO', 'auditor NÃO pode vinculo.criar');
SELECT is(pg_temp.exigir_como('sindico', 'vinculo.decidir'), 'ok', 'sindico pode vinculo.decidir');
SELECT is(pg_temp.exigir_como('administracao', 'vinculo.decidir'), 'ok', 'administracao pode vinculo.decidir');
SELECT is(pg_temp.exigir_como('porteiro', 'vinculo.decidir'), 'SEM_PERMISSAO', 'porteiro NÃO pode vinculo.decidir');
SELECT is(pg_temp.exigir_como('auditor', 'vinculo.decidir'), 'SEM_PERMISSAO', 'auditor NÃO pode vinculo.decidir');
SELECT is(pg_temp.exigir_como('sindico', 'vinculo.ver'), 'ok', 'sindico pode vinculo.ver');
SELECT is(pg_temp.exigir_como('administracao', 'vinculo.ver'), 'ok', 'administracao pode vinculo.ver');
SELECT is(pg_temp.exigir_como('porteiro', 'vinculo.ver'), 'SEM_PERMISSAO', 'porteiro NÃO pode vinculo.ver');
SELECT is(pg_temp.exigir_como('auditor', 'vinculo.ver'), 'ok', 'auditor pode vinculo.ver');

SELECT throws_ok($$SELECT app.pode('sindico', 'acao.inexistente')$$, 'P0001', NULL,
  'ação fora da matriz é erro de programação (falha fechada), não "permitido"');

SELECT * FROM finish();
ROLLBACK;
