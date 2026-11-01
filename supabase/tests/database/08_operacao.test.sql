-- Operação (F3): vínculos (escrita), encomendas, ocorrências, funcionários, veículos, pessoa.editar, unidades,
-- auditoria (trilha, cadeia, exportação), relatórios e importação. Mesmo harness do 07: chamadas pelo caminho real
-- (SET ROLE authenticated + request.jwt.claims) e cada recusa conferida pelo CÓDIGO do erro. A sessão sem JWT, revogada e
-- com troca pendente em TODA RPC de api.* já é coberta pelo laço do 07 (as RPCs novas entram nele sozinhas).
-- Fixtures próprias (bloco W8, CPFs gerados aqui). Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(121);

-- ===== Fixtures ===================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_si', 'u_ad', 'u_po', 'u_po2', 'u_au', 'a_si', 'a_ad', 'a_po', 'a_po2', 'a_au',
  'un', 'un2', 'un3', 'mor', 'vis', 'sem', 'aut', 'leg', 'vis3', 'des']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;
-- CPF com dígito verificador a partir de 9 dígitos (só teste).
CREATE FUNCTION pg_temp.cpf(b text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE d text := b; s int; r int; n int;
BEGIN
  FOREACH n IN ARRAY ARRAY[9, 10] LOOP
    s := 0;
    FOR i IN 1..n LOOP s := s + substr(d, i, 1)::int * (n + 2 - i); END LOOP;
    r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
    d := d || r;
  END LOOP;
  RETURN d;
END $$;

INSERT INTO public.ponto_acesso (nome) VALUES ('Portaria social') ON CONFLICT DO NOTHING;
INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_si'), 'Sônia Síndica', 't8.sindica', 'sindico', false, pg_temp.id('a_si'), pg_temp.email()),
  (pg_temp.id('u_ad'), 'Ari Admin', 't8.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Paulo Porteiro', 't8.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email()),
  (pg_temp.id('u_po2'), 'Pietra Porteira', 't8.porteira', 'porteiro', false, pg_temp.id('a_po2'), pg_temp.email()),
  (pg_temp.id('u_au'), 'Abel Auditor', 't8.auditor', 'auditor', false, pg_temp.id('a_au'), pg_temp.email());
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('si', pg_temp.id('a_si')), ('ad', pg_temp.id('a_ad')), ('po', pg_temp.id('a_po')), ('po2', pg_temp.id('a_po2')), ('au', pg_temp.id('a_au'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;

INSERT INTO public.unidade (id, bloco, numero) VALUES (pg_temp.id('un'), 'W8', '11'), (pg_temp.id('un2'), 'W8', '12'), (pg_temp.id('un3'), 'W8', '13');
INSERT INTO public.pessoa (id, nome, categoria, documento_mascarado, documento_busca, telefone, sem_cpf) VALUES
  (pg_temp.id('mor'), 'Marta Moradora', 'morador', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070601')), '11977770001', false),
  (pg_temp.id('vis'), 'Vicente Visitante', 'visitante', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070602')), '11977770002', false),
  (pg_temp.id('sem'), 'Sílvio Sem Documento', 'visitante', NULL, NULL, '11977770003', true),
  (pg_temp.id('aut'), 'Aurora Autorizada', 'visitante', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070604')), '11977770004', false),
  (pg_temp.id('leg'), 'Lauro Legado', 'morador', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070605')), '11977770005', false),
  (pg_temp.id('vis3'), 'Vânia Visitante', 'visitante', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070606')), '11977770006', false),
  (pg_temp.id('des'), 'Débora Desativada', 'visitante', '908.07*.***-**', public.cpf_hmac(pg_temp.cpf('908070607')), '11977770007', false);
UPDATE public.pessoa SET desativada_em = now(), desativada_por_id = pg_temp.id('u_ad'), desativacao_motivo = 'Saiu do condomínio de vez' WHERE id = pg_temp.id('des');
-- Marta: vínculo aprovado na W8-11 (pendente -> aprovado, a única transição de entrada).
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, vigencia_inicio, registrado_por_id)
VALUES (pg_temp.id('mor'), pg_temp.id('un'), 'proprietario', 'pendente', current_date - 30, pg_temp.id('u_ad'));
UPDATE public.vinculo_unidade SET status = 'aprovado', conferencia_tipo_documento = 'escritura', conferencia_data = current_date - 2,
       conferido_por_id = pg_temp.id('u_ad'), decidido_por_id = pg_temp.id('u_ad'), decidido_em = now() - interval '1 day'
 WHERE pessoa_id = pg_temp.id('mor');
-- Lauro: legado na W8-12, sem conferência.
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, prazo_regularizacao, registrado_por_id)
VALUES (pg_temp.id('leg'), pg_temp.id('un2'), 'proprietario', 'legado', current_date + 60, pg_temp.id('u_ad'));

-- ===== Harness (o mesmo do 07) =====================================================================================
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
CREATE FUNCTION pg_temp.q(p_fmt text, VARIADIC p_args text[] DEFAULT ARRAY[]::text[]) RETURNS text LANGUAGE plpgsql AS $$
DECLARE s text := p_fmt; i integer;
BEGIN
  FOR i IN 1..coalesce(array_length(p_args, 1), 0) LOOP s := replace(s, '$' || i, quote_literal(p_args[i])); END LOOP;
  RETURN s;
END $$;
CREATE FUNCTION pg_temp.u(p text) RETURNS text LANGUAGE sql AS $$ SELECT pg_temp.id(p)::text $$;
CREATE TEMP TABLE guardado (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.g(p text) RETURNS jsonb LANGUAGE sql AS $$ SELECT v FROM guardado WHERE k = p $$;
CREATE FUNCTION pg_temp.trilha(p_acao text, p_id uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM public.audit_log WHERE acao = p_acao AND registro_id = p_id) $$;
-- Erro de uma escrita direta como app_rw (camadas de append-only): o SQLSTATE, ou 'ok'.
CREATE FUNCTION pg_temp.como_app_rw(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  SET LOCAL ROLE app_rw;
  BEGIN EXECUTE p_sql; r := 'ok'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  RESET ROLE;
  RETURN r;
END $$;

-- ===== Vínculos: escrita =========================================================================================
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''proprietario''))',
  pg_temp.u('vis'), pg_temp.u('un'))), 'SEM_PERMISSAO', 'porteiro não cria vínculo (RN-03)');
SELECT is(pg_temp.como('au', pg_temp.q('SELECT api.vinculo_aprovar($1)', pg_temp.u('vis'))), 'SEM_PERMISSAO', 'auditor não decide vínculo');
SELECT is(pg_temp.como('po', 'SELECT api.vinculo_conferir(gen_random_uuid(), ''{"tipo":"escritura"}'')'), 'SEM_PERMISSAO', 'porteiro não registra conferência');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''inquilino''))',
  pg_temp.u('vis'), pg_temp.u('un'))), 'VIGENCIA_OBRIGATORIA', 'inquilino sem fim de vigência');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''proprietario''))',
  pg_temp.u('des'), pg_temp.u('un'))), 'PESSOA_DESATIVADA', 'cadastro desativado não recebe vínculo');
