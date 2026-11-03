-- Busca por CPF parcial (0042). Mesmo harness do 08/11 (SET ROLE authenticated + request.jwt.claims).
-- O que se prova: na máscara 'inicio' o prefixo casa só com 3 a 5 dígitos e de 6 a 10 não casa (antes a consulta era
-- cortada em 5 e "8 dígitos" achava todo CPF com o mesmo começo); 11 dígitos acham exatamente a pessoa pelo HMAC; na
-- máscara 'meio' o "contém" vale de 3 a 6 e não acima; nome e placa continuam achando; anonimizada nunca aparece; temMais
-- sem regressão. Fixtures próprias (bloco W15, CPFs gerados aqui). O banco pode ter dados do seed: toda afirmação é pela
-- presença ou ausência dos ids das fixtures, nunca por lista vazia ou contagem fixa. Rodar: `supabase test db`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

-- ===== Fixtures ===================================================================================================
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid DEFAULT gen_random_uuid()) ON COMMIT DROP;
INSERT INTO ids (k) SELECT unnest(ARRAY['u_ad', 'u_po', 'a_ad', 'a_po', 'un', 'pa', 'pb', 'pc', 'an']);
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.email() RETURNS text LANGUAGE sql AS $$ SELECT 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid' $$;
-- CPF com dígito verificador a partir de 9 dígitos (só teste; o mesmo do 08).
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
-- Alda e Bento: CPFs diferentes com o MESMO começo (731.95), máscara 'inicio' igual. Mônica: máscara 'meio' (271.935).
CREATE FUNCTION pg_temp.cpf_de(p text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.cpf(CASE p WHEN 'pa' THEN '731950001' WHEN 'pb' THEN '731958888' WHEN 'pc' THEN '468271935' END) $$;

INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES
  (pg_temp.id('u_ad'), 'Ada Admin', 't15.admin', 'administracao', false, pg_temp.id('a_ad'), pg_temp.email()),
  (pg_temp.id('u_po'), 'Pedro Porteiro', 't15.porteiro', 'porteiro', false, pg_temp.id('a_po'), pg_temp.email());
CREATE TEMP TABLE sess (k text PRIMARY KEY, sid uuid DEFAULT gen_random_uuid(), gid uuid DEFAULT gen_random_uuid(), sub uuid) ON COMMIT DROP;
INSERT INTO sess (k, sub) VALUES ('po', pg_temp.id('a_po'));
INSERT INTO public.sessao (id, usuario_id, auth_session_id, criada_em, ultimo_uso_em, expira_em)
SELECT s.sid, u.id, s.gid, now(), now(), now() + interval '10 hours' FROM sess s JOIN public.usuario_sistema u ON u.auth_user_id = s.sub;

INSERT INTO public.unidade (id, bloco, numero) VALUES (pg_temp.id('un'), 'W15', '11');
INSERT INTO public.pessoa (id, nome, categoria, documento_mascarado, documento_busca, telefone, sem_cpf) VALUES
  (pg_temp.id('pa'), 'Alda Prefixo Um', 'morador', app.mascarar_cpf(pg_temp.cpf_de('pa'), 'inicio'), public.cpf_hmac(pg_temp.cpf_de('pa')), '11966660001', false),
  (pg_temp.id('pb'), 'Bento Prefixo Dois', 'visitante', app.mascarar_cpf(pg_temp.cpf_de('pb'), 'inicio'), public.cpf_hmac(pg_temp.cpf_de('pb')), '11966660002', false),
  (pg_temp.id('pc'), 'Mônica Máscara Antiga', 'visitante', app.mascarar_cpf(pg_temp.cpf_de('pc'), 'meio'), public.cpf_hmac(pg_temp.cpf_de('pc')), '11966660003', false);
-- Anonimizada: sem documento, telefone nem foto (pessoa_anonimizada_sem_pii_ck); só o nome distintivo serve de isca.
INSERT INTO public.pessoa (id, nome, categoria, sem_cpf, anonimizada_em) VALUES
  (pg_temp.id('an'), 'Zuleica Anonimizada Quinze', 'visitante', true, now());
-- Alda: legado na W15-11 com prazo futuro (vínculo válido), e um carro ativo na unidade.
INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, prazo_regularizacao, registrado_por_id)
VALUES (pg_temp.id('pa'), pg_temp.id('un'), 'proprietario', 'legado', current_date + 60, pg_temp.id('u_ad'));
INSERT INTO public.veiculo (unidade_id, placa, modelo, cor) VALUES (pg_temp.id('un'), 'QZK7F31', 'Gol', 'Prata');

-- ===== Harness (o mesmo do 11) =====================================================================================
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
CREATE FUNCTION pg_temp.rpc(p_k text, p_fn text, p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.val(p_k, format('%s(%L::jsonb)', p_fn, p::text)) $$;
-- Ids das pessoas devolvidas (pessoas_buscar ou busca_global), como o porteiro.
CREATE FUNCTION pg_temp.achou(p_q text, p_fn text DEFAULT 'api.pessoas_buscar', p_limite integer DEFAULT 50) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg((x ->> 'id')::uuid), ARRAY[]::uuid[])
    FROM jsonb_array_elements(pg_temp.rpc('po', p_fn, CASE WHEN p_fn = 'api.pessoas_buscar' THEN jsonb_build_object('q', p_q, 'limite', p_limite)
                                                           ELSE jsonb_build_object('q', p_q) END) -> 'pessoas') x $$;
