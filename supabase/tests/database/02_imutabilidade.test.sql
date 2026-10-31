-- Imutabilidade em duas camadas (desenho §3.2 e §3.4, item 3). Porte de apps/api/test/imutabilidade.test.ts
-- (git show eae0555:apps/api/test/imutabilidade.test.ts), agora com os papéis reais do Supabase:
--   camada 1: GRANTs mínimos do app_rw (0001/0011) -> "permission denied";
--   camada 2: trigger append-only, que vale até para o dono (postgres) -> "append-only".
-- O PGlite da API antiga rodava como superusuário; aqui o postgres não é superusuário e o app_rw é NOLOGIN (SET ROLE).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(30);
-- Só do teste (desfeito no ROLLBACK): o app_rw precisa alcançar as funções do pgTAP, que moram em `extensions`
-- (sem USAGE para PUBLIC no Supabase). Não toca em nada do public.
GRANT USAGE ON SCHEMA extensions TO app_rw;
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT d.objid::regprocedure FROM pg_depend d
            WHERE d.refobjid = (SELECT oid FROM pg_extension WHERE extname = 'pgtap') AND d.classid = 'pg_proc'::regclass
  LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_rw', f); END LOOP;
END $$;

-- ===== Fixtures (como postgres, o dono) ============================================================================
-- Nomes próprios do teste: o seed (F2) já tem a 'Portaria social' e a D-32.
INSERT INTO ponto_acesso (id, nome) VALUES ('00000000-0000-4000-8000-000000000001', 'Portaria do teste');
INSERT INTO unidade (id, bloco, numero) VALUES ('00000000-0000-4000-8000-000000000002', 'Z', '32');
INSERT INTO usuario_sistema (id, nome, login, papel) VALUES
  ('00000000-0000-4000-8000-000000000003', 'Paulo Porteiro', 'paulo', 'porteiro'),
  ('00000000-0000-4000-8000-000000000004', 'Ana Administração', 'ana', 'administracao');
INSERT INTO pessoa (id, nome, categoria, telefone, documento_mascarado, documento_busca) VALUES
  ('00000000-0000-4000-8000-000000000005', 'Joana Moradora', 'morador', '11987654321', '***.820.910-**', repeat('a', 64)),
  ('00000000-0000-4000-8000-000000000006', 'Vítor Visitante', 'visitante', '11987654322', '***.820.911-**', repeat('b', 64));
INSERT INTO evento_acesso (id, tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id,
                           autorizado_por_tipo, autorizado_por_pessoa_id, operador_id, operador_papel)
VALUES ('00000000-0000-4000-8000-000000000007', 'entrada', 'visitante', '00000000-0000-4000-8000-000000000006',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
        'interfone', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'porteiro');
INSERT INTO permanencia (evento_entrada_id, ordem, tipo_visita, prazo_ate, motivo, definido_por_id)
SELECT id, 0, 'visita', ocorrido_em + interval '2 hours', 'entrada', '00000000-0000-4000-8000-000000000003'
  FROM evento_acesso WHERE id = '00000000-0000-4000-8000-000000000007';
INSERT INTO audit_log (usuario_id, usuario_nome, usuario_papel, acao, entidade, registro_id, depois)
VALUES ('00000000-0000-4000-8000-000000000004', 'Ana Administração', 'administracao', 'pessoa.criar', 'pessoa',
        '00000000-0000-4000-8000-000000000006', '{"nome": "Vítor Visitante", "categoria": "visitante"}');
INSERT INTO ocorrencia (id, tipo, descricao, aberta_por_id)
VALUES ('00000000-0000-4000-8000-000000000008', 'dano', 'Portão riscado', '00000000-0000-4000-8000-000000000003');
UPDATE ocorrencia SET status = 'em_andamento' WHERE id = '00000000-0000-4000-8000-000000000008';
INSERT INTO ocorrencia_status_historico (ocorrencia_id, de, para, por_id)
VALUES ('00000000-0000-4000-8000-000000000008', 'aberta', 'em_andamento', '00000000-0000-4000-8000-000000000003');
INSERT INTO retencao_execucao (tipo, quantidade) VALUES ('pessoas', 0);