INSERT INTO guardado SELECT 'v1', pg_temp.val('ad', pg_temp.q('api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''proprietario'', ''vigenciaInicio'', ''2026-01-01''))',
  pg_temp.u('vis'), pg_temp.u('un')));
SELECT ok(pg_temp.g('v1') ->> 'status' = 'pendente' AND pg_temp.g('v1') ->> 'pessoaNome' = 'Vicente Visitante' AND pg_temp.g('v1') ->> 'unidadeCodigo' = 'W8-11'
  AND pg_temp.trilha('vinculo.criar', (pg_temp.g('v1') ->> 'id')::uuid), 'administração pede vínculo: nasce pendente e vai para a trilha');
SELECT is((SELECT categoria::text FROM public.pessoa WHERE id = pg_temp.id('vis')), 'visitante', 'pedir vínculo não muda a categoria (RF-04)');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''dependente''))',
  pg_temp.u('vis'), pg_temp.u('un'))), 'VINCULO_DUPLICADO', 'segundo vínculo ativo/pendente da mesma pessoa na unidade');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_aprovar($1)', pg_temp.g('v1') ->> 'id')), 'CONFERENCIA_OBRIGATORIA', 'aprovar sem conferência (RN-02)');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"outro","descricao":"Declaração do síndico"," observacao":"x"}'')', pg_temp.g('v1') ->> 'id')),
  'ok', 'conferência "outro" com descrição (chave desconhecida é ignorada)');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"escritura","observacao":"CPF 908.070.601-12 conferido"}'')', pg_temp.g('v1') ->> 'id')),
  'DADO_PESSOAL_NA_CONFERENCIA', 'conferência com CPF digitado na observação');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"escritura","data":"2099-01-01"}'')', pg_temp.g('v1') ->> 'id')),
  'DATA_FUTURA', 'conferência com data futura');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"outro"}'')', pg_temp.g('v1') ->> 'id')),
  'DESCRICAO_OBRIGATORIA', 'tipo "outro" exige descrição');
INSERT INTO guardado SELECT 'v1a', pg_temp.val('ad', pg_temp.q('api.vinculo_aprovar($1)', pg_temp.g('v1') ->> 'id'));
SELECT ok(pg_temp.g('v1a') ->> 'status' = 'aprovado' AND pg_temp.g('v1a') ->> 'decididoPorNome' = 'Ari Admin'
  AND pg_temp.g('v1a') #>> '{conferencia,tipoDocumento}' = 'outro', 'aprovado com a conferência registrada');
SELECT ok((SELECT categoria = 'morador' FROM public.pessoa WHERE id = pg_temp.id('vis'))
  AND EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'pessoa.editar' AND registro_id = pg_temp.id('vis') AND depois ->> 'motivo' = 'aprovacao_de_vinculo'),
  'aprovação torna a pessoa moradora, com trilha própria (RF-04)');
SELECT is(pg_temp.como('si', pg_temp.q('SELECT api.vinculo_aprovar($1)', pg_temp.g('v1') ->> 'id')), 'VINCULO_JA_DECIDIDO', 'aprovar duas vezes: 409');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"escritura"}'')', pg_temp.g('v1') ->> 'id')),
  'CONFERENCIA_IMUTAVEL', 'conferência congelada depois da aprovação');
-- Cadastro incompleto (sem CPF) e rejeição
INSERT INTO guardado SELECT 'v2', pg_temp.val('ad', pg_temp.q('api.vinculo_criar(jsonb_build_object(''pessoaId'', $1, ''unidadeId'', $2, ''tipo'', ''proprietario''))',
  pg_temp.u('sem'), pg_temp.u('un')));
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"escritura"}'')', pg_temp.g('v2') ->> 'id')), 'ok', 'conferência da escritura');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_aprovar($1)', pg_temp.g('v2') ->> 'id')), 'CADASTRO_INCOMPLETO', 'sem CPF não aprova (cadastro completo)');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_rejeitar($1, ''{"justificativa":"   "}'')', pg_temp.g('v2') ->> 'id')), 'JUSTIFICATIVA_OBRIGATORIA', 'rejeitar sem justificativa');
SELECT is(pg_temp.val('ad', pg_temp.q('api.vinculo_rejeitar($1, ''{"justificativa":"Documento não confere"}'')', pg_temp.g('v2') ->> 'id')) ->> 'status', 'rejeitado', 'rejeitado com justificativa');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_encerrar($1, ''{"motivo":"Motivo longo o suficiente"}'')', pg_temp.g('v2') ->> 'id')),
  'VINCULO_NAO_ENCERRAVEL', 'rejeitado é final');
-- Encerramento
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_encerrar($1, ''{"motivo":"curto"}'')', pg_temp.g('v1') ->> 'id')), 'MOTIVO_OBRIGATORIO', 'encerrar com motivo curto');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_encerrar($1, ''{"motivo":"Mudou-se do condomínio","data":"2099-01-01"}'')', pg_temp.g('v1') ->> 'id')),
  'DATA_FUTURA', 'encerrar com data futura');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_encerrar($1, ''{"motivo":"Mudou-se do condomínio","data":"2025-12-31"}'')', pg_temp.g('v1') ->> 'id')),
  'DATA_ANTES_DO_INICIO', 'encerrar antes do início da vigência');
