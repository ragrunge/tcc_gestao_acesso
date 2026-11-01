-- Paginação numerada e totalizadores (0037). Mesmo harness do 08 (SET ROLE authenticated + request.jwt.claims).
-- O que se prova: teto e validação dos parâmetros, RBAC antes da validação, `total` igual ao percurso inteiro das páginas
-- (sem linha repetida nem faltando), desempate por id em chave de ordem empatada, o caminho por cursor e o por
-- deslocamento devolvendo a mesma sequência (os filtros da trilha estão nos dois), `ateSeq` segurando a página contra
-- evento novo, a exportação ignorando os parâmetros de página e os resumos batendo com o `total` das listagens.
-- Fixtures próprias (bloco W9). O banco pode ter dados do seed: as contagens globais são comparadas entre si, nunca com
-- número fixo. Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(65);

-- ===== Fixtures: usuários e sessões ================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_ad', 'u_po', 'u_au', 'a_si', 'a_ad', 'a_po', 'a_au',
  'un1', 'un2', 'un3', 'un4', 'un5', 'm1', 'm2', 'm3', 'm4', 'm5', 'e1', 'e2', 'e6']);
-- Três prestadores com o MESMO nome, inseridos fora da ordem de id: só o desempate por id dá ordem estável.
INSERT INTO ids (k, v) VALUES ('zf', 'f0000000-0000-4000-8000-0000000000a1'), ('z0', '00000000-0000-4000-8000-0000000000a2'),
  ('z8', '80000000-0000-4000-8000-0000000000a3');
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.ponto_acesso (nome) VALUES ('Portaria social') ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'Sara Síndica', 't11.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'Ada Admin', 't11.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Pedro Porteiro', 't11.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_au'), 'Alice Auditora', 't11.auditora', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('ad', pg_temp.id('a_ad')), ('po', pg_temp.id('a_po')), ('au', pg_temp.id('a_au'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;

