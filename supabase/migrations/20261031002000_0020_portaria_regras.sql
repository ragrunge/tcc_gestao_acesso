-- 0020 — Regras da portaria no banco (desenho §1, §4 e §8, F2). Nova: não existe no legado Drizzle.
--
-- Plano A do desenho (§9, R1, premissa ASSUMIDA): as regras que o servidor decide passam a ter uma segunda
-- implementação, em SQL, ao lado de @portaria/domain (que continua a fonte da UI). Cada função aqui é o porte de uma
-- função pura do domain, com o mesmo nome em português e a mesma ordem de checagem. O teste de paridade
-- (supabase/tests/integracao/paridade-regras.test.ts) roda os mesmos casos nos dois lados e compara.
--
-- Relógio: as regras recebem o instante (`p_quando`/`p_agora`) por parâmetro; quem chama passa now(). Fuso: BRT FIXO
-- (UTC-3, sem horário de verão desde 2019), o mesmo deslocamento de @portaria/domain/time, para "hoje", dia da semana e
-- minuto do dia saírem iguais nos dois lados (America/Sao_Paulo daria o mesmo hoje, mas não em datas antigas com DST).
--
-- HMAC do CPF (desenho §4, premissa ASSUMIDA "Vault"): a chave nasce AQUI, aleatória, e fica só no Vault. Só a função
-- public.cpf_hmac (dono postgres, SECURITY DEFINER) a lê, e só o app_rw a executa: não há oráculo exposto (a busca
-- devolve pessoa, nunca hash). db reset gera outra chave (P1: não há dado real; o seed recalcula).

-- ===== search_path dos triggers e helpers legados ======================================================================
-- Armadilha encontrada na F2: as funções de trigger das migrações 0001–0015 (permanencia_antes_inserir,
-- revogacao_congela, vinculo_unidade_transicao...) não fixam search_path e citam tabelas sem schema. Um trigger roda
-- com o search_path de QUEM disparou o comando; dentro das RPCs (SET search_path = '') isso dá "relation does not
-- exist". Fixar o mesmo search_path seguro das funções SECURITY DEFINER da 0001 (pg_catalog, public, pg_temp; ninguém
-- além do dono tem CREATE no public, 0016). Não muda corpo, dono nem GRANT: só a configuração da função.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proconfig IS NULL
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f);
  END LOOP;
END $$;

-- ===== Chave HMAC do CPF (Vault) ======================================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'portaria_hmac_cpf_v1') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'portaria_hmac_cpf_v1',
      'Chave HMAC-SHA256 do CPF (pessoa.documento_busca), F2. Sem valor fora do banco.');
  END IF;
END $$;