INSERT INTO guardado SELECT 'v1e', pg_temp.val('ad', pg_temp.q('api.vinculo_encerrar($1, ''{"motivo":"Mudou-se do condomínio"}'')', pg_temp.g('v1') ->> 'id'));
SELECT ok(pg_temp.g('v1e') ->> 'status' = 'encerrado' AND pg_temp.g('v1e') ->> 'encerradoEm' IS NOT NULL
  AND pg_temp.trilha('vinculo.encerrar', (pg_temp.g('v1') ->> 'id')::uuid), 'encerrado hoje, com trilha');
-- Regularização (RN-09)
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_regularizar($1)', pg_temp.g('v1') ->> 'id')), 'VINCULO_NAO_LEGADO', 'só legado se regulariza');
INSERT INTO guardado SELECT 'leg', to_jsonb(v) FROM public.vinculo_unidade v WHERE pessoa_id = pg_temp.id('leg');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_regularizar($1)', pg_temp.g('leg') ->> 'id')), 'CONFERENCIA_OBRIGATORIA', 'legado sem conferência não regulariza');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.vinculo_conferir($1, ''{"tipo":"contrato_compra_venda"}'')', pg_temp.g('leg') ->> 'id')), 'ok', 'conferência no legado');
SELECT is(pg_temp.val('si', pg_temp.q('api.vinculo_regularizar($1, ''{"vigenciaFim":null}'')', pg_temp.g('leg') ->> 'id')) ->> 'status', 'aprovado', 'legado regularizado vira aprovado');
-- Camada 2: a máquina de estados no trigger, mesmo como app_rw (sem a RPC)
SELECT is(pg_temp.como_app_rw(pg_temp.q('UPDATE public.vinculo_unidade SET status = ''aprovado'' WHERE id = $1', pg_temp.g('v2') ->> 'id')), '23514',
  'trigger recusa sair de rejeitado (estado final) mesmo sem passar pela RPC');

-- ===== Encomendas ================================================================================================
SELECT is(pg_temp.como('au', pg_temp.q('SELECT api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''X'', ''unidadeConfirmada'', true))', pg_temp.u('un'))),
  'SEM_PERMISSAO', 'auditor não recebe encomenda');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''Marta'', ''unidadeConfirmada'', false))', pg_temp.u('un'))),
  'UNIDADE_NAO_CONFIRMADA', 'sem conferir a unidade (RF-23)');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''  '', ''unidadeConfirmada'', true))', pg_temp.u('un'))),
  'DESTINATARIO_OBRIGATORIO', 'destinatário obrigatório');
INSERT INTO guardado SELECT 'e1', pg_temp.val('po', pg_temp.q('api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''Marta Moradora'', ''transportadora'', ''Correios'', ''unidadeConfirmada'', true))', pg_temp.u('un')));
SELECT ok(pg_temp.g('e1') ->> 'codigo' ~ '^K[0-9]+$' AND pg_temp.g('e1') ->> 'unidadeCodigo' = 'W8-11' AND pg_temp.g('e1') ->> 'recebidaPorNome' = 'Paulo Porteiro'
  AND pg_temp.g('e1') ->> 'codigoRastreio' = '' AND pg_temp.g('e1') -> 'autorizacoes' = '[]'::jsonb AND pg_temp.trilha('encomenda.receber', (pg_temp.g('e1') ->> 'id')::uuid),
  'porteiro recebe: código K, unidade, quem recebeu, trilha');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_entregar($1, $2)', pg_temp.g('e1') ->> 'id', pg_temp.u('aut'))), 'PESSOA_SEM_VINCULO',
  'sem vínculo e sem autorização não retira (RN-08)');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_autorizar_retirada($1, jsonb_build_object(''pessoaId'', $2, ''solicitadaPorPessoaId'', $3))',
  pg_temp.g('e1') ->> 'id', pg_temp.u('aut'), pg_temp.u('vis3'))), 'SOLICITANTE_SEM_VINCULO', 'quem autoriza precisa de vínculo válido');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_autorizar_retirada($1, jsonb_build_object(''pessoaId'', $2, ''solicitadaPorPessoaId'', $3))',
  pg_temp.g('e1') ->> 'id', pg_temp.u('sem'), pg_temp.u('mor'))), 'CPF_OBRIGATORIO', 'retirante precisa de CPF');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_autorizar_retirada($1, jsonb_build_object(''pessoaId'', $2, ''solicitadaPorPessoaId'', $2))',
  pg_temp.g('e1') ->> 'id', pg_temp.u('mor'))), 'AUTORIZACAO_PROPRIA', 'morador não se autoriza');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_autorizar_retirada($1, jsonb_build_object(''pessoaId'', $2, ''solicitadaPorPessoaId'', $3))',
  pg_temp.g('e1') ->> 'id', pg_temp.u('aut'), pg_temp.u('mor'))), 'ok', 'moradora autoriza a retirada');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_autorizar_retirada($1, jsonb_build_object(''pessoaId'', $2, ''solicitadaPorPessoaId'', $3))',
  pg_temp.g('e1') ->> 'id', pg_temp.u('aut'), pg_temp.u('mor'))), 'AUTORIZACAO_DUPLICADA', 'mesma autorização duas vezes: 409');
INSERT INTO guardado SELECT 'e1r', pg_temp.val('po', pg_temp.q('api.encomenda_entregar($1, $2)', pg_temp.g('e1') ->> 'id', pg_temp.u('aut')));
SELECT ok(pg_temp.g('e1r') ->> 'retiradaEm' IS NOT NULL AND pg_temp.g('e1r') ->> 'retiradaPorNome' = 'Aurora Autorizada (autorizado por Marta Moradora)'
  AND pg_temp.g('e1r') ->> 'retiradaAutorizacaoId' IS NOT NULL AND jsonb_array_length(pg_temp.g('e1r') -> 'autorizacoes') = 1,
  'retirada pela autorizada, com a autorização ligada');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_entregar($1, $2)', pg_temp.g('e1') ->> 'id', pg_temp.u('mor'))), 'ENCOMENDA_JA_ENTREGUE', 'retirar duas vezes: 409');
