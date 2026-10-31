-- Portaria (F2): RBAC por RPC, mascaramento, negado persistido, cadeia, imutabilidade e regras de entrada/saída.
-- Chamadas pelo caminho real: SET ROLE authenticated + request.jwt.claims (o que o PostgREST faz), como 03_sessao.
-- Cada recusa é conferida pelo CÓDIGO do erro (JSON do RAISE PGRST). Fixtures próprias (não dependem do seed, só do
-- ponto de acesso "Portaria social", criado aqui se faltar). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(73);

-- ===== Fixtures ===================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_ad', 'u_po', 'u_au', 'u_tr', 'a_si', 'a_ad', 'a_po', 'a_au', 'a_tr',
  'un', 'un2', 'mor', 'vis', 'res', 'sem', 'pre', 'des', 'vis2', 'res2', 'fun']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;

INSERT INTO public.ponto_acesso (nome) VALUES ('Portaria social') ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, senha_temporaria_expira_em, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'Sílvia Síndica', 't7.sindica', 'sindico', false, NULL, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'Adão Admin', 't7.admin', 'administracao', false, NULL, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Pedro Porteiro', 't7.porteiro', 'porteiro', false, NULL, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_au'), 'Áurea Auditora', 't7.auditora', 'auditor', false, NULL, pg_temp.id('a_au'), pg_temp.email()),
  (pg_temp.id('u_tr'), 'Tânia Troca', 't7.troca', 'administracao', true, now() + interval '1 hour', pg_temp.id('a_tr'), pg_temp.email());
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid, revogada boolean) ON COMMIT DROP;
INSERT INTO sess (k, sub, revogada) VALUES ('si', pg_temp.id('a_si'), false), ('ad', pg_temp.id('a_ad'), false), ('po', pg_temp.id('a_po'), false),
  ('au', pg_temp.id('a_au'), false), ('tr', pg_temp.id('a_tr'), false), ('rev', pg_temp.id('a_po'), true);
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em, revogada_em, motivo_revogacao)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours', CASE WHEN s.revogada THEN now() END, CASE WHEN s.revogada THEN 'logout' END
  FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;

INSERT INTO public.unidade (id, bloco, numero) VALUES (pg_temp.id('un'), 'Y', '11'), (pg_temp.id('un2'), 'Y', '12');
-- CPFs de teste (dígito verificador válido): 529.982.247-25 (morador), 111.444.777-35 (visitante), 390.533.447-05 (restrito).
INSERT INTO public.pessoa (id, nome, categoria, documento_mascarado, documento_busca, telefone, sem_cpf, empresa, servico) VALUES
  (pg_temp.id('mor'), 'Mara Moradora', 'morador', '529.98*.***-**', public.cpf_hmac('52998224725'), '11987650001', false, NULL, NULL),
  (pg_temp.id('vis'), 'Vítor Visitante', 'visitante', '111.44*.***-**', public.cpf_hmac('11144477735'), '11987650002', false, NULL, NULL),
  (pg_temp.id('res'), 'Rui Restrito', 'visitante', '390.53*.***-**', public.cpf_hmac('39053344705'), '11987650003', false, NULL, NULL),
  (pg_temp.id('sem'), 'Sara Sem Documento', 'visitante', NULL, NULL, '11987650004', true, NULL, NULL),
  (pg_temp.id('pre'), 'Paulo Prestador', 'prestador', '714.60*.***-**', public.cpf_hmac('71460238006'), '11987650005', false, 'Firma X', 'Pintura'),
  (pg_temp.id('des'), 'Dora Desativada', 'visitante', '245.17*.***-**', public.cpf_hmac('24517913031'), '11987650006', false, NULL, NULL),
  (pg_temp.id('vis2'), 'Vera Visitante', 'visitante', '617.24*.***-**', public.cpf_hmac('61724738020'), '11987650007', false, NULL, NULL),
  (pg_temp.id('res2'), 'Renan Condomínio', 'visitante', '867.33*.***-**', public.cpf_hmac('86733128092'), '11987650008', false, NULL, NULL),
  (pg_temp.id('fun'), 'Fábio Funcionário', 'funcionario', '935.41*.***-**', public.cpf_hmac('93541134780'), '11987650009', false, NULL, NULL);