-- documento_busca = hex(HMAC-SHA256(chave, 11 dígitos em UTF-8)), o mesmo de documentoBuscaCpf (@portaria/domain/cpf)
-- com a chave em bytes. A mensagem de erro nunca cita o valor recebido (pode ser CPF).
CREATE FUNCTION public.cpf_hmac(p_digitos text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text;
BEGIN
  IF p_digitos IS NULL OR p_digitos !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'cpf_hmac: esperado CPF com 11 dígitos'; END IF;
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'portaria_hmac_cpf_v1';
  IF k IS NULL THEN RAISE EXCEPTION 'chave portaria_hmac_cpf_v1 ausente no Vault'; END IF;
  RETURN encode(extensions.hmac(convert_to(p_digitos, 'UTF8'), decode(k, 'hex'), 'sha256'), 'hex');
END $$;
REVOKE ALL ON FUNCTION public.cpf_hmac(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cpf_hmac(text) TO app_rw;

-- ===== Tempo (porte de @portaria/domain/time) =========================================================================
-- epoch ms, como o domínio. NULL entra, NULL sai.
CREATE FUNCTION app.ms(t timestamptz) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT round(extract(epoch FROM t) * 1000)::bigint $$;

-- epoch ms -> instante, exato no milissegundo (sem aritmética de ponto flutuante).
CREATE FUNCTION app.de_ms(p bigint) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE 'epoch'::timestamptz + (p::text || ' milliseconds')::interval END
$$;

-- Relógio de parede de São Paulo (UTC-3 fixo).
CREATE FUNCTION app.local_brt(t timestamptz) RETURNS timestamp
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT (t AT TIME ZONE 'UTC') - interval '3 hours' $$;

CREATE FUNCTION app.dia_brt(t timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT app.local_brt(t)::date $$;

-- inicioDoDia do domain para uma data de calendário (00:00 BRT).
CREATE FUNCTION app.inicio_da_data(d date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT (d::timestamp + interval '3 hours') AT TIME ZONE 'UTC' $$;

CREATE FUNCTION app.inicio_do_dia(t timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT app.inicio_da_data(app.dia_brt(t)) $$;

-- fimDoDia: 23:59:59.999 BRT.
CREATE FUNCTION app.fim_do_dia(t timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT app.inicio_do_dia(t) + interval '1 day' - interval '1 millisecond' $$;

CREATE FUNCTION app.fim_da_data(d date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT app.inicio_da_data(d) + interval '1 day' - interval '1 millisecond' $$;

-- 0 = domingo ... 6 = sábado, no fuso de São Paulo (partes().dow).
CREATE FUNCTION app.dow(t timestamptz) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT extract(dow FROM app.local_brt(t))::integer $$;

CREATE FUNCTION app.minutos_do_dia(t timestamptz) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (extract(hour FROM app.local_brt(t)) * 60 + extract(minute FROM app.local_brt(t)))::integer
$$;

-- hhmmParaMin: só horas e minutos (o domínio usa "HH:MM"; segundos de time(0) não contam).
CREATE FUNCTION app.hhmm_min(t time) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT (extract(hour FROM t) * 60 + extract(minute FROM t))::integer $$;

CREATE FUNCTION app.hhmm(t time) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT to_char(t, 'HH24:MI') $$;

-- fmtData / fmtHora (exibição BRT).
CREATE FUNCTION app.fmt_data(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT to_char(app.local_brt(t), 'DD/MM/YYYY') $$;
CREATE FUNCTION app.fmt_hora(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT to_char(app.local_brt(t), 'HH24:MI') $$;

-- ===== Texto =========================================================================================================
-- String.prototype.trim do JS: espaços ASCII e os brancos Unicode mais comuns (NBSP, BOM, separadores). btrim só tira ' '.
CREATE FUNCTION app.aparar(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(t, '^[\s ﻿  -     　]+|[\s ﻿  -     　]+$', '', 'g')
$$;

CREATE FUNCTION app.vazio_para_nulo(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT nullif(app.aparar(t), '') $$;

CREATE FUNCTION app.so_digitos(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') $$;

-- MIN_JUSTIFICATIVA = 15 (rules.ts). Divergência conhecida: o JS conta unidades UTF-16 (emoji = 2) e o SQL conta
-- caracteres; com emoji o servidor é MAIS restritivo (falha fechada).
CREATE FUNCTION app.justificativa_valida(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT length(app.aparar(coalesce(t, ''))) >= 15 $$;

-- Nome sem acento e minúsculo (busca.service.ts do legado: translate sobre lower, o mesmo alvo do NFD do front).
CREATE FUNCTION app.sem_acento(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT translate(lower(t), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
                             'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny')
$$;

-- Escapa curingas do LIKE (escape padrão: barra invertida).
CREATE FUNCTION app.escapar_like(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT regexp_replace(t, '([\\%_])', '\\\1', 'g') $$;

-- mascararTelefone (auditoria/snapshot.ts do legado): "(**) *****-1234".
CREATE FUNCTION app.mascarar_telefone(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN t IS NULL THEN NULL WHEN length(app.so_digitos(t)) >= 4 THEN '(**) *****-' || right(app.so_digitos(t), 4) ELSE '***' END
$$;

-- mascararDigitos (comum/log.ts): sequências com 9+ dígitos (CPF, telefone), com ou sem separador, viram asteriscos.
CREATE FUNCTION app.mascarar_digitos(t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  m text;
  saida text := '';
  resto text := t;
  pos integer;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  LOOP
    m := substring(resto FROM '[0-9][0-9./ -]*[0-9]');
    EXIT WHEN m IS NULL;
    pos := strpos(resto, m);
    saida := saida || left(resto, pos - 1)
      || CASE WHEN length(app.so_digitos(m)) >= 9 THEN regexp_replace(m, '[0-9]', '*', 'g') ELSE m END;
    resto := substr(resto, pos + length(m));
  END LOOP;
  RETURN saida || resto;
END $$;

-- ===== CPF (porte de rules.cpfValido e cpf.mascararCpf) ================================================================
CREATE FUNCTION app.cpf_valido(d text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  soma integer;
  r integer;
  n integer;
BEGIN
  IF d IS NULL OR d !~ '^[0-9]{11}$' OR d ~ '^(.)\1{10}$' THEN RETURN false; END IF;
  FOREACH n IN ARRAY ARRAY[9, 10] LOOP
    soma := 0;
    FOR i IN 1..n LOOP soma := soma + substr(d, i, 1)::integer * (n + 2 - i); END LOOP;
    r := (soma * 10) % 11;
    IF r = 10 THEN r := 0; END IF;
    IF r <> substr(d, n + 1, 1)::integer THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION app.mascarar_cpf(d text, p_formato text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_formato WHEN 'meio' THEN '***.' || substr(d, 4, 3) || '.' || substr(d, 7, 3) || '-**'
                        ELSE substr(d, 1, 3) || '.' || substr(d, 4, 2) || '*.***-**' END
$$;

-- ===== Placa e unidade ================================================================================================
-- normalizarPlaca: antiga (ABC1234) ou Mercosul (ABC1D23), maiúsculas sem separador; NULL fora do padrão.
CREATE FUNCTION app.normalizar_placa(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' THEN p END
    FROM (SELECT regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g') AS p) x
$$;

CREATE FUNCTION app.formatar_placa(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p ~ '^[A-Z0-9]{7}$' THEN left(p, 3) || '-' || substr(p, 4) ELSE p END
$$;

CREATE FUNCTION app.codigo_unidade(p_bloco text, p_numero text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT p_bloco || '-' || p_numero $$;

-- normalizarNumero: "3" -> "03", "032" -> "32"; texto que não é só dígitos volta aparado.
CREATE FUNCTION app.normalizar_numero(n text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  -- lpad corta texto maior que o tamanho pedido ("101" viraria "10"): só completa quando falta (achado pelo teste de paridade).
  SELECT CASE WHEN t !~ '^[0-9]+$' THEN t WHEN length(z) < 2 THEN lpad(z, 2, '0') ELSE z END
    FROM (SELECT t, regexp_replace(t, '^0+(?=[0-9])', '') AS z FROM (SELECT btrim(coalesce(n, '')) AS t) y) x
$$;

-- Chave natural do bloco (chaveBloco do domain): cada sequência de dígitos com 3 casas, comparada byte a byte.
CREATE FUNCTION app.chave_bloco(b text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(regexp_replace(b, '(?<![0-9])([0-9])(?![0-9])', '00\1', 'g'), '(?<![0-9])([0-9]{2})(?![0-9])', '0\1', 'g') COLLATE "C"
$$;

-- leiturasDoCodigo: "A-32" -> (A, 32); "T4-32" -> (T4, 32) e (4, 32). Separador obrigatório.
CREATE FUNCTION app.leituras_do_codigo(texto text) RETURNS TABLE (ordem integer, bloco text, numero text)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  m text[];
  b text;
  n text;
  leg text[];
BEGIN
  m := regexp_match(btrim(coalesce(texto, '')),
    '^(?:(?:bloco|torre)\s+)?([a-z0-9]{1,3})(?:\s*[-./·]\s*|\s+)(?:ap(?:to)?\.?\s*)?([0-9]{1,4})$', 'i');
  IF m IS NULL THEN RETURN; END IF;
  b := upper(btrim(m[1]));
  n := app.normalizar_numero(m[2]);
  IF n !~ '^(0[1-9]|[1-9][0-9]{1,3})$' THEN RETURN; END IF;
  ordem := 1; bloco := b; numero := n; RETURN NEXT;
  leg := regexp_match(b, '^T([0-9]{1,2})$');
  IF leg IS NOT NULL THEN ordem := 2; bloco := leg[1]; numero := n; RETURN NEXT; END IF;
END $$;

-- ===== Regras de negócio (porte de @portaria/domain/rules) =============================================================
CREATE FUNCTION app.e422(p_codigo text, p_mensagem text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT jsonb_build_object('status', 422, 'code', p_codigo, 'message', p_mensagem) $$;

-- vinculoValido, em datas de calendário BRT (a forma do vinculoValidoSql do legado; equivalente à do domain em ms).
CREATE FUNCTION app.vinculo_valido(p_status public.status_vinculo, p_inicio date, p_fim date, p_prazo date, p_hoje date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce((p_status = 'aprovado' AND (p_inicio IS NULL OR p_inicio <= p_hoje) AND (p_fim IS NULL OR p_fim >= p_hoje))
               OR (p_status = 'legado' AND p_prazo IS NOT NULL AND p_prazo >= p_hoje), false)
$$;

-- Um item de restricoesVigentes: não revogada, não expirada; de condomínio só aprovada; de unidade, só na unidade.
CREATE FUNCTION app.restricao_vigente(r public.restricao, p_pessoa uuid, p_unidade uuid, p_agora timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT r.pessoa_id = p_pessoa AND r.revogada_em IS NULL AND NOT (p_agora > r.valida_ate)
     AND CASE WHEN r.escopo = 'condominio' THEN r.aprovada_em IS NOT NULL
              ELSE p_unidade IS NOT NULL AND r.unidade_id = p_unidade END
$$;

-- estadoAutorizacaoPrevia.
CREATE FUNCTION app.estado_autorizacao(ap public.autorizacao_previa, p_agora timestamptz) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE m integer;
BEGIN
  IF ap.revogada_em IS NOT NULL THEN RETURN 'revogada'; END IF;
  IF p_agora > ap.valida_ate THEN RETURN 'expirada'; END IF;
  IF p_agora < ap.valida_de THEN RETURN 'ainda_nao_vale'; END IF;
  IF ap.dias_semana IS NOT NULL AND NOT (app.dow(p_agora)::smallint = ANY (ap.dias_semana)) THEN RETURN 'fora_da_janela'; END IF;
  IF ap.hora_inicio IS NOT NULL AND ap.hora_fim IS NOT NULL THEN
    m := app.minutos_do_dia(p_agora);
    IF m < app.hhmm_min(ap.hora_inicio) OR m > app.hhmm_min(ap.hora_fim) THEN RETURN 'fora_da_janela'; END IF;
  END IF;
  RETURN 'valida';
END $$;

-- proximaJanelaAutorizacao: primeira janela que intersecta [agora, agora + horizonte]. Sem janela: (NULL, NULL).
CREATE FUNCTION app.proxima_janela(ap public.autorizacao_previa, p_agora timestamptz, p_horizonte interval,
                                   OUT inicio timestamptz, OUT fim timestamptz)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  limite timestamptz := p_agora + p_horizonte;
  com_hora boolean := ap.hora_inicio IS NOT NULL AND ap.hora_fim IS NOT NULL;
  h_ini integer := CASE WHEN com_hora THEN app.hhmm_min(ap.hora_inicio) ELSE 0 END;
  h_fim integer := CASE WHEN com_hora THEN app.hhmm_min(ap.hora_fim) ELSE 0 END;
  dia timestamptz;
  i timestamptz;
  f timestamptz;
BEGIN
  IF ap.revogada_em IS NOT NULL OR p_horizonte < interval '0' THEN RETURN; END IF;
  IF com_hora AND h_fim < h_ini THEN RETURN; END IF;
  dia := app.inicio_do_dia(p_agora);
  WHILE dia <= limite LOOP
    IF ap.dias_semana IS NULL OR app.dow(dia)::smallint = ANY (ap.dias_semana) THEN
      i := greatest(CASE WHEN com_hora THEN dia + make_interval(mins => h_ini) ELSE dia END, ap.valida_de);
      f := least(CASE WHEN com_hora THEN dia + make_interval(mins => h_fim) + interval '59.999 seconds'
                      ELSE dia + interval '1 day' - interval '1 millisecond' END, ap.valida_ate);
      IF i <= f AND i <= limite AND f >= p_agora THEN inicio := i; fim := f; RETURN; END IF;
    END IF;
    dia := dia + interval '1 day';
  END LOOP;
END $$;

-- escalaVigente: turno que atravessa a meia-noite vale no dia do início.
CREATE FUNCTION app.escala_vigente(f public.funcionario, p_agora timestamptz) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  d smallint;
  m integer;
  ini integer;
  fim integer;
BEGIN
  IF f IS NULL OR f.pessoa_id IS NULL OR NOT f.ativo THEN RETURN false; END IF;
  d := app.dow(p_agora)::smallint;
  m := app.minutos_do_dia(p_agora);
  ini := app.hhmm_min(f.hora_inicio);
  fim := app.hhmm_min(f.hora_fim);
  IF fim >= ini THEN RETURN d = ANY (f.dias_semana) AND m >= ini AND m <= fim; END IF;
  RETURN (d = ANY (f.dias_semana) AND m >= ini) OR (((d + 6) % 7)::smallint = ANY (f.dias_semana) AND m <= fim);
END $$;

-- MEIOS_COM_MORADOR.
CREATE FUNCTION app.meio_com_morador(m public.meio_autorizacao) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT coalesce(m::text IN ('interfone', 'celular', 'morador_presente'), false) $$;

-- meiosAceitos(categoria, destino).
CREATE FUNCTION app.meios_aceitos(p_categoria public.categoria_pessoa, p_area_comum boolean) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_area_comum THEN ARRAY['autorizacao_previa', 'excecao_porteiro']
              WHEN p_categoria = 'funcionario' THEN ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala']
              ELSE ARRAY['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro'] END
$$;

/*
 * validarAutorizacaoEntrada (RN-01, RF-13, RF-17, RN-07, RF-36). NULL = permitido; senão {status, code, message}.
 * Pura: o contexto (moradores com vínculo válido, autorizações da pessoa para o destino, funcionário) vem por parâmetro,
 * exatamente como o ContextoAutorizacao do domain. A RPC monta o contexto com as travas e chama esta função.
 */
CREATE FUNCTION app.validar_autorizacao_entrada(
  p_categoria public.categoria_pessoa, p_unidade uuid, p_area uuid, p_meio public.meio_autorizacao, p_autorizador uuid,
  p_autorizacao_previa uuid, p_justificativa text, p_sem_cpf boolean, p_quando timestamptz, p_moradores uuid[],
  p_autorizacoes public.autorizacao_previa[], p_funcionario public.funcionario) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE ap public.autorizacao_previa;
BEGIN
  IF p_unidade IS NOT NULL AND p_area IS NOT NULL THEN RETURN app.e422('DESTINO_DUPLO', 'Informe a unidade OU a área comum, não as duas.'); END IF;
  IF p_area IS NOT NULL AND p_categoria <> 'prestador' THEN
    RETURN app.e422('AREA_COMUM_SO_PRESTADOR', 'Área comum só é destino de prestador de serviço (RF-36).');
  END IF;
  IF p_categoria <> 'funcionario' AND p_unidade IS NULL AND p_area IS NULL THEN
    RETURN app.e422('UNIDADE_OBRIGATORIA', 'Informe a unidade de destino.');
  END IF;
  IF p_categoria = 'morador' THEN RETURN NULL; END IF;
  IF p_meio IS NULL THEN RETURN app.e422('AUTORIZADO_POR_OBRIGATORIO', 'Informe quem autorizou a entrada (RN-01).'); END IF;
  IF coalesce(p_sem_cpf, false) AND p_meio <> 'excecao_porteiro' THEN
    RETURN app.e422('SEM_CPF_SO_EXCECAO', 'Pessoa cadastrada sem CPF só pode entrar por exceção do porteiro, com justificativa.');
  END IF;
  IF NOT (p_meio::text = ANY (app.meios_aceitos(p_categoria, p_area IS NOT NULL))) THEN
    RETURN app.e422('MEIO_INVALIDO_PARA_TIPO', CASE WHEN p_area IS NOT NULL
      THEN 'Na área comum a entrada é por autorização prévia da administração ou exceção do porteiro.'
      ELSE 'Este meio de autorização não se aplica ao tipo de pessoa.' END);
  END IF;
  IF app.meio_com_morador(p_meio) THEN
    IF p_autorizador IS NULL THEN RETURN app.e422('AUTORIZADO_POR_SEM_IDENTIFICACAO', 'Informe o morador que autorizou (nome obrigatório).'); END IF;
    IF NOT (p_autorizador = ANY (coalesce(p_moradores, ARRAY[]::uuid[]))) THEN
      RETURN app.e422('AUTORIZADOR_SEM_VINCULO', 'O autorizador não tem vínculo válido (aprovado ou legado no prazo) com a unidade.');
    END IF;
    RETURN NULL;
  END IF;
  IF p_meio = 'excecao_porteiro' THEN
    RETURN CASE WHEN app.justificativa_valida(p_justificativa) THEN NULL
      ELSE app.e422('JUSTIFICATIVA_OBRIGATORIA', 'A exceção exige justificativa de pelo menos 15 caracteres (RF-17).') END;
  END IF;
  IF p_meio = 'autorizacao_previa' THEN
    SELECT * INTO ap FROM unnest(coalesce(p_autorizacoes, ARRAY[]::public.autorizacao_previa[])) x
     WHERE x.id = p_autorizacao_previa LIMIT 1;
    IF ap.id IS NULL OR app.estado_autorizacao(ap, p_quando) <> 'valida' THEN
      RETURN app.e422('AUTORIZACAO_PREVIA_INVALIDA', 'Autorização prévia inexistente, vencida ou fora da janela de dias/horário (RN-07).');
    END IF;
    RETURN NULL;
  END IF;
  -- escala
  RETURN CASE WHEN app.escala_vigente(p_funcionario, p_quando) THEN NULL
    ELSE app.e422('ESCALA_FORA_DO_HORARIO', 'O funcionário não está em horário de escala.') END;
END $$;

-- validarDesativacaoPessoa: estado (409) -> motivo (422) -> dentro -> vínculo -> funcionário.
CREATE FUNCTION app.validar_desativacao_pessoa(p_anonimizada boolean, p_desativada boolean, p_motivo text,
                                               p_vinculo_valido boolean, p_dentro boolean, p_funcionario_ativo boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_anonimizada THEN jsonb_build_object('status', 409, 'code', 'PESSOA_ANONIMIZADA', 'message', 'Cadastro anonimizado não pode ser desativado.')
    WHEN p_desativada THEN jsonb_build_object('status', 409, 'code', 'PESSOA_JA_DESATIVADA', 'message', 'Este cadastro já está desativado.')
    WHEN NOT app.justificativa_valida(p_motivo) THEN app.e422('MOTIVO_OBRIGATORIO', 'Informe o motivo da desativação (pelo menos 15 caracteres).')
    WHEN p_dentro THEN app.e422('PESSOA_DENTRO', 'A pessoa consta como dentro do condomínio: registre a saída antes de desativar.')
    WHEN p_vinculo_valido THEN app.e422('PESSOA_COM_VINCULO_VALIDO', 'A pessoa tem vínculo válido com uma unidade: encerre o vínculo antes de desativar.')
    WHEN p_funcionario_ativo THEN app.e422('FUNCIONARIO_ATIVO', 'A pessoa é funcionário ativo: desative-a em Funcionários antes.')
  END
$$;

-- ----- Permanência (PRAZO_PADRAO_MIN, PRORROGACAO_MIN = 60, MAX_PRORROGACOES = 4, PERMANENCIA_MAXIMA_MS = 12 h) -------
CREATE FUNCTION app.tem_prazo_permanencia(c public.categoria_pessoa) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT c IN ('visitante', 'prestador') $$;

CREATE FUNCTION app.tipo_visita_padrao(c public.categoria_pessoa) RETURNS public.tipo_visita
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT (CASE WHEN c = 'prestador' THEN 'servico' ELSE 'visita' END)::public.tipo_visita $$;

CREATE FUNCTION app.prazo_inicial(p_tipo public.tipo_visita, p_entrada timestamptz, p_hora_fim time) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  prazo timestamptz := p_entrada + make_interval(mins => CASE p_tipo WHEN 'visita' THEN 240 WHEN 'entrega' THEN 30
                                                                     WHEN 'transporte_app' THEN 15 ELSE 480 END);
  fim timestamptz;
BEGIN
  IF p_tipo = 'servico' AND p_hora_fim IS NOT NULL THEN
    fim := app.inicio_do_dia(p_entrada) + make_interval(mins => app.hhmm_min(p_hora_fim));
    IF fim > p_entrada THEN prazo := fim; END IF;
  END IF;
  RETURN least(prazo, p_entrada + interval '12 hours');
END $$;

-- proximaProrrogacao: {ok: true, prazoAte} ou {ok: false, erro}.
CREATE FUNCTION app.proxima_prorrogacao(p_entrada timestamptz, p_prazo timestamptz, p_prorrogacoes integer, p_agora timestamptz) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE novo timestamptz;
BEGIN
  IF p_prorrogacoes >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'erro', app.e422('PRORROGACAO_LIMITE', 'Limite de 4 prorrogações atingido para esta entrada.'));
  END IF;
  novo := least(greatest(p_prazo, p_agora) + interval '60 minutes', p_entrada + interval '12 hours');
  IF novo <= p_prazo OR novo <= p_agora THEN
    RETURN jsonb_build_object('ok', false, 'erro', app.e422('PRORROGACAO_LIMITE', 'A permanência já chegou ao máximo de 12 h desde a entrada.'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'prazoAte', app.ms(novo));
END $$;

-- ===== Posse e EXECUTE (fail-closed) =====================================================================================
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
            WHERE p.pronamespace IN ('app'::regnamespace, 'api'::regnamespace, 'srv'::regnamespace) AND p.proowner <> 'app_rw'::regrole
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO app_rw', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $$;