SELECT is(pg_temp.como_app_rw(pg_temp.q('UPDATE public.encomenda SET destinatario = ''Outro'' WHERE id = $1', pg_temp.g('e1') ->> 'id')), '23514',
  'trigger congela a encomenda retirada mesmo sem a RPC');
INSERT INTO guardado SELECT 'e2', pg_temp.val('po', pg_temp.q('api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''Marta'', ''unidadeConfirmada'', true))', pg_temp.u('un')));
UPDATE public.encomenda SET recebida_em = now() - interval '9 days' WHERE id = (pg_temp.g('e2') ->> 'id')::uuid;
SELECT is(pg_temp.val('po', pg_temp.q('api.encomenda_entregar($1, $2)', pg_temp.g('e2') ->> 'id', pg_temp.u('mor'))) ->> 'retiradaPorNome', 'Marta Moradora (morador)',
  'moradora com vínculo retira direto');
INSERT INTO guardado SELECT 'e3', pg_temp.val('po', pg_temp.q('api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''Marta'', ''unidadeConfirmada'', true))', pg_temp.u('un')));
UPDATE public.encomenda SET recebida_em = now() - interval '8 days' WHERE id = (pg_temp.g('e3') ->> 'id')::uuid;
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.val('au', pg_temp.q('api.encomendas_listar(jsonb_build_object(''atrasadasDias'', 7, ''unidadeId'', $1))', pg_temp.u('un'))) -> 'itens') x
                   WHERE x ->> 'id' = pg_temp.g('e3') ->> 'id'), 'aguardando há 8 dias aparece em atrasadas (diasDesde > 7)');
SELECT is(jsonb_array_length(pg_temp.val('au', pg_temp.q('api.encomendas_listar(jsonb_build_object(''status'', ''entregue'', ''unidadeId'', $1))', pg_temp.u('un'))) -> 'itens'), 2,
  'filtro entregue');
SELECT ok((pg_temp.val('po', 'api.encomendas_resumo(7)') ->> 'atrasadas')::int >= 1, 'resumo conta as atrasadas');

-- ===== Ocorrências ===============================================================================================
INSERT INTO guardado SELECT 'ev', pg_temp.val('po', pg_temp.q(
  'api.evento_entrada(jsonb_build_object(''pessoaId'', $1, ''unidadeDestinoId'', $2, ''autorizadoPorTipo'', ''interfone'', ''autorizadoPorPessoaId'', $3))',
  pg_temp.u('vis3'), pg_temp.u('un'), pg_temp.u('mor')));
SELECT is(pg_temp.como('au', 'SELECT api.ocorrencia_criar(''{"tipo":"dano","descricao":"x"}'')'), 'SEM_PERMISSAO', 'auditor não abre ocorrência');
SELECT is(pg_temp.como('po', 'SELECT api.ocorrencia_criar(''{"tipo":"dano","descricao":"  "}'')'), 'DESCRICAO_OBRIGATORIA', 'descrição obrigatória');
SELECT is(pg_temp.como('po', 'SELECT api.ocorrencia_criar(''{"tipo":"dano","descricao":"x","eventoIds":["00000000-0000-4000-8000-000000000000"]}'')'),
  'EVENTO_NAO_ENCONTRADO', 'evento vinculado precisa existir');
INSERT INTO guardado SELECT 'o1', pg_temp.val('po', pg_temp.q('api.ocorrencia_criar(jsonb_build_object(''tipo'', ''conflito'', ''descricao'', ''Discussão na portaria'', ''unidadeId'', $1, ''eventoIds'', jsonb_build_array($2, $2)))',
  pg_temp.u('un'), pg_temp.g('ev') #>> '{evento,id}'));
SELECT ok(pg_temp.g('o1') ->> 'status' = 'aberta' AND pg_temp.g('o1') ->> 'codigo' ~ '^OC-[0-9]{4}-[0-9]{3,}$' AND pg_temp.g('o1') -> 'eventoIds' = jsonb_build_array(pg_temp.g('ev') #>> '{evento,id}')
  AND pg_temp.g('o1') -> 'historicoStatus' = '[]'::jsonb AND pg_temp.g('o1') -> 'documentos' = '[]'::jsonb AND pg_temp.trilha('ocorrencia.criar', (pg_temp.g('o1') ->> 'id')::uuid),
  'porteiro abre: aberta, código OC-AAAA-NNN, evento repetido uma vez, trilha');
SELECT is(pg_temp.como('po2', pg_temp.q('SELECT api.ocorrencia_alterar_status($1, ''em_andamento'')', pg_temp.g('o1') ->> 'id')), 'SO_PROPRIA_OCORRENCIA',
  'porteiro só altera a ocorrência que ele abriu');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.ocorrencia_alterar_status($1, ''encerrada'')', pg_temp.g('o1') ->> 'id')), 'TRANSICAO_INVALIDA', 'aberta não vai direto a encerrada');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.ocorrencia_alterar_status($1, ''aberta'')', pg_temp.g('o1') ->> 'id')), 'VALIDACAO', 'status fora da lista: 400');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.ocorrencia_alterar_status($1, ''em_andamento'')', pg_temp.g('o1') ->> 'id')), 'ok', 'quem abriu põe em andamento');
INSERT INTO guardado SELECT 'o1e', pg_temp.val('ad', pg_temp.q('api.ocorrencia_alterar_status($1, ''encerrada'')', pg_temp.g('o1') ->> 'id'));
SELECT ok(pg_temp.g('o1e') ->> 'status' = 'encerrada' AND jsonb_array_length(pg_temp.g('o1e') -> 'historicoStatus') = 2
  AND pg_temp.g('o1e') #>> '{historicoStatus,1,porNome}' = 'Ari Admin', 'administração encerra: histórico com as duas transições e quem fez');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.ocorrencia_alterar_status($1, ''em_andamento'')', pg_temp.g('o1') ->> 'id')), 'OCORRENCIA_ENCERRADA', 'encerrada é final');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.ocorrencia_vincular_eventos($1, jsonb_build_object(''eventoIds'', jsonb_build_array($2)))', pg_temp.g('o1') ->> 'id', pg_temp.g('ev') #>> '{evento,id}')),
  'OCORRENCIA_ENCERRADA', 'encerrada não recebe evento');
