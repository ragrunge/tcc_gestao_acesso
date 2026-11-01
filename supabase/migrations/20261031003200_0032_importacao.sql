-- 0032 — Importação da planilha de moradores (F3, item 7; RF-11, RN-09). Nova: não existe no legado Drizzle. Porte de
-- importacao.module.ts (eae0555). A planilha é lida no front (read-excel-file); as RPCs recebem as LINHAS no corpo do POST.
--
-- Regras (as mesmas do legado):
--   * unidade inexistente ou desativada e nome ausente: erro, linha não importada;
--   * duplicidade NA PLANILHA (mesmo CPF válido na mesma unidade; sem CPF, mesmo nome na mesma unidade): aviso, consolidado;
--   * sem CPF ou CPF inválido: aviso; importa como legado "sem CPF" (o número inválido não é gravado);
--   * deduplicação com o banco pelo HMAC do CPF; sem CPF, pelo nome com vínculo na MESMA unidade (nunca só pelo nome);
--   * cadastro desativado não recebe vínculo (erro, com a orientação de reativar);
--   * quem já tem vínculo ativo ou pendente na unidade é reaproveitado, sem duplicar;
--   * o resto vira pessoa (se ainda não existe) + vínculo LEGADO com prazo de regularização (RN-09).
--
-- As linhas têm CPF em claro: o banco NÃO as guarda entre a análise e a confirmação. O cliente reenvia as linhas no
-- confirmar, e o banco confere a "impressão" delas com a gravada na análise: HMAC-SHA256 com a chave do CPF (Vault) e a
-- separação de domínio "importacao:v1|" (não é SHA puro: o de uma planilha de uma linha se reverteria por força bruta).
-- A confirmação reprocessa as linhas contra o banco de AGORA, na mesma transação das escritas.
--
-- DIVERGÊNCIA: o prazo de regularização era configurável por env (IMPORTACAO_PRAZO_LEGADO_DIAS, padrão 90). Não há env no
-- banco: fica o padrão do legado, 90 dias (app.prazo_legado_dias), até o usuário decidir onde configurar.