-- ===== Camada 2: trigger append-only, mesmo para o dono ============================================================
-- Trigger de linha só dispara se houver linha: cada trilha tem um registro acima.
SELECT throws_like('UPDATE evento_acesso SET observacao = ''x''', '%append-only%', 'dono: UPDATE em evento_acesso falha');
SELECT throws_like('DELETE FROM evento_acesso', '%append-only%', 'dono: DELETE em evento_acesso falha');
SELECT throws_like('TRUNCATE evento_acesso CASCADE', '%append-only%', 'dono: TRUNCATE em evento_acesso falha');
SELECT throws_like('UPDATE audit_log SET antes = NULL', '%append-only%', 'dono: UPDATE em audit_log falha');
SELECT throws_like('DELETE FROM audit_log', '%append-only%', 'dono: DELETE em audit_log falha');
SELECT throws_like('UPDATE permanencia SET motivo = motivo', '%append-only%', 'dono: UPDATE em permanencia falha');
SELECT throws_like('DELETE FROM permanencia', '%append-only%', 'dono: DELETE em permanencia falha');
SELECT throws_like('UPDATE ocorrencia_status_historico SET por_id = por_id', '%append-only%', 'dono: UPDATE em ocorrencia_status_historico falha');
SELECT throws_like('DELETE FROM retencao_execucao', '%append-only%', 'dono: DELETE em retencao_execucao falha');
SELECT throws_like('DELETE FROM evento_acesso_cadeia', '%append-only%', 'dono: cabeça da cadeia não pode ser apagada');

-- ===== Camada 1: privilégios do app_rw ==============================================================================
SET LOCAL ROLE app_rw;

-- Controle positivo: a RLS (0016) não tirou do app_rw o que ele tinha; a política dele é USING (true).
SELECT is((SELECT count(*)::int FROM evento_acesso), 1, 'app_rw lê evento_acesso com RLS habilitada');
SELECT lives_ok($$
  INSERT INTO evento_acesso (tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel)
  VALUES ('entrada', 'morador', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'porteiro')
$$, 'app_rw insere evento (o trigger SECURITY DEFINER avança a cadeia)');
SELECT is((SELECT max(seq)::int FROM evento_acesso), 2, 'a cadeia avançou para seq 2');

SELECT throws_like('UPDATE evento_acesso SET observacao = NULL', '%permission denied%', 'app_rw: UPDATE em evento_acesso negado');
SELECT throws_like('DELETE FROM evento_acesso', '%permission denied%', 'app_rw: DELETE em evento_acesso negado');
SELECT throws_like('TRUNCATE evento_acesso', '%permission denied%', 'app_rw: TRUNCATE em evento_acesso negado');
SELECT throws_like('UPDATE audit_log SET antes = NULL', '%permission denied%', 'app_rw: UPDATE em audit_log negado');
SELECT throws_like('DELETE FROM audit_log', '%permission denied%', 'app_rw: DELETE em audit_log negado');
SELECT throws_like('TRUNCATE audit_log', '%permission denied%', 'app_rw: TRUNCATE em audit_log negado');
SELECT throws_like('UPDATE permanencia SET motivo = motivo', '%permission denied%', 'app_rw: UPDATE em permanencia negado');
SELECT throws_like('DELETE FROM permanencia', '%permission denied%', 'app_rw: DELETE em permanencia negado');
SELECT throws_like('UPDATE ocorrencia_status_historico SET por_id = por_id', '%permission denied%', 'app_rw: UPDATE em ocorrencia_status_historico negado');
SELECT throws_like('DELETE FROM ocorrencia_status_historico', '%permission denied%', 'app_rw: DELETE em ocorrencia_status_historico negado');
SELECT throws_like('UPDATE retencao_execucao SET quantidade = 1', '%permission denied%', 'app_rw: UPDATE em retencao_execucao negado');
SELECT throws_like('DELETE FROM retencao_execucao', '%permission denied%', 'app_rw: DELETE em retencao_execucao negado');
SELECT throws_like('INSERT INTO retencao_execucao (tipo, quantidade) VALUES (''eventos'', 0)', '%permission denied%',
  'app_rw: INSERT em retencao_execucao negado (só os procedimentos controlados registram)');

-- O GUC sozinho não abre a exceção: o trigger exige current_user = dono da tabela.
SELECT lives_ok($$SELECT set_config('portaria.operacao', 'retencao_eventos', true)$$, 'app_rw consegue ligar o GUC');
SELECT throws_like('DELETE FROM evento_acesso', '%permission denied%', 'GUC ligado sem ser dono: DELETE continua negado');

-- Funções: o descarte com prazo é chamável (e recusa o que está dentro do prazo); o descarte interno não.
SELECT throws_like('SELECT retencao_descartar_prefixo(1)', '%permission denied%', 'app_rw não chama o descarte interno');
SELECT throws_like('SELECT retencao_descartar_eventos(1)', '%dentro do prazo de retenção%', 'descarte com prazo recusa evento recente');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