UPDATE public.pessoa SET desativada_em = now(), desativada_por_id = pg_temp.id('u_ad'), desativacao_motivo = 'Motivo de teste com texto livre'
 WHERE id = pg_temp.id('des');
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, vigencia_inicio, registrado_por_id)
VALUES (pg_temp.id('mor'), pg_temp.id('un'), 'proprietario', 'pendente', current_date - 10, pg_temp.id('u_ad'));
UPDATE public.vinculo_unidade SET status = 'aprovado', conferencia_tipo_documento = 'escritura', conferencia_data = current_date - 2,
       conferido_por_id = pg_temp.id('u_ad'), decidido_por_id = pg_temp.id('u_ad'), decidido_em = now() - interval '1 day'
 WHERE pessoa_id = pg_temp.id('mor');
INSERT INTO public.restricao (escopo, unidade_id, pessoa_id, motivo, valida_ate, solicitada_por_pessoa_id, cadastrada_por_id)
VALUES ('unidade', pg_temp.id('un'), pg_temp.id('res'), 'Pedido da moradora', now() + interval '30 days', pg_temp.id('mor'), pg_temp.id('u_po'));
INSERT INTO public.funcionario (pessoa_id, funcao, dias_semana, hora_inicio, hora_fim) VALUES (pg_temp.id('fun'), 'Zelador', ARRAY[0,1,2,3,4,5,6]::smallint[], '00:00', '23:59');