CREATE FUNCTION pg_temp.tem(p_q text, VARIADIC p_k text[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT (SELECT array_agg(v) FROM ids WHERE k = ANY (p_k)) <@ pg_temp.achou(p_q) $$;
CREATE FUNCTION pg_temp.nenhum(p_q text, VARIADIC p_k text[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT NOT ((SELECT array_agg(v) FROM ids WHERE k = ANY (p_k)) && pg_temp.achou(p_q)) $$;

-- ===== Máscara 'inicio': prefixo de 3 a 5 dígitos ==================================================================
SELECT ok(pg_temp.tem('73195', 'pa', 'pb'), 'inicio: 5 dígitos acham as duas pessoas com o mesmo começo');
SELECT ok(pg_temp.tem('731.95', 'pa', 'pb'), 'inicio: 5 dígitos com pontuação acham as duas');
SELECT ok(pg_temp.tem('731', 'pa', 'pb'), 'inicio: 3 dígitos acham pelo começo');

-- ===== Máscara 'inicio': 6 a 10 dígitos não casam por CPF (o defeito da 0022) ======================================
SELECT ok(pg_temp.nenhum(left(pg_temp.cpf_de('pa'), 8), 'pa', 'pb'),
  'inicio: 8 dígitos (começo do CPF da Alda) não acham ninguém por CPF, nem a Bento pelo prefixo de 5');
SELECT ok(pg_temp.nenhum(left(pg_temp.cpf_de('pa'), 6), 'pa', 'pb'), 'inicio: 6 dígitos não casam por CPF');
SELECT ok(pg_temp.nenhum(left(pg_temp.cpf_de('pa'), 10), 'pa', 'pb'), 'inicio: 10 dígitos não casam por CPF');

-- ===== 11 dígitos: HMAC, exatamente a pessoa ========================================================================
SELECT is(pg_temp.achou(regexp_replace(pg_temp.cpf_de('pa'), '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')),
  ARRAY[pg_temp.id('pa')], '11 dígitos formatados acham exatamente a Alda');
SELECT ok(pg_temp.tem(pg_temp.cpf_de('pb'), 'pb') AND pg_temp.nenhum(pg_temp.cpf_de('pb'), 'pa'),
  '11 dígitos sem pontuação acham a Bento e não a Alda (mesmo começo)');

-- ===== Máscara 'meio': "contém" de 3 a 6 dígitos ====================================================================
SELECT ok(pg_temp.tem('193', 'pc'), 'meio: 3 dígitos no meio da parte visível acham');
SELECT ok(pg_temp.tem('271935', 'pc'), 'meio: os 6 dígitos visíveis acham');
SELECT ok(pg_temp.nenhum(left(pg_temp.cpf_de('pc'), 7), 'pc'), 'meio: 7 dígitos não casam por CPF');

-- ===== Outros ramos sem mudança =====================================================================================
SELECT ok(pg_temp.tem('bento prefixo', 'pb'), 'nome continua achando (sem caixa)');
SELECT ok(pg_temp.tem('QZK7F31', 'pa'), 'placa do veículo da unidade com vínculo válido continua achando');
SELECT ok(pg_temp.tem('qzk-7f31', 'pa'), 'placa com hífen e minúscula continua achando');
SELECT ok(pg_temp.nenhum('Zuleica Anonimizada Quinze', 'an'), 'anonimizada não aparece');

-- ===== Busca do topo (api.busca_global usa a mesma função) ==========================================================
SELECT ok(NOT (ARRAY[pg_temp.id('pa'), pg_temp.id('pb')] && pg_temp.achou(left(pg_temp.cpf_de('pa'), 8), 'api.busca_global')),
  'busca global: 8 dígitos não acham por CPF');
SELECT ok(ARRAY[pg_temp.id('pa'), pg_temp.id('pb')] <@ pg_temp.achou('73195', 'api.busca_global'), 'busca global: 5 dígitos acham as duas');

-- ===== temMais (p_limite + 1) =======================================================================================
-- n = quantos o prefixo acha no teto (fixtures + o que o seed tiver); temMais é conferido em n e em n - 1.
CREATE FUNCTION pg_temp.n_prefixo() RETURNS integer LANGUAGE sql AS $$ SELECT cardinality(pg_temp.achou('73195')) $$;
CREATE FUNCTION pg_temp.pagina(p_limite integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.rpc('po', 'api.pessoas_buscar', jsonb_build_object('q', '73195', 'limite', p_limite)) $$;
SELECT ok(pg_temp.n_prefixo() BETWEEN 2 AND 49, 'prefixo de 5 tem pelo menos as duas fixtures e cabe no teto');
SELECT is(pg_temp.pagina(pg_temp.n_prefixo()) -> 'temMais', 'false'::jsonb, 'temMais falso quando o limite é exatamente o número de achados');
SELECT ok((SELECT r -> 'temMais' = 'true'::jsonb AND jsonb_array_length(r -> 'pessoas') = pg_temp.n_prefixo() - 1
             FROM (SELECT pg_temp.pagina(pg_temp.n_prefixo() - 1) AS r) x),
  'temMais verdadeiro com um a menos, e a página respeita o limite');

SELECT * FROM finish();
ROLLBACK;