-- ===== Impressão das linhas (HMAC com a chave do Vault, domínio importacao:v1) =========================================
-- Dono postgres (lê o Vault), só app_rw executa. Não é oráculo do CPF: a entrada sempre leva o prefixo de domínio.
CREATE FUNCTION public.importacao_impressao(p_canon text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'portaria_hmac_cpf_v1';
  IF k IS NULL THEN RAISE EXCEPTION 'chave portaria_hmac_cpf_v1 ausente no Vault'; END IF;
  RETURN encode(extensions.hmac(convert_to('importacao:v1|' || coalesce(p_canon, ''), 'UTF8'), decode(k, 'hex'), 'sha256'), 'hex');
END $$;
REVOKE ALL ON FUNCTION public.importacao_impressao(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.importacao_impressao(text) TO app_rw;

CREATE FUNCTION app.prazo_legado_dias() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 90 $$;

-- ===== Regras da planilha (porte de @portaria/domain/units e do legado) ===============================================
-- leiturasDoBloco: "A", "bloco a", "Torre 4", "4" e o antigo "T4" -> blocos possíveis, o literal primeiro ("T4" -> T4, 4).
CREATE FUNCTION app.leituras_do_bloco(p_celula text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN b ~ '^T[0-9]{1,2}$' THEN ARRAY[b, substr(b, 2)] ELSE ARRAY[b] END
    FROM (SELECT app.normalizar_bloco(regexp_replace(coalesce(p_celula, ''), '^\s*(bloco|torre)\y\s*', '', 'i')) AS b) x
$$;

-- tipoDaLinha (importacao.module.ts): "inquil..." -> inquilino; "depend..." -> dependente; o resto, proprietário.
CREATE FUNCTION app.tipo_da_linha(t text) RETURNS public.tipo_vinculo
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (CASE WHEN coalesce(t, '') ~* 'inquil' THEN 'inquilino' WHEN coalesce(t, '') ~* 'depend' THEN 'dependente' ELSE 'proprietario' END)::public.tipo_vinculo
$$;

-- Documento da amostra devolvida: nunca o CPF em claro (11 dígitos -> máscara nova; outro tamanho -> bolinhas).
CREATE FUNCTION app.documento_da_amostra(doc text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN d = '' THEN '' WHEN length(d) = 11 THEN app.mascarar_cpf(d, 'inicio') ELSE regexp_replace(d, '[0-9]', '•', 'g') END
    FROM (SELECT app.so_digitos(doc) AS d) x
$$;

-- Máscaras no formato antigo já em uso (pessoa e snapshots do audit_log): uma consulta para o lote (regra anti-reconstrução,
-- formato-cpf.ts). Mesmo critério de app.formato_cpf_novo, sem varrer o audit_log uma vez por linha.
CREATE FUNCTION app.mascaras_antigas_em_uso() RETURNS text[]
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT m), ARRAY[]::text[]) FROM (
    SELECT documento_mascarado AS m FROM public.pessoa WHERE documento_mascarado LIKE '***.%'
    UNION ALL
    SELECT (regexp_matches(coalesce(antes::text, '') || ' ' || coalesce(depois::text, ''), '\*\*\*\.[0-9]{3}\.[0-9]{3}-\*\*', 'g'))[1]
      FROM public.audit_log WHERE coalesce(antes::text, '') || coalesce(depois::text, '') LIKE '%***.%') x
$$;

-- Linhas do corpo, validadas (1 a 3000; mesmos tetos do zod do legado). Devolve as linhas na ordem.
CREATE FUNCTION app.j_linhas(q jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE l jsonb := q -> 'linhas';
BEGIN
  IF l IS NULL OR jsonb_typeof(l) <> 'array' OR jsonb_array_length(l) NOT BETWEEN 1 AND 3000 THEN
    PERFORM app.invalido('linhas', 'Envie de 1 a 3000 linhas.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(l) x WHERE jsonb_typeof(x) <> 'object'
       OR jsonb_typeof(x -> 'linha') IS DISTINCT FROM 'number' OR (x ->> 'linha') !~ '^[0-9]+$' OR (x ->> 'linha')::numeric > 1000000
       OR jsonb_typeof(x -> 'bloco') IS DISTINCT FROM 'string' OR length(x ->> 'bloco') > 20
       OR jsonb_typeof(x -> 'unidade') IS DISTINCT FROM 'string' OR length(x ->> 'unidade') > 20
       OR jsonb_typeof(x -> 'nome') IS DISTINCT FROM 'string' OR length(x ->> 'nome') > 150
       OR jsonb_typeof(x -> 'documento') IS DISTINCT FROM 'string' OR length(x ->> 'documento') > 30
       OR jsonb_typeof(x -> 'telefone') IS DISTINCT FROM 'string' OR length(x ->> 'telefone') > 30
       OR (x ? 'tipo' AND jsonb_typeof(x -> 'tipo') NOT IN ('string', 'null')) OR length(x ->> 'tipo') > 40
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('linha', 'bloco', 'unidade', 'nome', 'documento', 'telefone', 'tipo'))) THEN
    PERFORM app.invalido('linhas', 'Linha da planilha inválida.');
  END IF;
  RETURN l;
END $$;

-- Impressão: JSON canônico das linhas (ordem fixa de campos), com HMAC. Determinístico para as mesmas linhas.
CREATE FUNCTION app.impressao_linhas(l jsonb) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.importacao_impressao(coalesce((SELECT json_agg(json_build_array((x ->> 'linha')::bigint, x ->> 'bloco', x ->> 'unidade', x ->> 'nome',
           x ->> 'documento', x ->> 'telefone', x ->> 'tipo') ORDER BY i)::text FROM jsonb_array_elements(l) WITH ORDINALITY t(x, i)), '[]'))
$$;

/*
 * As regras da planilha contra o banco de agora: { inconsistencias, validas, rejeitadas }. `validas`: uma por pessoa+unidade,
 * com o que a confirmação grava (hmac/máscara/telefone/tipo, pessoa existente e se reaproveita). Nada é gravado aqui.
 */
CREATE FUNCTION app.analisar_linhas(l jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  x jsonb;
  ord integer := 0;
  inc jsonb := '[]';
  cand jsonb := '[]';
  vistos text[] := ARRAY[]::text[];
  antigas text[] := app.mascaras_antigas_em_uso();
  duplicadas integer := 0;
  numero text;
  un public.unidade;
  b text;
  nome text;
  codigo text;
  dig text;
  cpf_ok boolean;
  hmac text;
  chave text;
  tel text;
  tel_ok boolean;
  c jsonb;
  existente uuid;
  desativada boolean;
  reaproveitar boolean;
  validas jsonb := '[]';
BEGIN
  FOR x IN SELECT * FROM jsonb_array_elements(l) LOOP
    ord := ord + 1;
    numero := app.normalizar_numero(app.so_digitos(x ->> 'unidade'));
    un := NULL;
    FOREACH b IN ARRAY app.leituras_do_bloco(x ->> 'bloco') LOOP
      SELECT * INTO un FROM public.unidade u WHERE u.ativo AND u.bloco = b AND u.numero = numero;
      EXIT WHEN un.id IS NOT NULL;
    END LOOP;
    IF un.id IS NULL THEN
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'UNIDADE_INEXISTENTE', 'tipo', 'erro',
        'mensagem', 'Unidade ' || (x ->> 'bloco') || '/' || (x ->> 'unidade') || ' não existe no condomínio (ou está desativada). Linha não importada.');
      CONTINUE;
    END IF;
    nome := app.aparar(x ->> 'nome');
    IF nome = '' THEN
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'NOME_AUSENTE', 'tipo', 'erro', 'mensagem', 'Nome ausente. Linha não importada.');
      CONTINUE;
    END IF;
    codigo := app.codigo_unidade(un.bloco, un.numero);
    dig := app.so_digitos(x ->> 'documento');
    cpf_ok := app.cpf_valido(dig);
    hmac := CASE WHEN cpf_ok THEN public.cpf_hmac(dig) END;
    chave := CASE WHEN hmac IS NOT NULL THEN 'cpf|' || hmac || '|' || un.id ELSE app.sem_acento(nome) || '|' || un.id END;
    IF chave = ANY (vistos) THEN
      duplicadas := duplicadas + 1;
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'DUPLICIDADE_PLANILHA', 'tipo', 'aviso',
        'mensagem', nome || ' aparece duas vezes na unidade ' || codigo || '. Consolidado.');
      CONTINUE;
    END IF;
    vistos := vistos || chave;
    IF dig = '' THEN
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'DOC_AUSENTE', 'tipo', 'aviso',
        'mensagem', nome || ': sem CPF. Importado como legado, pendente de regularização (RN-09).');
    ELSIF NOT cpf_ok THEN
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'DOC_INVALIDO', 'tipo', 'aviso',
        'mensagem', nome || ': CPF inválido. O número não será gravado; importado como legado, pendente de regularização (RN-09).');
    END IF;
    tel := app.so_digitos(x ->> 'telefone');
    tel_ok := tel ~ '^[0-9]{10,11}$';
    IF app.aparar(x ->> 'telefone') <> '' AND NOT tel_ok THEN
      inc := inc || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'codigo', 'TELEFONE_INVALIDO', 'tipo', 'aviso',
        'mensagem', nome || ': telefone fora do padrão (DDD + 8 ou 9 dígitos). Importado sem telefone.');
    END IF;
    cand := cand || jsonb_build_object('linha', (x ->> 'linha')::bigint, 'o', ord, 'unidadeId', un.id, 'codigo', codigo, 'nome', nome,
      'hmac', hmac, 'mascarado', CASE WHEN cpf_ok THEN app.mascarar_cpf(dig, CASE WHEN app.mascarar_cpf(dig, 'meio') = ANY (antigas) THEN 'meio' ELSE 'inicio' END) END,
      'telefone', CASE WHEN tel_ok THEN tel END, 'tipo', app.tipo_da_linha(x ->> 'tipo'));
  END LOOP;

  -- Quem já existe: pelo HMAC; sem CPF, pelo nome com algum vínculo NA MESMA unidade (nunca só pelo nome).
  FOR c IN SELECT * FROM jsonb_array_elements(cand) LOOP
    existente := NULL;
    desativada := false;
    IF c ->> 'hmac' IS NOT NULL THEN
      SELECT p.id, p.desativada_em IS NOT NULL INTO existente, desativada FROM public.pessoa p WHERE p.documento_busca = c ->> 'hmac';
    ELSE
      SELECT p.id, p.desativada_em IS NOT NULL INTO existente, desativada FROM public.vinculo_unidade v JOIN public.pessoa p ON p.id = v.pessoa_id
       WHERE v.unidade_id = (c ->> 'unidadeId')::uuid AND app.sem_acento(app.aparar(p.nome)) = app.sem_acento(c ->> 'nome')
       ORDER BY v.registrado_em, v.id LIMIT 1;
    END IF;
    IF existente IS NOT NULL AND desativada THEN
      inc := inc || jsonb_build_object('linha', (c ->> 'linha')::bigint, 'o', (c ->> 'o')::integer, 'codigo', 'PESSOA_DESATIVADA', 'tipo', 'erro',
        'mensagem', (c ->> 'nome') || ': cadastro desativado. Reative a pessoa (ficha, em Pessoas) e importe de novo. Linha não importada.');
      CONTINUE;
    END IF;
    reaproveitar := existente IS NOT NULL AND EXISTS (SELECT 1 FROM public.vinculo_unidade v WHERE v.pessoa_id = existente
                      AND v.unidade_id = (c ->> 'unidadeId')::uuid AND v.status IN ('pendente', 'aprovado', 'legado'));
    IF reaproveitar THEN
      inc := inc || jsonb_build_object('linha', (c ->> 'linha')::bigint, 'o', (c ->> 'o')::integer, 'codigo', 'DUPLICIDADE_BANCO', 'tipo', 'aviso',
        'mensagem', (c ->> 'nome') || ' já possui vínculo com ' || (c ->> 'codigo') || '. Reaproveitado, sem duplicar.');
    END IF;
    validas := validas || (c || jsonb_build_object('existenteId', existente, 'reaproveitar', reaproveitar));
  END LOOP;

  RETURN jsonb_build_object(
    'inconsistencias', coalesce((SELECT jsonb_agg(i - 'o' ORDER BY (i ->> 'linha')::bigint, (i ->> 'o')::integer) FROM jsonb_array_elements(inc) i), '[]'),
    'validas', validas, 'rejeitadas', jsonb_array_length(l) - jsonb_array_length(validas) - duplicadas);