INSERT INTO guardado SELECT 'o2', pg_temp.val('po2', 'api.ocorrencia_criar(''{"tipo":"outro","descricao":"Portão emperrado"}'')');
SELECT is(pg_temp.val('po', pg_temp.q('api.ocorrencia_vincular_eventos($1, jsonb_build_object(''eventoIds'', jsonb_build_array($2)))', pg_temp.g('o2') ->> 'id', pg_temp.g('ev') #>> '{evento,id}')) -> 'eventoIds',
  jsonb_build_array(pg_temp.g('ev') #>> '{evento,id}'), 'qualquer operador vincula evento (RF-28)');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE acao = 'ocorrencia.vincularEventos' AND registro_id = (pg_temp.g('o2') ->> 'id')::uuid), 1, 'vincular gravou a trilha');
SELECT is(pg_temp.val('po', pg_temp.q('api.ocorrencia_vincular_eventos($1, jsonb_build_object(''eventoIds'', jsonb_build_array($2)))', pg_temp.g('o2') ->> 'id', pg_temp.g('ev') #>> '{evento,id}')) -> 'eventoIds',
  jsonb_build_array(pg_temp.g('ev') #>> '{evento,id}'), 'vínculo repetido é ignorado');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE acao = 'ocorrencia.vincularEventos' AND registro_id = (pg_temp.g('o2') ->> 'id')::uuid), 1, 'repetido não grava trilha');
SELECT is(jsonb_array_length(pg_temp.val('au', 'api.ocorrencias_listar(''{"status":["encerrada"],"tipo":"conflito"}'')') -> 'itens') >= 1, true, 'auditor lista por status e tipo');
SELECT is(pg_temp.como_app_rw('UPDATE public.ocorrencia_status_historico SET para = ''encerrada'''), '42501', 'histórico de status: app_rw sem UPDATE (camada 1)');
SELECT is((SELECT r FROM (SELECT pg_temp.como_app_rw('SELECT 1') r) x), 'ok', 'sanidade do harness app_rw');
GRANT UPDATE ON public.ocorrencia_status_historico TO app_rw;
SELECT is(pg_temp.como_app_rw('UPDATE public.ocorrencia_status_historico SET em = em'), '23000', 'histórico de status: trigger barra mesmo com GRANT (camada 2)');
REVOKE UPDATE ON public.ocorrencia_status_historico FROM app_rw;

-- ===== Funcionários ==============================================================================================
SELECT is(pg_temp.como('po', 'SELECT api.funcionarios_listar()'), 'SEM_PERMISSAO', 'porteiro não lista funcionários (decisão nº 29)');
SELECT is(pg_temp.como('au', 'SELECT api.funcionario_criar(''{}'')'), 'SEM_PERMISSAO', 'auditor não cadastra funcionário');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.funcionario_criar(jsonb_build_object(''nome'', ''Zeca Zelador'', ''documento'', $1, ''telefone'', ''11977770010'', ''funcao'', ''Zelador'', ''escala'', jsonb_build_object(''diasSemana'', jsonb_build_array(1, 1), ''horaInicio'', ''08:00'', ''horaFim'', ''17:00'')))',
  pg_temp.cpf('908070610'))), 'ESCALA_INVALIDA', 'dia da semana repetido na escala');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.funcionario_criar(jsonb_build_object(''nome'', ''Zeca Zelador'', ''documento'', $1, ''telefone'', ''11977770010'', ''funcao'', ''Zelador'', ''escala'', jsonb_build_object(''diasSemana'', jsonb_build_array(1), ''horaInicio'', ''08:00'', ''horaFim'', ''08:00'')))',
  pg_temp.cpf('908070610'))), 'ESCALA_INVALIDA', 'início igual ao fim');
INSERT INTO guardado SELECT 'f1', pg_temp.val('ad', pg_temp.q('api.funcionario_criar(jsonb_build_object(''nome'', ''Zeca Zelador'', ''documento'', $1, ''telefone'', ''(11) 97777-0010'', ''funcao'', '' Zelador '', ''escala'', jsonb_build_object(''diasSemana'', jsonb_build_array(5, 1, 3), ''horaInicio'', ''22:00'', ''horaFim'', ''06:00'')))',
  pg_temp.cpf('908070610')));
SELECT ok(pg_temp.g('f1') ->> 'funcao' = 'Zelador' AND pg_temp.g('f1') #> '{escala,diasSemana}' = '[1, 3, 5]'::jsonb AND pg_temp.g('f1') #>> '{pessoa,categoria}' = 'funcionario'
  AND pg_temp.g('f1') #>> '{pessoa,telefoneMascarado}' = '(**) *****-0010' AND NOT (pg_temp.g('f1') -> 'pessoa') ? 'telefone' AND pg_temp.g('f1') ? 'emEscalaAgora'
  AND pg_temp.trilha('pessoa.criar', (pg_temp.g('f1') ->> 'pessoaId')::uuid) AND pg_temp.trilha('funcionario.criar', (pg_temp.g('f1') ->> 'pessoaId')::uuid),
  'funcionário criado: pessoa (sem telefone completo), escala ordenada (turno que vira a meia-noite), duas linhas na trilha');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.funcionario_criar(jsonb_build_object(''nome'', ''Outro'', ''documento'', $1, ''telefone'', ''11977770011'', ''funcao'', ''Zelador'', ''escala'', jsonb_build_object(''diasSemana'', jsonb_build_array(1), ''horaInicio'', ''08:00'', ''horaFim'', ''09:00'')))',
  pg_temp.cpf('908070610'))), 'PESSOA_DUPLICADA', 'mesmo CPF de outro cadastro');