-- ===== Harness (o mesmo do 08) =====================================================================================
CREATE FUNCTION pg_temp.como(p_k text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text; c text;
BEGIN
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text INTO c FROM sess WHERE k = p_k;
  PERFORM set_config('request.jwt.claims', coalesce(c, ''), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql;
    r := 'ok';
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := (SQLERRM::jsonb) ->> 'code';
    WHEN OTHERS THEN r := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.val(p_k text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; c text;
BEGIN
  SELECT jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text INTO c FROM sess WHERE k = p_k;
  PERFORM set_config('request.jwt.claims', c, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE 'SELECT to_jsonb((' || p_sql || '))' INTO r;
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN r := jsonb_build_object('erro', (SQLERRM::jsonb) ->> 'code');
    WHEN OTHERS THEN r := jsonb_build_object('erro', SQLSTATE, 'msg', SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
-- Uma chamada `fn(p)` como o papel `p_k`.
CREATE FUNCTION pg_temp.rpc(p_k text, p_fn text, p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.val(p_k, format('%s(%L::jsonb)', p_fn, p::text)) $$;
CREATE FUNCTION pg_temp.erro(p_k text, p_fn text, p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como(p_k, format('SELECT %s(%L::jsonb)', p_fn, p::text)) $$;
CREATE FUNCTION pg_temp.total(p_k text, p_fn text, p jsonb DEFAULT '{}') RETURNS bigint LANGUAGE sql AS $$
  SELECT (pg_temp.rpc(p_k, p_fn, p) ->> 'total')::bigint $$;

-- Percorre todas as páginas por deslocamento (com o ateSeq da primeira, nas trilhas) e devolve os ids na ordem.
CREATE FUNCTION pg_temp.por_deslocamento(p_k text, p_fn text, p jsonb, p_lim integer) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE r jsonb; d integer := 0; ate jsonb; acc uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR volta IN 1..1000 LOOP
    r := pg_temp.rpc(p_k, p_fn, p || jsonb_build_object('limite', p_lim, 'deslocamento', d)
                                  || CASE WHEN ate IS NOT NULL THEN jsonb_build_object('ateSeq', ate) ELSE '{}' END);
    IF r ? 'erro' THEN RAISE EXCEPTION 'erro na página: %', r; END IF;
    ate := coalesce(ate, r -> 'ateSeq');
    acc := acc || ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(r -> 'itens') x);
    EXIT WHEN NOT (r ->> 'temMais')::boolean;
    d := d + p_lim;
  END LOOP;
  RETURN acc;
END $$;
-- O mesmo percurso pelo cursor (o contrato antigo).
CREATE FUNCTION pg_temp.por_cursor(p_k text, p_fn text, p jsonb, p_lim integer) RETURNS uuid[] LANGUAGE plpgsql AS $$
DECLARE r jsonb; cur text; acc uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR volta IN 1..1000 LOOP
    r := pg_temp.rpc(p_k, p_fn, p || jsonb_build_object('limite', p_lim) || CASE WHEN cur IS NOT NULL THEN jsonb_build_object('cursor', cur) ELSE '{}' END);
    IF r ? 'erro' THEN RAISE EXCEPTION 'erro na página: %', r; END IF;
    acc := acc || ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(r -> 'itens') x);
    EXIT WHEN NOT (r ->> 'temMais')::boolean;
    cur := r ->> 'cursor';
  END LOOP;
  RETURN acc;
END $$;
CREATE FUNCTION pg_temp.sem_repetir(a uuid[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT cardinality(a) = (SELECT count(DISTINCT x) FROM unnest(a) x) $$;
CREATE TEMP TABLE guardado (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.g(p text) RETURNS jsonb LANGUAGE sql AS $$ SELECT v FROM guardado WHERE k = p $$;
CREATE TEMP TABLE percurso (k text PRIMARY KEY, v uuid[]) ON COMMIT DROP;
CREATE FUNCTION pg_temp.p(p text) RETURNS uuid[] LANGUAGE sql AS $$ SELECT v FROM percurso WHERE k = p $$;

-- Resumo das unidades ANTES das fixtures (o seed pode ter unidades e vínculos: compara-se a diferença).
INSERT INTO guardado SELECT 'ur0', pg_temp.val('si', 'api.unidades_resumo()');

-- ===== Fixtures: unidades, pessoas, vínculos, encomendas, ocorrências, eventos, trilha ==============================
INSERT INTO public.unidade (id, bloco, numero, ativo) VALUES (pg_temp.id('un1'), 'W9', '11', true), (pg_temp.id('un2'), 'W9', '12', true),
  (pg_temp.id('un3'), 'W9', '13', true), (pg_temp.id('un4'), 'W9', '14', true), (pg_temp.id('un5'), 'W9', '15', false);
INSERT INTO public.pessoa (id, nome, categoria, telefone, sem_cpf) VALUES
  (pg_temp.id('m1'), 'Moradora Paginacao Um', 'morador', '11966660001', true),
  (pg_temp.id('m2'), 'Inquilino Paginacao Dois', 'morador', '11966660002', true),
  (pg_temp.id('m3'), 'Legado Paginacao Tres', 'morador', '11966660003', true),
  (pg_temp.id('m4'), 'Legado Vencido Paginacao', 'morador', '11966660004', true),
  (pg_temp.id('m5'), 'Pendente Paginacao Cinco', 'morador', '11966660005', true);
INSERT INTO public.pessoa (id, nome, categoria, telefone, sem_cpf, empresa)
SELECT pg_temp.id(k), 'Zeca Igual Paginacao', 'prestador', '11966660009', true, 'Empresa Teste' FROM unnest(ARRAY['zf', 'z0', 'z8']) k;
-- un1: proprietária aprovada + pendente; un2: inquilino aprovado (alugada); un3: legado no prazo; un4: só legado vencido
-- (não ocupa); un5: desativada.
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, vigencia_inicio, vigencia_fim, registrado_por_id) VALUES
  (pg_temp.id('m1'), pg_temp.id('un1'), 'proprietario', 'pendente', current_date - 30, NULL, pg_temp.id('u_ad')),
  (pg_temp.id('m2'), pg_temp.id('un2'), 'inquilino', 'pendente', current_date - 30, current_date + 300, pg_temp.id('u_ad')),
  (pg_temp.id('m5'), pg_temp.id('un1'), 'dependente', 'pendente', NULL, NULL, pg_temp.id('u_ad'));
UPDATE public.vinculo_unidade SET status = 'aprovado', conferencia_tipo_documento = 'escritura', conferencia_data = current_date - 2,
       conferido_por_id = pg_temp.id('u_ad'), decidido_por_id = pg_temp.id('u_ad'), decidido_em = now() - interval '1 day'
 WHERE pessoa_id IN (pg_temp.id('m1'), pg_temp.id('m2'));
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, prazo_regularizacao, registrado_por_id) VALUES
  (pg_temp.id('m3'), pg_temp.id('un3'), 'proprietario', 'legado', current_date + 60, pg_temp.id('u_ad')),
  (pg_temp.id('m4'), pg_temp.id('un4'), 'proprietario', 'legado', current_date - 1, pg_temp.id('u_ad'));
INSERT INTO guardado SELECT 'ur1', pg_temp.val('si', 'api.unidades_resumo()');

-- Encomendas e ocorrências da un1 com o mesmo instante (now() é fixo na transação): a ordem sai do desempate por id.
INSERT INTO public.encomenda (unidade_id, destinatario, unidade_confirmada, recebida_por_id)
SELECT pg_temp.id('un1'), 'Destinatario ' || i, true, pg_temp.id('u_po') FROM generate_series(1, 3) i;
INSERT INTO public.ocorrencia (tipo, descricao, unidade_id, aberta_por_id)
SELECT 'outro', 'Ocorrencia de paginacao ' || i, pg_temp.id('un1'), pg_temp.id('u_po') FROM generate_series(1, 3) i;
UPDATE public.ocorrencia SET status = 'em_andamento' WHERE descricao = 'Ocorrencia de paginacao 3' AND unidade_id = pg_temp.id('un1');

-- Trilha da un1: 5 entradas e 2 saídas da m1, mais uma entrada registrada na un2 e corrigida para a un1 (vale o efetivo).
INSERT INTO public.evento_acesso (id, tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel, autorizado_por_tipo, justificativa)
SELECT CASE i WHEN 1 THEN pg_temp.id('e1') WHEN 2 THEN pg_temp.id('e2') ELSE gen_random_uuid() END, 'entrada', 'morador', pg_temp.id('m1'),
       pg_temp.id('un1'), (SELECT id FROM public.ponto_acesso ORDER BY nome LIMIT 1), pg_temp.id('u_po'), 'porteiro', 'excecao_porteiro', 'Fixture de paginacao'
  FROM generate_series(1, 5) i ORDER BY i;
INSERT INTO public.evento_acesso (tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel, refere_evento_id)
SELECT 'saida', 'morador', pg_temp.id('m1'), pg_temp.id('un1'), (SELECT id FROM public.ponto_acesso ORDER BY nome LIMIT 1), pg_temp.id('u_po'), 'porteiro', pg_temp.id(k)
  FROM unnest(ARRAY['e1', 'e2']) k;
INSERT INTO public.evento_acesso (id, tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel, autorizado_por_tipo, justificativa)
VALUES (pg_temp.id('e6'), 'entrada', 'morador', pg_temp.id('m2'), pg_temp.id('un2'), (SELECT id FROM public.ponto_acesso ORDER BY nome LIMIT 1), pg_temp.id('u_po'), 'porteiro', 'excecao_porteiro', 'Fixture de paginacao');
INSERT INTO public.evento_acesso (tipo, categoria_pessoa, pessoa_id, ponto_acesso_id, operador_id, operador_papel, corrige_evento_id, correcao_valores, justificativa)
VALUES ('correcao', 'morador', pg_temp.id('m2'), (SELECT id FROM public.ponto_acesso ORDER BY nome LIMIT 1), pg_temp.id('u_ad'), 'administracao',
        pg_temp.id('e6'), jsonb_build_object('unidade_destino_id', pg_temp.id('un1')::text), 'Unidade digitada errada no registro');

INSERT INTO public.audit_log (usuario_id, usuario_nome, usuario_papel, acao, entidade, registro_id)
SELECT pg_temp.id('u_ad'), 'Ada Admin', 'administracao', 'paginacao.teste', 'pessoa', pg_temp.id('m1') FROM generate_series(1, 5);

-- ===== Contrato: teto e validação (RBAC primeiro) ===================================================================
SELECT ok(has_function_privilege('authenticated', 'api.pessoas_resumo()', 'EXECUTE') AND has_function_privilege('authenticated', 'api.vinculos_resumo()', 'EXECUTE')
      AND has_function_privilege('authenticated', 'api.unidades_resumo()', 'EXECUTE') AND has_function_privilege('authenticated', 'api.ocorrencias_resumo()', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'api.pessoas_resumo()', 'EXECUTE') AND NOT has_function_privilege('anon', 'api.vinculos_resumo()', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'api.unidades_resumo()', 'EXECUTE') AND NOT has_function_privilege('anon', 'api.ocorrencias_resumo()', 'EXECUTE'),
  'resumos: EXECUTE só para authenticated');
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'api'::regnamespace
            AND proname IN ('pessoas_listar', 'vinculos_listar', 'encomendas_listar', 'ocorrencias_listar', 'eventos_listar', 'auditoria_alteracoes', 'auditoria_exportar')),
  7, 'nenhuma listagem ganhou segunda assinatura (CREATE OR REPLACE na mesma)');
SELECT is(pg_temp.erro('si', 'api.pessoas_listar', '{"limite": 101}'), 'VALIDACAO', 'teto de 100 por página');
SELECT is(pg_temp.erro('si', 'api.pessoas_listar', '{"limite": 100}'), 'ok', '100 por página é aceito');
SELECT is(pg_temp.erro('si', 'api.eventos_listar', '{"limite": 101}'), 'VALIDACAO', 'teto de 100 também na trilha');
SELECT is(pg_temp.erro('si', 'api.encomendas_listar', '{"deslocamento": 100001}'), 'VALIDACAO', 'deslocamento acima do teto');
SELECT is(pg_temp.erro('si', 'api.ocorrencias_listar', '{"deslocamento": -1}'), 'VALIDACAO', 'deslocamento negativo');
SELECT is(pg_temp.erro('si', 'api.pessoas_listar', '{"deslocamento": "10"}'), 'VALIDACAO', 'deslocamento em texto');
SELECT is(pg_temp.erro('si', 'api.vinculos_listar', jsonb_build_object('deslocamento', 0, 'cursor', gen_random_uuid())), 'VALIDACAO', 'cursor e deslocamento juntos');
SELECT is(pg_temp.erro('si', 'api.eventos_listar', '{"cursor": "5", "ateSeq": 10}'), 'VALIDACAO', 'cursor e ateSeq juntos');
SELECT is(pg_temp.erro('po', 'api.vinculos_listar', '{"deslocamento": -5}'), 'SEM_PERMISSAO', 'RBAC antes da validação: porteiro não lista vínculos');
SELECT is(pg_temp.como('po', 'SELECT api.vinculos_resumo()'), 'SEM_PERMISSAO', 'porteiro não vê o resumo de vínculos');
SELECT is(pg_temp.erro('po', 'api.auditoria_alteracoes', '{"deslocamento": 0}'), 'SEM_PERMISSAO', 'porteiro não lista a trilha de alterações');
SELECT is(pg_temp.como('au', 'SELECT api.vinculos_resumo()'), 'ok', 'auditor vê o resumo de vínculos (vinculo.ver)');
SELECT is(pg_temp.como('po', 'SELECT api.pessoas_resumo()') || pg_temp.como('po', 'SELECT api.unidades_resumo()') || pg_temp.como('po', 'SELECT api.ocorrencias_resumo()'),
  'okokok', 'porteiro vê os resumos de pessoas, unidades e ocorrências');

-- ===== Pessoas ======================================================================================================
SELECT is(pg_temp.total('po', 'api.pessoas_listar', '{"categoria": "prestador"}'),
  (SELECT count(*) FROM public.pessoa WHERE categoria = 'prestador' AND desativada_em IS NULL), 'total = linhas do filtro (prestadores ativos)');
SELECT is(pg_temp.total('po', 'api.pessoas_listar', '{"incluirDesativadas": true}'), (SELECT count(*) FROM public.pessoa), 'total com desativadas');
INSERT INTO percurso VALUES ('pd', pg_temp.por_deslocamento('po', 'api.pessoas_listar', '{"categoria": "prestador"}', 2)),
                            ('pc', pg_temp.por_cursor('po', 'api.pessoas_listar', '{"categoria": "prestador"}', 2));
SELECT ok(pg_temp.sem_repetir(pg_temp.p('pd')) AND cardinality(pg_temp.p('pd')) = pg_temp.total('po', 'api.pessoas_listar', '{"categoria": "prestador"}'),
  'pessoas: o percurso por deslocamento cobre o total, sem repetir');
SELECT is(pg_temp.p('pc'), pg_temp.p('pd'), 'pessoas: cursor e deslocamento dão a mesma sequência');
SELECT is(ARRAY(SELECT x FROM unnest(pg_temp.p('pd')) x WHERE x IN (pg_temp.id('zf'), pg_temp.id('z0'), pg_temp.id('z8')) ORDER BY array_position(pg_temp.p('pd'), x)),
  ARRAY[pg_temp.id('z0'), pg_temp.id('z8'), pg_temp.id('zf')], 'nome empatado: desempate por id');
SELECT is(ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(pg_temp.rpc('po', 'api.pessoas_listar',
            jsonb_build_object('categoria', 'prestador', 'limite', 1, 'deslocamento', array_position(pg_temp.p('pd'), pg_temp.id('z8')) - 1)) -> 'itens') x),
  ARRAY[pg_temp.id('z8')], 'página de 1 no meio do empate traz exatamente o do meio');
SELECT is(pg_temp.rpc('po', 'api.pessoas_listar', jsonb_build_object('deslocamento', 100000)) -> 'itens', '[]'::jsonb, 'página além do fim: vazia');
SELECT is((pg_temp.rpc('po', 'api.pessoas_listar', jsonb_build_object('deslocamento', 100000)) ->> 'total')::bigint,
  pg_temp.total('po', 'api.pessoas_listar'), 'página além do fim: o total continua certo (o front corrige a página)');
INSERT INTO guardado SELECT 'pr', pg_temp.val('po', 'api.pessoas_resumo()');
SELECT is((pg_temp.g('pr') ->> 'ativas')::bigint, pg_temp.total('po', 'api.pessoas_listar'), 'resumo: ativas = total da lista');
SELECT is((pg_temp.g('pr') -> 'porCategoria' ->> 'prestador')::bigint, pg_temp.total('po', 'api.pessoas_listar', '{"categoria": "prestador"}'),
  'resumo: prestadores = total da lista filtrada');
SELECT is((pg_temp.g('pr') -> 'porCategoria' ->> 'morador')::bigint, pg_temp.total('po', 'api.pessoas_listar', '{"categoria": "morador"}'),
  'resumo: moradores = total da lista filtrada');
SELECT is((pg_temp.g('pr') ->> 'ativas')::bigint + (pg_temp.g('pr') ->> 'desativadas')::bigint,
  pg_temp.total('po', 'api.pessoas_listar', '{"incluirDesativadas": true}'), 'resumo: ativas + desativadas = lista com desativadas');

-- ===== Vínculos =====================================================================================================
SELECT is(pg_temp.total('si', 'api.vinculos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'))), 2::bigint, 'vínculos: total da unidade');
INSERT INTO percurso VALUES
  ('vdd', pg_temp.por_deslocamento('si', 'api.vinculos_listar', '{"status": ["aprovado", "rejeitado", "encerrado"], "ordem": "decisao"}', 2)),
  ('vdc', pg_temp.por_cursor('si', 'api.vinculos_listar', '{"status": ["aprovado", "rejeitado", "encerrado"], "ordem": "decisao"}', 2)),
  ('vpd', pg_temp.por_deslocamento('si', 'api.vinculos_listar', '{"status": ["legado"], "ordem": "prazo"}', 2)),
  ('vpc', pg_temp.por_cursor('si', 'api.vinculos_listar', '{"status": ["legado"], "ordem": "prazo"}', 2));
SELECT ok(pg_temp.p('vdd') = pg_temp.p('vdc') AND pg_temp.sem_repetir(pg_temp.p('vdd'))
      AND cardinality(pg_temp.p('vdd')) = pg_temp.total('si', 'api.vinculos_listar', '{"status": ["aprovado", "rejeitado", "encerrado"]}'),
  'vínculos decididos (ordem decisão): mesma sequência nos dois caminhos e cobre o total');
SELECT ok(pg_temp.p('vpd') = pg_temp.p('vpc') AND pg_temp.sem_repetir(pg_temp.p('vpd'))
      AND cardinality(pg_temp.p('vpd')) = pg_temp.total('si', 'api.vinculos_listar', '{"status": ["legado"]}'),
  'vínculos legados (ordem prazo): mesma sequência nos dois caminhos e cobre o total');
INSERT INTO guardado SELECT 'vr', pg_temp.val('au', 'api.vinculos_resumo()');
SELECT is((pg_temp.g('vr') -> 'porStatus' ->> 'pendente')::bigint, pg_temp.total('si', 'api.vinculos_listar', '{"status": ["pendente"]}'), 'resumo: pendentes = total da fila');
SELECT is((pg_temp.g('vr') -> 'porStatus' ->> 'legado')::bigint, pg_temp.total('si', 'api.vinculos_listar', '{"status": ["legado"]}'), 'resumo: legados = total da fila');
SELECT is((pg_temp.g('vr') -> 'porStatus' ->> 'aprovado')::bigint, pg_temp.total('si', 'api.vinculos_listar', '{"status": ["aprovado"]}'), 'resumo: aprovados = total da lista');
SELECT is((pg_temp.g('vr') ->> 'legadosVencidos')::bigint,
  (SELECT count(*) FROM unnest(pg_temp.p('vpd')) x(id) JOIN public.vinculo_unidade v ON v.id = x.id
    WHERE v.prazo_regularizacao < app.dia_brt(now())),
  'resumo: legados vencidos = os vencidos da fila de legados inteira');
SELECT ok((pg_temp.g('vr') ->> 'legadosVencidos')::int >= 1 AND (pg_temp.g('vr') -> 'validosPorTipo' ->> 'inquilino')::int >= 1,
  'resumo: a fixture entra (um legado vencido, um inquilino válido)');

-- ===== Unidades (diferença antes/depois das fixtures W9) ============================================================
SELECT is((pg_temp.g('ur1') ->> 'ocupadas')::int - (pg_temp.g('ur0') ->> 'ocupadas')::int, 3, 'ocupadas: aprovado, inquilino e legado no prazo');
SELECT is((pg_temp.g('ur1') ->> 'alugadas')::int - (pg_temp.g('ur0') ->> 'alugadas')::int, 1, 'alugadas: só a do inquilino');
SELECT is((pg_temp.g('ur1') ->> 'vazias')::int - (pg_temp.g('ur0') ->> 'vazias')::int, 1, 'vazias: a de legado vencido conta como vazia');
SELECT is((pg_temp.g('ur1') ->> 'inativas')::int - (pg_temp.g('ur0') ->> 'inativas')::int, 1, 'inativas: a desativada');
SELECT is((pg_temp.g('ur1') ->> 'cadastroCompleto')::int - (pg_temp.g('ur0') ->> 'cadastroCompleto')::int, 2, 'cadastro completo: só com aprovado válido');

-- ===== Encomendas ===================================================================================================
INSERT INTO percurso VALUES
  ('ed', pg_temp.por_deslocamento('po', 'api.encomendas_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'status', 'aguardando'), 1)),
  ('ec', pg_temp.por_cursor('po', 'api.encomendas_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'status', 'aguardando'), 1));
SELECT is(cardinality(pg_temp.p('ed')), 3, 'encomendas: percurso de 1 em 1 traz as 3');
SELECT is(pg_temp.p('ed'), ARRAY(SELECT x FROM unnest(pg_temp.p('ed')) x ORDER BY x DESC), 'encomendas no mesmo instante: desempate por id (decrescente)');
SELECT is(pg_temp.p('ec'), pg_temp.p('ed'), 'encomendas: cursor e deslocamento dão a mesma sequência');
INSERT INTO guardado SELECT 'er', pg_temp.val('po', 'api.encomendas_resumo(7)');
SELECT is((pg_temp.g('er') ->> 'aguardando')::bigint, pg_temp.total('po', 'api.encomendas_listar', '{"status": "aguardando"}'), 'resumo: aguardando = total da aba');
SELECT is((pg_temp.g('er') ->> 'entregues')::bigint, pg_temp.total('po', 'api.encomendas_listar', '{"status": "entregue"}'), 'resumo: entregues = total da aba');
SELECT is((pg_temp.g('er') ->> 'atrasadas')::bigint, pg_temp.total('po', 'api.encomendas_listar', '{"atrasadasDias": 7}'), 'resumo: atrasadas = total do filtro');

-- ===== Ocorrências ==================================================================================================
SELECT is(pg_temp.total('po', 'api.ocorrencias_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'status', '["aberta"]'::jsonb)), 2::bigint,
  'ocorrências: total respeita o filtro de status');
SELECT is(pg_temp.por_cursor('po', 'api.ocorrencias_listar', jsonb_build_object('unidadeId', pg_temp.id('un1')), 1),
  pg_temp.por_deslocamento('po', 'api.ocorrencias_listar', jsonb_build_object('unidadeId', pg_temp.id('un1')), 1), 'ocorrências: cursor e deslocamento dão a mesma sequência');
INSERT INTO guardado SELECT 'or', pg_temp.val('po', 'api.ocorrencias_resumo()');
SELECT is((pg_temp.g('or') ->> 'aberta')::bigint, pg_temp.total('po', 'api.ocorrencias_listar', '{"status": ["aberta"]}'), 'resumo: abertas = total do filtro');
SELECT is((pg_temp.g('or') ->> 'emAndamento')::bigint, pg_temp.total('po', 'api.ocorrencias_listar', '{"status": ["em_andamento"]}'), 'resumo: em andamento = total do filtro');
SELECT is((pg_temp.g('or') ->> 'total')::bigint, pg_temp.total('po', 'api.ocorrencias_listar'), 'resumo: total = total da lista');

-- ===== Trilha de acessos ============================================================================================
INSERT INTO guardado SELECT 'ev1', pg_temp.rpc('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'limite', 3));
SELECT is((pg_temp.g('ev1') ->> 'total')::int, 8, 'eventos: total da unidade usa o valor efetivo (entrada corrigida entra)');
SELECT is(pg_temp.g('ev1') -> 'porTipo', '{"entrada": 6, "saida": 2, "negado": 0, "recusado": 0, "correcao": 0}'::jsonb, 'eventos: por tipo no mesmo filtro');
SELECT ok(pg_temp.rpc('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'limite', 3, 'cursor', (pg_temp.g('ev1') ->> 'cursor'))) -> 'total' = 'null'::jsonb,
  'eventos por cursor: sem total (custo da exportação)');
INSERT INTO percurso VALUES
  ('vd', pg_temp.por_deslocamento('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1')), 3)),
  ('vc', pg_temp.por_cursor('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1')), 3));
SELECT ok(pg_temp.p('vd') = pg_temp.p('vc') AND cardinality(pg_temp.p('vd')) = 8 AND pg_temp.sem_repetir(pg_temp.p('vd')),
  'eventos: cursor e deslocamento dão a mesma sequência (8, sem repetir)');
SELECT is(ARRAY(SELECT e.seq FROM unnest(pg_temp.p('vd')) WITH ORDINALITY x(id, i) JOIN public.evento_acesso e ON e.id = x.id ORDER BY x.i),
  ARRAY(SELECT e.seq FROM unnest(pg_temp.p('vd')) x(id) JOIN public.evento_acesso e ON e.id = x.id ORDER BY e.seq DESC), 'eventos: seq decrescente');
SELECT is(pg_temp.por_cursor('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'tipo', 'saida', 'pessoa', 'paginacao um'), 1),
  pg_temp.por_deslocamento('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'tipo', 'saida', 'pessoa', 'paginacao um'), 1),
  'eventos com tipo e nome: mesma sequência nos dois caminhos');
SELECT is(cardinality(pg_temp.por_deslocamento('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'tipo', 'saida', 'pessoa', 'paginacao um'), 1)), 2,
  'eventos com tipo e nome: as 2 saídas');
-- Evento novo depois da página 1: com o ateSeq da página 1, a página 2 é a mesma de antes e o total não muda.
INSERT INTO public.evento_acesso (tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel, autorizado_por_tipo, justificativa)
VALUES ('entrada', 'morador', pg_temp.id('m1'), pg_temp.id('un1'), (SELECT id FROM public.ponto_acesso ORDER BY nome LIMIT 1), pg_temp.id('u_po'), 'porteiro', 'excecao_porteiro', 'Fixture de paginacao');
INSERT INTO guardado SELECT 'ev2', pg_temp.rpc('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'), 'limite', 3, 'deslocamento', 3,
  'ateSeq', (pg_temp.g('ev1') -> 'ateSeq')));
SELECT is(ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(pg_temp.g('ev2') -> 'itens') x), (pg_temp.p('vd'))[4:6],
  'ateSeq: a página 2 não repete linha depois de um evento novo');
SELECT is((pg_temp.g('ev2') ->> 'total')::int, 8, 'ateSeq: o total é o do instante da página 1');
SELECT is(pg_temp.total('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1'))), 9::bigint, 'sem ateSeq: o evento novo entra');
-- A exportação é sempre do conjunto inteiro: deslocamento e ateSeq são ignorados.
INSERT INTO guardado SELECT 'exp', pg_temp.val('si', format('api.auditoria_exportar(%L::jsonb)',
  jsonb_build_object('unidadeId', pg_temp.id('un1'), 'deslocamento', 5, 'ateSeq', 1, 'limite', 2)::text));
SELECT is(ARRAY(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(pg_temp.g('exp') -> 'eventos') x ORDER BY (x ->> 'seq')::bigint DESC),
  pg_temp.por_cursor('au', 'api.eventos_listar', jsonb_build_object('unidadeId', pg_temp.id('un1')), 100),
  'exportação: os mesmos 9 eventos da listagem, ignorando os parâmetros de página');

-- ===== Trilha de alterações =========================================================================================
SELECT is(pg_temp.total('au', 'api.auditoria_alteracoes', '{"acao": "paginacao.teste"}'), 5::bigint, 'alterações: total do filtro');
SELECT ok(pg_temp.por_cursor('au', 'api.auditoria_alteracoes', '{"acao": "paginacao.teste"}', 2)
          = pg_temp.por_deslocamento('au', 'api.auditoria_alteracoes', '{"acao": "paginacao.teste"}', 2)
      AND cardinality(pg_temp.por_deslocamento('au', 'api.auditoria_alteracoes', '{"acao": "paginacao.teste"}', 2)) = 5,
  'alterações: mesma sequência nos dois caminhos');

-- ===== A verificação da cadeia continua com o conjunto inteiro (api.auditoria_cadeia não mudou) ======================
CREATE FUNCTION pg_temp.cadeia_cobre() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r jsonb; n bigint := 0; ultimo bigint; ate bigint;
BEGIN
  r := pg_temp.rpc('au', 'api.auditoria_cadeia', '{"limite": 3}');
  ate := (r ->> 'ateSeq')::bigint;
  FOR volta IN 1..100000 LOOP
    EXIT WHEN jsonb_array_length(r -> 'eventos') = 0;
    n := n + jsonb_array_length(r -> 'eventos');
    ultimo := (r -> 'eventos' -> -1 ->> 'seq')::bigint;
    EXIT WHEN jsonb_array_length(r -> 'eventos') < 3;
    r := pg_temp.rpc('au', 'api.auditoria_cadeia', jsonb_build_object('limite', 3, 'aposSeq', ultimo, 'ateSeq', ate));
  END LOOP;
  RETURN ultimo = ate AND n = (SELECT count(*) FROM public.evento_acesso WHERE seq <= ate);
END $$;
SELECT ok(pg_temp.cadeia_cobre(), 'lotes da verificação percorrem a trilha inteira até a cabeça');

SELECT * FROM finish();
ROLLBACK;