END $$;

-- ===== RPCs (importacao.executar: SI, AD) ==============================================================================
CREATE FUNCTION api.importacao_analisar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('importacao.executar');
  q jsonb := app.j_objeto(p);
  v_arquivo text := app.aparar(coalesce(app.j_texto(q, 'arquivo', 400), ''));
  l jsonb := app.j_linhas(q);
  r jsonb;
  prazo date := app.dia_brt(now()) + app.prazo_legado_dias();
  avisos integer;
  imp public.importacao;
BEGIN
  IF v_arquivo = '' OR length(v_arquivo) > 200 THEN PERFORM app.invalido('arquivo', 'Informe o nome do arquivo (até 200 caracteres).'); END IF;
  r := app.analisar_linhas(l);
  avisos := (SELECT count(*) FROM jsonb_array_elements(r -> 'inconsistencias') i WHERE i ->> 'tipo' = 'aviso');
  INSERT INTO public.importacao (arquivo_nome, arquivo_sha256, status, lidas, importaveis, rejeitadas, avisos, prazo_regularizacao, executada_por_id, analisada_em)
  VALUES (v_arquivo, app.impressao_linhas(l), 'analisada', jsonb_array_length(l), jsonb_array_length(r -> 'validas'), (r ->> 'rejeitadas')::integer,
          avisos, prazo, a.usuario_id, now())
  RETURNING * INTO imp;
  INSERT INTO public.importacao_inconsistencia (importacao_id, linha, codigo, mensagem, tipo)
  SELECT imp.id, (i ->> 'linha')::integer, i ->> 'codigo', i ->> 'mensagem', (i ->> 'tipo')::public.tipo_inconsistencia
    FROM jsonb_array_elements(r -> 'inconsistencias') i;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'importacao.analisar', 'importacao', imp.id, NULL, NULL,
    jsonb_build_object('arquivo_nome', imp.arquivo_nome, 'status', imp.status, 'lidas', imp.lidas, 'importaveis', imp.importaveis,
      'rejeitadas', imp.rejeitadas, 'avisos', avisos));
  RETURN jsonb_build_object('id', imp.id, 'arquivo', imp.arquivo_nome, 'status', imp.status, 'lidas', imp.lidas, 'importaveis', imp.importaveis,
    'rejeitadas', imp.rejeitadas, 'avisos', avisos, 'inconsistencias', r -> 'inconsistencias',
    'amostra', coalesce((SELECT jsonb_agg(x || jsonb_build_object('documento', app.documento_da_amostra(x ->> 'documento')) ORDER BY i)
      FROM jsonb_array_elements(l) WITH ORDINALITY t(x, i) WHERE i <= 8), '[]'),
    'prazoRegularizacao', app.ms(app.inicio_da_data(prazo)));