SELECT is(pg_temp.val('ad', pg_temp.q('api.funcionario_editar($1, ''{"ativo":false}'')', pg_temp.g('f1') ->> 'pessoaId')) ->> 'ativo', 'false', 'desativa o funcionário');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE acao = 'funcionario.editar' AND registro_id = (pg_temp.g('f1') ->> 'pessoaId')::uuid), 1, 'edição na trilha');
SELECT is(pg_temp.val('ad', pg_temp.q('api.funcionario_editar($1, ''{"ativo":false,"funcao":"Zelador"}'')', pg_temp.g('f1') ->> 'pessoaId')) ->> 'ativo', 'false', 'nada mudou');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE acao = 'funcionario.editar' AND registro_id = (pg_temp.g('f1') ->> 'pessoaId')::uuid), 1, 'nada mudou: sem trilha');
SELECT ok(EXISTS (SELECT 1 FROM jsonb_array_elements(pg_temp.val('au', 'api.funcionarios_listar(''{"limite":100}'')') -> 'itens') x
                   WHERE x ->> 'pessoaId' = pg_temp.g('f1') ->> 'pessoaId'), 'auditor lista funcionários (funcionario.ver)');

-- ===== Veículos ==================================================================================================
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.veiculo_criar(jsonb_build_object(''unidadeId'', $1, ''placa'', ''ABC1D23'', ''modelo'', ''Onix'', ''cor'', ''Prata''))', pg_temp.u('un'))),
  'SEM_PERMISSAO', 'porteiro não cadastra veículo');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.veiculo_criar(jsonb_build_object(''unidadeId'', $1, ''placa'', ''AB1234'', ''modelo'', ''Onix'', ''cor'', ''Prata''))', pg_temp.u('un'))),
  'PLACA_INVALIDA', 'placa fora do padrão');
INSERT INTO guardado SELECT 've', pg_temp.val('ad', pg_temp.q('api.veiculo_criar(jsonb_build_object(''unidadeId'', $1, ''placa'', ''tst-8w11'', ''modelo'', ''Onix'', ''cor'', ''Prata''))', pg_temp.u('un')));
SELECT is(pg_temp.g('ve') ->> 'placa', 'TST8W11', 'placa normalizada (maiúsculas, sem hífen)');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.veiculo_criar(jsonb_build_object(''unidadeId'', $1, ''placa'', ''TST8W11'', ''modelo'', ''Gol'', ''cor'', ''Azul''))', pg_temp.u('un2'))),
  'PLACA_DUPLICADA', 'placa ativa é única');
INSERT INTO guardado SELECT 've2', pg_temp.val('ad', pg_temp.q('api.veiculo_editar($1, ''{"ativo":false}'')', pg_temp.g('ve') ->> 'id'));
SELECT ok(pg_temp.g('ve2') ->> 'ativo' = 'false' AND (SELECT desativado_em IS NOT NULL FROM public.veiculo WHERE id = (pg_temp.g('ve') ->> 'id')::uuid)
  AND pg_temp.trilha('veiculo.editar', (pg_temp.g('ve') ->> 'id')::uuid), 'desativa (fato gerador da retenção), com trilha');

-- ===== Pessoa: correção ==========================================================================================
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.pessoa_editar($1, ''{"nome":"X"}'')', pg_temp.u('vis3'))), 'SEM_PERMISSAO', 'porteiro não edita cadastro');
INSERT INTO guardado SELECT 'pe', pg_temp.val('ad', pg_temp.q('api.pessoa_editar($1, ''{"telefone":"(21) 98888-7777","nome":" Vânia Visitante Souza "}'')', pg_temp.u('vis3')));
SELECT ok(pg_temp.g('pe') ->> 'nome' = 'Vânia Visitante Souza' AND pg_temp.g('pe') ->> 'telefoneMascarado' = '(**) *****-7777' AND NOT pg_temp.g('pe') ? 'telefone',
  'administração corrige nome e telefone; resposta sem telefone completo');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'pessoa.editar' AND registro_id = pg_temp.id('vis3')
                    AND depois ->> 'telefone' = '(**) *****-7777' AND antes ->> 'telefone' = '(**) *****-0006' AND NOT depois ? 'documento_busca'),
  'trilha da correção com antes/depois mascarados e sem HMAC');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.pessoa_editar($1, jsonb_build_object(''documento'', $2))', pg_temp.u('vis3'), pg_temp.cpf('908070601'))),
  'PESSOA_DUPLICADA', 'CPF de outra pessoa');
INSERT INTO guardado SELECT 'ps', pg_temp.val('ad', pg_temp.q('api.pessoa_editar($1, jsonb_build_object(''documento'', $2))', pg_temp.u('sem'), pg_temp.cpf('908070611')));
SELECT ok(NOT (pg_temp.g('ps') ->> 'semCpf')::boolean AND pg_temp.g('ps') ->> 'documentoMascarado' ~ '^908\.07\*\.\*\*\*-\*\*$',
  'informar o CPF tira a pessoa de "sem CPF" (máscara no formato novo)');

-- ===== Unidades ==================================================================================================
SELECT is(pg_temp.como('po', 'SELECT api.unidade_criar(''{"bloco":"w8","numero":"7"}'')'), 'SEM_PERMISSAO', 'porteiro não cria unidade');
SELECT is(pg_temp.val('ad', 'api.unidade_criar(''{"bloco":" w8 ","numero":"7"}'')') ->> 'numero', '07', 'normaliza bloco e número (w8/7 -> W8-07)');
SELECT is(pg_temp.como('ad', 'SELECT api.unidade_criar(''{"bloco":"W8","numero":"07"}'')'), 'UNIDADE_DUPLICADA', 'unidade repetida');
SELECT is(pg_temp.como('ad', 'SELECT api.unidade_criar(''{"bloco":"W8-X","numero":"1"}'')'), 'UNIDADE_INVALIDA', 'bloco fora do formato');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.unidade_editar($1, ''{"bloco":"W8","numero":"91"}'')', pg_temp.u('un'))), 'UNIDADE_REFERENCIADA', 'unidade com registros não muda de número');
SELECT is(pg_temp.val('ad', pg_temp.q('api.unidade_editar($1, ''{"bloco":"W8","numero":"93"}'')', pg_temp.u('un3'))) ->> 'numero', '93', 'unidade sem registros muda de número');
SELECT is(pg_temp.val('ad', pg_temp.q('api.unidade_desativar($1)', pg_temp.u('un3'))) ->> 'ativo', 'false', 'desativa');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.unidade_desativar($1)', pg_temp.u('un3'))), 'UNIDADE_JA_INATIVA', 'desativar duas vezes');
SELECT is(pg_temp.como('po', pg_temp.q('SELECT api.encomenda_receber(jsonb_build_object(''unidadeId'', $1, ''destinatario'', ''X'', ''unidadeConfirmada'', true))', pg_temp.u('un3'))),
  'UNIDADE_INATIVA', 'unidade desativada não recebe encomenda');