-- ===== Harness ====================================================================================================
-- 'ok' ou o código do erro. O SQL é montado ANTES de trocar de papel (o authenticated não lê as tabelas temporárias).
CREATE FUNCTION pg_temp.como(p_k text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text; c text;
BEGIN
  SELECT CASE WHEN p_k IS NULL THEN '' ELSE jsonb_build_object('role', 'authenticated', 'sub', sub, 'session_id', gid)::text END
    INTO c FROM (SELECT * FROM sess WHERE k = p_k UNION ALL SELECT NULL, NULL, NULL, NULL, NULL WHERE p_k IS NULL) s LIMIT 1;
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
-- O valor (jsonb) devolvido pela RPC; erro vira {"erro": código}.
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
CREATE FUNCTION pg_temp.q(p_fmt text, VARIADIC p_args text[] DEFAULT ARRAY[]::text[]) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s text := p_fmt; i integer;
BEGIN
  FOR i IN 1..coalesce(array_length(p_args, 1), 0) LOOP s := replace(s, '$' || i, quote_literal(p_args[i])); END LOOP;
  RETURN s;
END $$;
CREATE FUNCTION pg_temp.u(p text) RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.id(p)::text $$;
CREATE TEMP TABLE guardado (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.g(p text) RETURNS jsonb LANGUAGE sql AS $$ SELECT v FROM guardado WHERE k = p $$;

-- Chamada mínima de cada RPC de api.* (os argumentos não importam: a primeira linha é app.exigir/app.ator).
CREATE TEMP VIEW rpcs AS
SELECT f.oid::regprocedure AS fn, format('SELECT %s(%s)', f.oid::regproc,
         (SELECT string_agg(CASE t WHEN 'jsonb'::regtype THEN '''{}''::jsonb' WHEN 'uuid'::regtype THEN 'gen_random_uuid()'
                                    WHEN 'text'::regtype THEN '''x''' WHEN 'integer'::regtype THEN '1' WHEN 'boolean'::regtype THEN 'false' END, ', ')
            FROM unnest(f.proargtypes::regtype[]) t)) AS chamada
  FROM pg_proc f WHERE f.pronamespace = 'api'::regnamespace AND f.proname NOT IN ('sessao_atual', 'sessao_encerrar');

-- ===== Sessão e RBAC em TODA RPC da portaria ======================================================================
SELECT is_empty($$ SELECT fn, r FROM (SELECT fn, pg_temp.como(NULL, chamada) r FROM rpcs) x WHERE r <> 'NAO_AUTENTICADO' $$,
  'toda RPC da portaria: sem JWT -> NAO_AUTENTICADO');
SELECT is_empty($$ SELECT fn, r FROM (SELECT fn, pg_temp.como('rev', chamada) r FROM rpcs) x WHERE r <> 'SESSAO_INVALIDA' $$,
  'toda RPC da portaria: sessão revogada -> SESSAO_INVALIDA');
SELECT is_empty($$ SELECT fn, r FROM (SELECT fn, pg_temp.como('tr', chamada) r FROM rpcs) x WHERE r <> 'TROCA_DE_SENHA_OBRIGATORIA' $$,
  'toda RPC da portaria: troca de senha pendente -> TROCA_DE_SENHA_OBRIGATORIA');
SELECT ok((SELECT count(*) FROM rpcs) >= 35, 'o laço acima cobriu as RPCs da portaria');

-- Negativos por papel (o RBAC vem antes de qualquer leitura: 403 mesmo para id inexistente, sem vazar existência).
SELECT is(pg_temp.como('au', 'SELECT api.evento_entrada(''{}'')'), 'SEM_PERMISSAO', 'auditor não registra entrada');
SELECT is(pg_temp.como('au', 'SELECT api.evento_recusa(''{}'')'), 'SEM_PERMISSAO', 'auditor não registra recusa');
SELECT is(pg_temp.como('au', 'SELECT api.evento_saida(gen_random_uuid())'), 'SEM_PERMISSAO', 'auditor não registra saída');
SELECT is(pg_temp.como('po', 'SELECT api.evento_corrigir(gen_random_uuid(), ''{}'')'), 'SEM_PERMISSAO', 'porteiro não corrige evento');
SELECT is(pg_temp.como('au', 'SELECT api.evento_prorrogar(gen_random_uuid())'), 'SEM_PERMISSAO', 'auditor não prorroga permanência');
SELECT is(pg_temp.como('au', 'SELECT api.evento_ultimo_veiculo(gen_random_uuid())'), 'SEM_PERMISSAO', 'auditor não consulta o último veículo');
SELECT is(pg_temp.como('au', 'SELECT api.pessoa_funcionario(gen_random_uuid())'), 'SEM_PERMISSAO', 'auditor não consulta escala pela portaria');
SELECT is(pg_temp.como('au', 'SELECT api.turno_resumo()'), 'SEM_PERMISSAO', 'auditor não vê o resumo do turno');
SELECT is(pg_temp.como('au', 'SELECT api.pessoa_criar(''{"categoria":"visitante"}'')'), 'SEM_PERMISSAO', 'auditor não cadastra pessoa');
SELECT is(pg_temp.como('po', 'SELECT api.pessoa_criar(''{"categoria":"morador","nome":"X"}'')'), 'SEM_PERMISSAO', 'porteiro não cadastra morador');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.pessoa_desativar($1, ''motivo longo o bastante'')', pg_temp.u('vis'))), 'SEM_PERMISSAO', 'porteiro não desativa pessoa');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.pessoa_reativar($1)', pg_temp.u('des'))), 'SEM_PERMISSAO', 'porteiro não reativa pessoa');
SELECT is(pg_temp.como('po', 'SELECT api.vinculos_listar()'), 'SEM_PERMISSAO', 'porteiro não lista vínculos');
SELECT is(pg_temp.como('po', 'SELECT api.vinculos_contar(''pendente'')'), 'SEM_PERMISSAO', 'porteiro não conta vínculos');
SELECT is(pg_temp.como('au', 'SELECT api.autorizacao_criar(''{}'')'), 'SEM_PERMISSAO', 'auditor não cria autorização prévia');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.autorizacao_criar(jsonb_build_object(''pessoaId'', $1, ''areaComumId'', gen_random_uuid(), ''validaAte'', ''2099-01-01''))', pg_temp.u('pre'))),
  'SEM_PERMISSAO', 'porteiro não autoriza área comum (autorizacao.area_comum)');
SELECT is(pg_temp.como('au', 'SELECT api.autorizacao_revogar(gen_random_uuid())'), 'SEM_PERMISSAO', 'auditor não revoga autorização');
SELECT is(pg_temp.como('au', 'SELECT api.autorizacoes_vigentes(gen_random_uuid(), gen_random_uuid(), false)'), 'SEM_PERMISSAO', 'auditor não lista vigentes da entrada');
SELECT is(pg_temp.como('au', 'SELECT api.restricao_criar(''{}'')'), 'SEM_PERMISSAO', 'auditor não cria restrição');
SELECT is(pg_temp.como('ad', 'SELECT api.restricao_aprovar(gen_random_uuid())'), 'SEM_PERMISSAO', 'administração não aprova restrição (RN-06: só o síndico)');
SELECT is(pg_temp.como('po', 'SELECT api.restricao_revogar(gen_random_uuid())'), 'SEM_PERMISSAO', 'porteiro não revoga restrição');
SELECT is(pg_temp.como('au', 'SELECT api.eventos_listar()'), 'ok', 'auditor lê o histórico (evento.ver)');

-- ===== Pessoas: cadastro, busca e mascaramento =====================================================================
INSERT INTO guardado SELECT 'nova', pg_temp.val('po', 'api.pessoa_criar(''{"nome":"Nina Nova","categoria":"visitante","documento":"153.509.460-56","telefone":"(11) 98765-0010"}'')');
SELECT ok(pg_temp.g('nova') ->> 'id' IS NOT NULL AND pg_temp.g('nova') ->> 'documentoMascarado' = '153.50*.***-**'
  AND pg_temp.g('nova') ->> 'telefoneMascarado' = '(**) *****-0010' AND NOT pg_temp.g('nova') ? 'telefone' AND NOT pg_temp.g('nova') ? 'documentoBusca',
  'porteiro cadastra visitante: máscara nova, telefone mascarado, sem HMAC nem telefone na resposta');
SELECT is(pg_temp.como('po', 'SELECT api.pessoa_criar(''{"nome":"Outra","categoria":"visitante","documento":"15350946056","telefone":"11987650011"}'')'),
  'PESSOA_DUPLICADA', 'mesmo CPF: PESSOA_DUPLICADA');
SELECT is(pg_temp.como('po', 'SELECT api.pessoa_criar(''{"nome":"Outra","categoria":"visitante","documento":"15350946057","telefone":"11987650011"}'')'),
  'CPF_INVALIDO', 'dígito verificador errado: CPF_INVALIDO');
SELECT is_empty($$
  SELECT 1 FROM public.audit_log WHERE registro_id = (pg_temp.g('nova') ->> 'id')::uuid
     AND (depois::text ~ '15350946056|153\.509\.460|98765-?0010' OR depois ? 'documento_busca'
          OR depois::text LIKE '%' || public.cpf_hmac('15350946056') || '%')
$$, 'trilha pessoa.criar sem CPF, sem HMAC e sem telefone completo');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'pessoa.criar' AND registro_id = (pg_temp.g('nova') ->> 'id')::uuid),
  'pessoa.criar gravou a trilha na mesma transação');
SELECT is(pg_temp.val('po', 'api.pessoas_buscar(''{"q":"529.982.247-25"}'')') #>> '{pessoas,0,nome}', 'Mara Moradora', 'busca pelo CPF completo (HMAC no banco) acha a pessoa');
SELECT is(pg_temp.val('po', 'api.pessoas_buscar(''{"q":"11144"}'')') #>> '{pessoas,0,nome}', 'Vítor Visitante', 'busca pelos 5 primeiros dígitos visíveis');
SELECT is(pg_temp.val('po', 'api.pessoas_buscar(''{"q":"Y-11"}'')') #>> '{pessoas,0,nome}', 'Mara Moradora', 'busca pelo código da unidade');
SELECT is(pg_temp.val('po', 'api.pessoas_buscar(''{"q":"Dora Desativada"}'')') -> 'pessoas', '[]'::jsonb, 'desativada some da busca da portaria');
SELECT is_empty($$
  SELECT papel, r FROM (
    SELECT k AS papel, pg_temp.val(k, pg_temp.q('api.pessoa_ficha($1)', pg_temp.u('mor')))::text
        || pg_temp.val(k, 'api.pessoas_buscar(''{"q":"mara"}'')')::text
        || pg_temp.val(k, 'api.pessoas_listar(''{"limite":100}'')')::text
        || pg_temp.val(k, pg_temp.q('api.unidade_detalhe($1)', pg_temp.u('un')))::text AS r
      FROM unnest(ARRAY['si', 'ad', 'po', 'au']) k) x
   WHERE r ~ '"telefone"' OR r ~ 'documentoBusca|documento_busca' OR r LIKE '%' || public.cpf_hmac('52998224725') || '%'
      OR r ~ '11987650001' OR r !~ '"telefoneMascarado": "\(\*\*\) \*\*\*\*\*-0001"'
$$, 'nenhum papel recebe telefone completo nem HMAC (ficha, busca, lista, unidade); todos recebem o telefone mascarado');
SELECT is(pg_temp.val('po', pg_temp.q('api.pessoa_ficha($1)', pg_temp.u('des'))) #> '{pessoa,desativacaoMotivo}', NULL, 'motivo da desativação não vai ao porteiro');
SELECT is(pg_temp.val('ad', pg_temp.q('api.pessoa_ficha($1)', pg_temp.u('des'))) #>> '{pessoa,desativacaoMotivo}', 'Motivo de teste com texto livre',
  'motivo da desativação vai a quem pode desativar');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.pessoa_desativar($1, ''Mudou-se do condomínio em definitivo'')', pg_temp.u('mor'))),
  'PESSOA_COM_VINCULO_VALIDO', 'não desativa quem tem vínculo válido');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.pessoa_desativar($1, ''curto'')', pg_temp.u('vis2'))), 'MOTIVO_OBRIGATORIO', 'motivo com menos de 15 caracteres');

-- ===== Registro de acesso ===========================================================================================
INSERT INTO guardado SELECT 'cab0', to_jsonb((SELECT ultimo_seq FROM public.evento_acesso_cadeia WHERE id = 1));
INSERT INTO guardado SELECT 'cab0h', to_jsonb((SELECT ultimo_hash FROM public.evento_acesso_cadeia WHERE id = 1));
INSERT INTO guardado SELECT 'e1', pg_temp.val('po', pg_temp.q(
  'api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3, ''veiculo'', jsonb_build_object(''placa'', ''abc-1d23'')))',
  pg_temp.u('vis'), pg_temp.u('un'), pg_temp.u('mor')));
SELECT ok(pg_temp.g('e1') ->> 'resultado' = 'entrada' AND pg_temp.g('e1') #>> '{evento,autorizadoPorNome}' = 'Mara Moradora'
  AND pg_temp.g('e1') #>> '{evento,veiculo,placa}' = 'ABC1D23' AND (pg_temp.g('e1') #>> '{evento,formatoHash}')::int = 2
  AND pg_temp.g('e1') #>> '{evento,permanencia,tipoVisita}' = 'visita',
  'entrada por interfone: autorizador resolvido, veículo (formato 2) e prazo de permanência');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('vis'), pg_temp.u('un'), pg_temp.u('mor'))), 'JA_ESTA_DENTRO', 'segunda entrada sem saída: JA_ESTA_DENTRO');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('vis2'), pg_temp.u('un2'), pg_temp.u('mor'))), 'AUTORIZADOR_SEM_VINCULO', 'autorizador sem vínculo na unidade de destino');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('sem'), pg_temp.u('un'), pg_temp.u('mor'))), 'SEM_CPF_SO_EXCECAO', 'sem CPF só entra por exceção');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''excecao_porteiro'', ''justificativa'', ''curta''))',
  pg_temp.u('sem'), pg_temp.u('un'))), 'JUSTIFICATIVA_OBRIGATORIA', 'exceção exige justificativa de 15+ caracteres');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('des'), pg_temp.u('un'), pg_temp.u('mor'))), 'PESSOA_DESATIVADA', 'desativada não entra');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3, ''retroativo'', true, ''ocorridoEm'', 1700000000000))',
  pg_temp.u('vis2'), pg_temp.u('un'), pg_temp.u('mor'))), 'FORMULARIO_OBRIGATORIO', 'retroativo sem formulário de contingência');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''autorizadoPorTipo'', ''escala''))', pg_temp.u('fun'))),
  'ok', 'funcionário em escala entra sem unidade de destino');

-- Negado (desenho §6): a RPC responde sucesso com resultado 'negado', e o evento FICA gravado (um RAISE o desfaria).
INSERT INTO guardado SELECT 'neg', pg_temp.val('po', pg_temp.q(
  'api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3, ''veiculo'', jsonb_build_object(''placa'', ''QWE1234'')))',
  pg_temp.u('res'), pg_temp.u('un'), pg_temp.u('mor')));
SELECT is(pg_temp.g('neg') ->> 'resultado', 'negado', 'entrada com restrição vigente: resultado negado (sem RAISE)');
SELECT ok(EXISTS (SELECT 1 FROM public.evento_acesso WHERE id = (pg_temp.g('neg') #>> '{evento,id}')::uuid AND tipo = 'negado'
                    AND restricao_id IS NOT NULL AND pessoa_id = pg_temp.id('res') AND veiculo_placa IS NULL),
  'o negado ficou gravado na trilha, com a restrição e sem o veículo (minimização)');
SELECT ok(pg_temp.g('neg') ->> 'mensagem' LIKE 'Entrada não permitida para BLOCO Y · AP 11: Pedido da moradora.' AND jsonb_array_length(pg_temp.g('neg') -> 'restricoes') = 1,
  'o negado devolve a mensagem e as restrições para o 422 do adaptador');

-- Saída, correção, imutabilidade
INSERT INTO guardado SELECT 's1', pg_temp.val('po', pg_temp.q('api.evento_saida($1)', pg_temp.g('e1') #>> '{evento,id}'));
SELECT ok(pg_temp.g('s1') ->> 'tipo' = 'saida' AND pg_temp.g('s1') ->> 'refereEventoId' = pg_temp.g('e1') #>> '{evento,id}'
  AND pg_temp.g('s1') #>> '{veiculo,placa}' = 'ABC1D23', 'saída é evento novo ligado à entrada e herda o veículo na view');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_saida($1)', pg_temp.g('e1') #>> '{evento,id}')), 'SAIDA_JA_REGISTRADA', 'saída dupla: 409');
INSERT INTO guardado SELECT 'antes', to_jsonb(e) FROM public.evento_acesso e WHERE id = (pg_temp.g('e1') #>> '{evento,id}')::uuid;
INSERT INTO guardado SELECT 'c1', pg_temp.val('si', pg_temp.q('api.evento_corrigir($1, jsonb_build_object(''justificativa'', ''Visitante registrado na unidade errada'', ''valores'', jsonb_build_object(''unidadeDestinoId'', $2)))',
  pg_temp.g('e1') #>> '{evento,id}', pg_temp.u('un2')));
SELECT ok(pg_temp.g('c1') ->> 'tipo' = 'correcao' AND pg_temp.g('c1') #>> '{valoresCorrigidos,unidadeDestinoId}' = pg_temp.u('un2'),
  'síndico corrige: evento de correção com o valor novo');
SELECT is(to_jsonb(e), pg_temp.g('antes'), 'a entrada corrigida continua byte a byte igual (a correção é outro evento)')
  FROM public.evento_acesso e WHERE id = (pg_temp.g('e1') #>> '{evento,id}')::uuid;
SELECT is(pg_temp.val('au', pg_temp.q('api.evento_obter($1)', pg_temp.g('e1') #>> '{evento,id}')) ->> 'unidadeRotulo', 'Y-12',
  'a view da entrada traz o valor EFETIVO (com a correção)');
SELECT is(pg_temp.como('si', pg_temp.q('SELECT api.evento_corrigir($1, ''{"justificativa":"Corrigindo a correção indevida"}'')', pg_temp.g('c1') ->> 'id')),
  'CORRECAO_DE_CORRECAO', 'não se corrige uma correção');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_recusa(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''meio'', ''celular'', ''moradorPessoaId'', $3))',
  pg_temp.u('vis2'), pg_temp.u('un'), pg_temp.u('mor'))), 'ok', 'recusa do morador pelo celular');

-- Permanência: 4 prorrogações e a 5ª recusada.
INSERT INTO guardado SELECT 'e2', pg_temp.val('po', pg_temp.q('api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3, ''tipoVisita'', ''entrega''))',
  pg_temp.u('vis2'), pg_temp.u('un'), pg_temp.u('mor')));
SELECT is((SELECT array_agg((pg_temp.val('po', pg_temp.q('api.evento_prorrogar($1)', pg_temp.g('e2') #>> '{evento,id}')) ->> 'prorrogacoes')::int ORDER BY i) FROM generate_series(1, 4) i),
  ARRAY[1, 2, 3, 4], 'quatro prorrogações de +1h');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.evento_prorrogar($1)', pg_temp.g('e2') #>> '{evento,id}')), 'PRORROGACAO_LIMITE', 'a 5ª prorrogação é recusada');
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.val('po', 'api.eventos_presentes()')) p
                   WHERE p ->> 'id' = pg_temp.g('e2') #>> '{evento,id}' AND (p #>> '{permanencia,prorrogacoes}')::int = 4),
  'presentes trazem a entrada com o prazo vigente');

-- Cadeia íntegra depois de tudo (seq sem buraco, encadeamento e hash recalculado em SQL; a verificação TS é no vitest).
SELECT is_empty($$
  SELECT e.seq FROM public.evento_acesso e
   WHERE e.seq > (pg_temp.g('cab0'))::text::bigint
     AND (e.hash <> encode(sha256(convert_to(e.hash_anterior || public.evento_acesso_canonico(e), 'UTF8')), 'hex')
          OR e.hash_anterior IS DISTINCT FROM CASE WHEN e.seq = (pg_temp.g('cab0'))::text::bigint + 1 THEN pg_temp.g('cab0h') #>> '{}'
                                                   ELSE (SELECT p.hash FROM public.evento_acesso p WHERE p.seq = e.seq - 1) END)
$$, 'cadeia íntegra: cada hash confere e aponta para o anterior');
SELECT is((SELECT ultimo_seq FROM public.evento_acesso_cadeia WHERE id = 1), (SELECT max(seq) FROM public.evento_acesso),
  'cabeça da cadeia = último seq gravado (nenhum evento fora do trigger)');
SELECT is((SELECT count(*)::int FROM public.evento_acesso WHERE seq > (pg_temp.g('cab0'))::text::bigint),
  (SELECT (max(seq) - (pg_temp.g('cab0'))::text::bigint)::int FROM public.evento_acesso), 'seq contíguo (sem buraco nem repetição)');

-- ===== Autorizações prévias e restrições ============================================================================
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.autorizacao_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''validaAte'', ''2099-12-31''))',
  pg_temp.u('pre'), pg_temp.u('un'))), 'SOLICITANTE_OU_JUSTIFICATIVA', 'autorização sem solicitante exige justificativa');
INSERT INTO guardado SELECT 'ap', pg_temp.val('po', pg_temp.q('api.autorizacao_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''validaAte'', ''2099-12-31'', ''solicitadaPorPessoaId'', $3))',
  pg_temp.u('pre'), pg_temp.u('un'), pg_temp.u('mor')));
SELECT ok(pg_temp.g('ap') ->> 'estado' = 'valida' AND pg_temp.g('ap') ->> 'solicitadaPorNome' = 'Mara Moradora'
  AND EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'autorizacao.criar' AND registro_id = (pg_temp.g('ap') ->> 'id')::uuid),
  'autorização pedida pela moradora: válida e na trilha');
SELECT is(pg_temp.val('po', pg_temp.q('api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''autorizacao_previa'', ''autorizacaoPreviaId'', $3))',
  pg_temp.u('pre'), pg_temp.u('un'), pg_temp.g('ap') ->> 'id')) #>> '{evento,autorizadoPorNome}', 'Mara Moradora', 'entrada por autorização prévia: autorizador = quem pediu');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.autorizacao_revogar($1)', pg_temp.g('ap') ->> 'id')), 'ok', 'revogar autorização');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.autorizacao_revogar($1)', pg_temp.g('ap') ->> 'id')), 'AUTORIZACAO_JA_REVOGADA', 'revogar duas vezes: 409');
INSERT INTO guardado SELECT 'rc', pg_temp.val('po', pg_temp.q('api.restricao_criar(jsonb_build_object(''pessoaId'', $1, ''motivo'', ''Ocorrência na portaria'', ''validaAte'', ''2099-12-31'', ''paraTodoCondominio'', true))',
  pg_temp.u('res2')));
SELECT ok((pg_temp.g('rc') ->> 'pendente')::boolean AND NOT (pg_temp.val('po', pg_temp.q('api.restricao_verificar($1, NULL)', pg_temp.u('res2'))) ->> 'restrita')::boolean,
  'restrição de condomínio nasce pendente e não vigora antes do síndico (RN-06)');
SELECT is(pg_temp.como('si', pg_temp.q('SELECT api.restricao_aprovar($1)', pg_temp.g('rc') ->> 'id')), 'ok', 'síndico aprova');
SELECT is(pg_temp.como('si', pg_temp.q('SELECT api.restricao_aprovar($1)', pg_temp.g('rc') ->> 'id')), 'RESTRICAO_JA_APROVADA', 'aprovar duas vezes: 409');
SELECT is(pg_temp.val('po', pg_temp.q('api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('res2'), pg_temp.u('un2'), pg_temp.u('mor'))) ->> 'resultado', 'negado', 'aprovada, a restrição de condomínio barra a entrada em qualquer unidade');

SELECT * FROM finish();
ROLLBACK;