END $$;

CREATE FUNCTION api.importacao_confirmar(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('importacao.executar');
  q jsonb := app.j_objeto(p);
  l jsonb := app.j_linhas(q);
  imp public.importacao;
  r jsonb;
  x jsonb;
  criadas jsonb := '{}';
  pid uuid;
  np public.pessoa;
  nv public.vinculo_unidade;
  importados integer := 0;
  reaproveitados integer := 0;
BEGIN
  SELECT * INTO imp FROM public.importacao WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'IMPORTACAO_NAO_ENCONTRADA', 'Análise de importação não encontrada. Envie o arquivo novamente.'); END IF;
  IF imp.status <> 'analisada' THEN PERFORM app.erro(409, 'IMPORTACAO_JA_CONFIRMADA', 'Esta importação já foi confirmada ou cancelada.'); END IF;
  IF app.impressao_linhas(l) <> imp.arquivo_sha256 THEN
    PERFORM app.erro(409, 'IMPORTACAO_DIVERGENTE', 'As linhas enviadas não são as da análise. Envie o arquivo novamente.');
  END IF;
  r := app.analisar_linhas(l);
  BEGIN
    FOR x IN SELECT * FROM jsonb_array_elements(r -> 'validas') LOOP
      IF (x ->> 'reaproveitar')::boolean THEN reaproveitados := reaproveitados + 1; CONTINUE; END IF;
      pid := coalesce((x ->> 'existenteId')::uuid, CASE WHEN x ->> 'hmac' IS NOT NULL THEN (criadas ->> (x ->> 'hmac'))::uuid END);
      IF pid IS NULL THEN
        INSERT INTO public.pessoa (nome, categoria, sem_cpf, documento_mascarado, documento_busca, telefone, importacao_id, criado_em, atualizado_em)
        VALUES (x ->> 'nome', 'morador', x ->> 'hmac' IS NULL, x ->> 'mascarado', x ->> 'hmac', x ->> 'telefone', p_id, now(), now())
        RETURNING * INTO np;
        pid := np.id;
        IF x ->> 'hmac' IS NOT NULL THEN criadas := criadas || jsonb_build_object(x ->> 'hmac', pid); END IF;
        PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.criar', 'pessoa', pid, NULL, NULL,
          app.snapshot(to_jsonb(np) || jsonb_build_object('origem', 'importacao')));
      END IF;
      INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, prazo_regularizacao, registrado_por_id, registrado_em, importacao_id, atualizado_em)
      VALUES (pid, (x ->> 'unidadeId')::uuid, (x ->> 'tipo')::public.tipo_vinculo, 'legado', imp.prazo_regularizacao, a.usuario_id, now(), p_id, now())
      RETURNING * INTO nv;
      importados := importados + 1;
      PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'vinculo.criar', 'vinculo_unidade', nv.id, NULL, NULL,
        app.snapshot(to_jsonb(nv) || jsonb_build_object('origem', 'importacao')));
    END LOOP;
    UPDATE public.importacao SET status = 'confirmada', importados = importados, reaproveitados = reaproveitados, confirmada_em = now()
     WHERE id = p_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra escrita criou a mesma pessoa ou vínculo entre a leitura e o INSERT: nada foi gravado.
    PERFORM app.erro(409, 'IMPORTACAO_CONFLITO', 'Outro cadastro foi feito ao mesmo tempo. Confirme a importação de novo.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'importacao.confirmar', 'importacao', p_id, NULL, jsonb_build_object('status', imp.status),
    jsonb_build_object('status', 'confirmada', 'importados', importados, 'reaproveitados', reaproveitados));
  RETURN jsonb_build_object('importados', importados, 'reaproveitados', reaproveitados, 'prazoRegularizacao', app.ms(app.inicio_da_data(imp.prazo_regularizacao)));
END $$;

-- ===== Posse e EXECUTE (fail-closed) =====================================================================================
-- A impressão é do public (dono postgres): o laço da 0020 fixa search_path só do que não tem; esta já nasce com ''.
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

GRANT EXECUTE ON FUNCTION api.importacao_analisar(jsonb), api.importacao_confirmar(uuid, jsonb) TO authenticated;