SELECT is(pg_temp.val('ad', pg_temp.q('api.unidade_reativar($1)', pg_temp.u('un3'))) ->> 'ativo', 'true', 'reativa');

-- ===== Auditoria =================================================================================================
SELECT is(pg_temp.como('po', 'SELECT api.auditoria_alteracoes()'), 'SEM_PERMISSAO', 'porteiro não lê a trilha de alterações');
INSERT INTO guardado SELECT 'alt', pg_temp.val('au', 'api.auditoria_alteracoes(''{"acao":"pessoa.editar","limite":5}'')');
SELECT ok(jsonb_array_length(pg_temp.g('alt') -> 'itens') >= 1 AND NOT (pg_temp.g('alt') #> '{itens,0}') ? 'ip'
  AND pg_temp.g('alt') #>> '{itens,0,acao}' = 'pessoa.editar', 'auditor lê a trilha filtrada; o IP não sai');
SELECT is(pg_temp.como('po', 'SELECT api.auditoria_cadeia()'), 'SEM_PERMISSAO', 'porteiro não verifica a cadeia');
INSERT INTO guardado SELECT 'cad', pg_temp.val('au', 'api.auditoria_cadeia(''{"limite":2000}'')');
SELECT is_empty($$
  SELECT x ->> 'seq' FROM jsonb_array_elements(pg_temp.g('cad') -> 'eventos') x JOIN public.evento_acesso e ON e.seq = (x ->> 'seq')::bigint
   WHERE x ->> 'hash' <> e.hash OR x ->> 'hash_anterior' <> e.hash_anterior OR x ->> 'ocorrido_em' <> to_char(e.ocorrido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      OR (x ->> 'v')::int <> e.formato_hash
$$, 'lote da cadeia: cada evento no formato canônico, com o hash gravado');
SELECT ok((pg_temp.g('cad') #>> '{cabeca,ultimoSeq}')::bigint = (SELECT ultimo_seq FROM public.evento_acesso_cadeia WHERE id = 1), 'lote traz a cabeça da cadeia');
SELECT is(pg_temp.como('po', 'SELECT api.auditoria_exportar()'), 'SEM_PERMISSAO', 'porteiro não exporta');
INSERT INTO guardado SELECT 'exp', pg_temp.val('au', pg_temp.q('api.auditoria_exportar(jsonb_build_object(''pessoa'', ''Vânia'', ''unidadeId'', $1))', pg_temp.u('un')));
SELECT ok(jsonb_array_length(pg_temp.g('exp') -> 'eventos') = 1 AND pg_temp.g('exp') #>> '{eventos,0,id}' = pg_temp.g('ev') #>> '{evento,id}'
  AND pg_temp.g('exp') #>> ARRAY['exibicao', pg_temp.g('ev') #>> '{evento,id}', 'unidade'] = 'W8-11',
  'exportação: os eventos dos filtros do histórico, com a exibição à parte');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_log WHERE acao = 'auditoria.exportar' AND usuario_id = pg_temp.id('u_au')
                    AND depois #>> '{filtros,pessoa}' = '(nome)' AND (depois ->> 'quantidade')::int = 1 AND depois::text NOT LIKE '%Vânia%'),
  'exportação na trilha sem o texto do filtro de nome');
SELECT is(pg_temp.como('au', 'SELECT api.auditoria_exportar(''{"eventoId":"00000000-0000-4000-8000-000000000000"}'')'), 'EVENTO_NAO_ENCONTRADO', 'evento isolado inexistente: 404');

-- ===== Relatórios ================================================================================================
SELECT is(pg_temp.como('po', 'SELECT api.relatorio_resumo()'), 'SEM_PERMISSAO', 'porteiro não vê relatório');
INSERT INTO guardado SELECT 'rel', pg_temp.val('au', pg_temp.q('api.relatorio_resumo(jsonb_build_object(''unidadeId'', $1))', pg_temp.u('un')));
SELECT ok(jsonb_array_length(pg_temp.g('rel') -> 'acessosPorDia') = 30 AND (pg_temp.g('rel') #>> '{totais,entradas}')::int = 1
  AND pg_temp.g('rel') #>> '{acessosPorMeio,0,meio}' = 'interfone' AND pg_temp.g('rel') ->> 'filtroUnidadeCodigo' = 'W8-11'
  AND jsonb_array_length(pg_temp.g('rel') -> 'encomendasPorIdade') = 4,
  'resumo dos últimos 30 dias na unidade: a entrada por interfone, as faixas de encomenda');
SELECT is(pg_temp.como('au', 'SELECT api.relatorio_resumo(''{"de":"2026-10-31","ate":"2026-10-01"}'')'), 'PERIODO_INVALIDO', 'período invertido');
SELECT is(pg_temp.como('au', 'SELECT api.relatorio_resumo(''{"de":"2025-01-01","ate":"2026-01-02"}'')'), 'PERIODO_LONGO', 'mais de 366 dias');
SELECT is(pg_temp.como('au', 'SELECT api.relatorio_resumo(''{"de":"2025-01-01","ate":"2026-01-01"}'')'), 'ok', '366 dias é o máximo');

-- ===== Importação (RF-11) ========================================================================================
CREATE TEMP TABLE planilha (v jsonb) ON COMMIT DROP;
INSERT INTO planilha SELECT jsonb_build_array(
  jsonb_build_object('linha', 2, 'bloco', 'Bloco W8', 'unidade', '93', 'nome', 'Iara Importada', 'documento', pg_temp.cpf('908070620'), 'telefone', '11977770020', 'tipo', 'Inquilina'),
  jsonb_build_object('linha', 3, 'bloco', 'W8', 'unidade', '093', 'nome', 'Iara Importada', 'documento', pg_temp.cpf('908070620'), 'telefone', '', 'tipo', NULL),
  jsonb_build_object('linha', 4, 'bloco', 'W8', 'unidade', '93', 'nome', 'Ivo Sem CPF', 'documento', '123', 'telefone', '999', 'tipo', 'dependente'),
  jsonb_build_object('linha', 5, 'bloco', 'Z9', 'unidade', '1', 'nome', 'Fora', 'documento', '', 'telefone', ''),
  jsonb_build_object('linha', 6, 'bloco', 'W8', 'unidade', '11', 'nome', 'Marta Moradora', 'documento', pg_temp.cpf('908070601'), 'telefone', ''),
  jsonb_build_object('linha', 7, 'bloco', 'W8', 'unidade', '11', 'nome', 'Débora Desativada', 'documento', pg_temp.cpf('908070607'), 'telefone', ''));
SELECT is(pg_temp.como('po', 'SELECT api.importacao_analisar(''{"arquivo":"x.xlsx","linhas":[]}'')'), 'SEM_PERMISSAO', 'porteiro não importa');
INSERT INTO guardado SELECT 'imp', pg_temp.val('ad', 'api.importacao_analisar(jsonb_build_object(''arquivo'', ''moradores.xlsx'', ''linhas'', ' || quote_literal((SELECT v FROM planilha)::text) || '::jsonb))');
SELECT ok((pg_temp.g('imp') ->> 'lidas')::int = 6 AND (pg_temp.g('imp') ->> 'importaveis')::int = 3 AND (pg_temp.g('imp') ->> 'rejeitadas')::int = 2,
  'análise: 6 lidas, 3 importáveis (nova, sem CPF, reaproveitada), 2 rejeitadas (unidade, desativada), 1 duplicada');
SELECT is(ARRAY(SELECT i ->> 'codigo' FROM jsonb_array_elements(pg_temp.g('imp') -> 'inconsistencias') i),
  ARRAY['DUPLICIDADE_PLANILHA', 'DOC_INVALIDO', 'TELEFONE_INVALIDO', 'UNIDADE_INEXISTENTE', 'DUPLICIDADE_BANCO', 'PESSOA_DESATIVADA'],
  'inconsistências na ordem das linhas');
SELECT is_empty($$ SELECT 1 FROM jsonb_array_elements(pg_temp.g('imp') -> 'amostra') x WHERE app.so_digitos(x ->> 'documento') ~ '[0-9]{6}' $$,
  'amostra devolvida sem CPF em claro');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.importacao i WHERE i.id = (pg_temp.g('imp') ->> 'id')::uuid AND i.arquivo_sha256 = encode(sha256(convert_to((SELECT v FROM planilha)::text, 'UTF8')), 'hex'))
  AND EXISTS (SELECT 1 FROM public.importacao_inconsistencia WHERE importacao_id = (pg_temp.g('imp') ->> 'id')::uuid),
  'a impressão gravada não é SHA puro das linhas; inconsistências gravadas');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.importacao_confirmar($1, jsonb_build_object(''linhas'', ' || quote_literal(((SELECT v FROM planilha) - 0)::text) || '::jsonb))', pg_temp.g('imp') ->> 'id')),
  'IMPORTACAO_DIVERGENTE', 'confirmar com outras linhas: 409');
INSERT INTO guardado SELECT 'conf', pg_temp.val('ad', pg_temp.q('api.importacao_confirmar($1, jsonb_build_object(''linhas'', ' || quote_literal((SELECT v FROM planilha)::text) || '::jsonb))', pg_temp.g('imp') ->> 'id'));
SELECT ok((pg_temp.g('conf') ->> 'importados')::int = 2 AND (pg_temp.g('conf') ->> 'reaproveitados')::int = 1
  AND EXISTS (SELECT 1 FROM public.vinculo_unidade v JOIN public.pessoa p ON p.id = v.pessoa_id WHERE p.nome = 'Iara Importada' AND v.status = 'legado'
                AND v.tipo = 'inquilino' AND v.prazo_regularizacao = app.dia_brt(now()) + 90 AND p.importacao_id = (pg_temp.g('imp') ->> 'id')::uuid)
  AND EXISTS (SELECT 1 FROM public.pessoa WHERE nome = 'Ivo Sem CPF' AND sem_cpf AND documento_busca IS NULL AND telefone IS NULL),
  'confirmação: pessoas + vínculos legados (inquilino, prazo de 90 dias); CPF e telefone inválidos não gravados');
SELECT is(pg_temp.como('ad', pg_temp.q('SELECT api.importacao_confirmar($1, jsonb_build_object(''linhas'', ' || quote_literal((SELECT v FROM planilha)::text) || '::jsonb))', pg_temp.g('imp') ->> 'id')),
  'IMPORTACAO_JA_CONFIRMADA', 'confirmar duas vezes: 409');

-- ===== Minimização: nenhuma RPC nova devolve telefone completo nem HMAC ============================================
SELECT is_empty($$
  SELECT k FROM (SELECT k, pg_temp.val(k, 'api.funcionarios_listar(''{"limite":100}'')')::text
        || pg_temp.val(k, pg_temp.q('api.encomenda_obter($1)', pg_temp.g('e1') ->> 'id'))::text
        || pg_temp.val(k, pg_temp.q('api.ocorrencia_obter($1)', pg_temp.g('o1') ->> 'id'))::text
        || pg_temp.val(k, 'api.auditoria_alteracoes(''{"limite":100}'')')::text AS r
      FROM unnest(ARRAY['si', 'ad', 'au']) k) x
   WHERE r ~ '"telefone": "[0-9]' OR r ~ '1197777000[0-9]|21988887777' OR r ~ 'documento_busca|documentoBusca' OR r LIKE '%' || public.cpf_hmac(pg_temp.cpf('908070601')) || '%'
$$, 'funcionários, encomenda, ocorrência e trilha: sem telefone completo nem HMAC para nenhum papel');

SELECT * FROM finish();
ROLLBACK;
