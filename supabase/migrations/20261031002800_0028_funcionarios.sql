-- 0028 — Funcionários e escala (F3, item 4; RF-09). Nova: não existe no legado Drizzle. Porte de
-- funcionarios.module.ts (eae0555): listar (funcionario.ver: SI, AD, AU; o porteiro NÃO, spec §14 decisão nº 29),
-- criar e editar (funcionario.gerenciar: SI, AD). A escala da pessoa na tela de entrada já existe (api.pessoa_funcionario,
-- 0022, evento.registrar).
--
-- Funcionário = pessoa (mesmas regras de CPF e telefone do cadastro) + função, escala e ativo. As regras do cadastro
-- (valoresNovaPessoa do legado) estavam dentro de api.pessoa_criar (0022); para não ter duas cópias, o corpo foi
-- MOVIDO, sem mudança, para app.inserir_pessoa_nova, e api.pessoa_criar é recriada aqui chamando o helper (a 0022 não é
-- editada; o pgTAP 07 continua cobrindo o cadastro). Regra do domain portada: validarEscala (paridade no vitest).

-- ===== validarEscala (porte de @portaria/domain/rules) =================================================================
-- Mensagem de erro ou NULL. Recebe a escala como veio no corpo (jsonb), para recusar dia não inteiro ou repetido como o TS.
CREATE FUNCTION app.validar_escala(e jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  d jsonb := e -> 'diasSemana';
  hh constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  ini text := CASE WHEN jsonb_typeof(e -> 'horaInicio') = 'string' THEN e ->> 'horaInicio' END;
  fim text := CASE WHEN jsonb_typeof(e -> 'horaFim') = 'string' THEN e ->> 'horaFim' END;
BEGIN
  IF d IS NULL OR jsonb_typeof(d) <> 'array' OR jsonb_array_length(d) NOT BETWEEN 1 AND 7 THEN RETURN 'Escolha de 1 a 7 dias da semana.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d) x WHERE jsonb_typeof(x) <> 'number' OR (x #>> '{}') !~ '^-?[0-9]+$'
                OR (x #>> '{}')::numeric NOT BETWEEN 0 AND 6)
     OR (SELECT count(DISTINCT x #>> '{}') FROM jsonb_array_elements(d) x) <> jsonb_array_length(d) THEN
    RETURN 'Dias da semana inválidos.';
  END IF;
  IF ini IS NULL OR fim IS NULL OR ini !~ hh OR fim !~ hh THEN RETURN 'Informe início e fim no formato HH:MM.'; END IF;
  IF ini = fim THEN RETURN 'O início e o fim da escala devem ser diferentes.'; END IF;
  RETURN NULL;
END $$;

-- ===== Cadastro de pessoa: o corpo de api.pessoa_criar (0022), agora compartilhado =====================================
CREATE FUNCTION app.inserir_pessoa_nova(a app.ator_t, nome text, cat text, doc text, tel text, empresa text, servico text,
                                        sem_cpf boolean, menor boolean) RETURNS public.pessoa
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  mascarado text;
  busca text;
  igual public.pessoa;
  nova public.pessoa;
BEGIN
  IF coalesce(nome, '') = '' THEN PERFORM app.erro(422, 'NOME_OBRIGATORIO', 'Informe o nome.'); END IF;
  IF menor AND cat <> 'morador' THEN PERFORM app.erro(422, 'MENOR_SO_MORADOR', 'Só dependente morador pode ser cadastrado como menor de idade.'); END IF;
  IF menor AND sem_cpf THEN
    PERFORM app.erro(422, 'MENOR_SEM_CPF_EXCECAO', 'Menor de idade não usa a exceção “sem CPF”: deixe o CPF em branco se ele não tiver.');
  END IF;
  IF NOT (menor AND tel = '') AND tel !~ '^[0-9]{10,11}$' THEN
    PERFORM app.erro(422, 'TELEFONE_INVALIDO', 'Informe o telefone com DDD (10 ou 11 dígitos).');
  END IF;
  IF cat = 'prestador' AND empresa IS NULL THEN PERFORM app.erro(422, 'EMPRESA_OBRIGATORIA', 'Prestador exige empresa (RF-36).'); END IF;

  IF menor AND doc = '' THEN
    SELECT * INTO igual FROM public.pessoa x WHERE x.menor_idade AND x.documento_busca IS NULL AND x.anonimizada_em IS NULL
       AND app.sem_acento(x.nome) = app.sem_acento(nome) LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro de menor sem CPF com este nome.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  ELSIF sem_cpf THEN
    SELECT * INTO igual FROM public.pessoa x WHERE x.sem_cpf AND x.telefone = tel AND app.sem_acento(x.nome) = app.sem_acento(nome) LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro sem CPF com este nome e telefone.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  ELSE
    IF doc = '' THEN PERFORM app.erro(422, 'DOCUMENTO_OBRIGATORIO', 'Informe o CPF.'); END IF;
    IF NOT app.cpf_valido(doc) THEN PERFORM app.erro(422, 'CPF_INVALIDO', 'CPF inválido (confira os dígitos).'); END IF;
    mascarado := app.mascarar_cpf(doc, app.formato_cpf_novo(doc));
    busca := public.cpf_hmac(doc);
    SELECT * INTO igual FROM public.pessoa x WHERE x.documento_busca = busca LIMIT 1;
    IF igual.id IS NOT NULL THEN PERFORM app.erro_duplicada(a, 'Já existe cadastro com este CPF.', igual.id, igual.desativada_em IS NOT NULL); END IF;
  END IF;

  BEGIN
    INSERT INTO public.pessoa (nome, categoria, sem_cpf, menor_idade, documento_mascarado, documento_busca, telefone, empresa, servico, criado_em, atualizado_em)
    VALUES (nome, cat::public.categoria_pessoa, sem_cpf, menor, mascarado, busca, nullif(tel, ''), empresa, servico, now(), now())
    RETURNING * INTO nova;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', 'Já existe cadastro com este CPF.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.criar', 'pessoa', nova.id, NULL, NULL, app.snapshot(to_jsonb(nova)));
  RETURN nova;
END $$;

-- api.pessoa_criar com o mesmo contrato e a mesma ordem de checagens da 0022 (só o corpo foi para o helper).
CREATE OR REPLACE FUNCTION api.pessoa_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.cadastrar_externo');
  q jsonb := app.j_objeto(p);
  nome text := app.aparar(app.j_texto(q, 'nome', 150));
  cat text := app.j_enum(q, 'categoria', ARRAY['visitante', 'prestador', 'morador', 'funcionario']);
  doc text := app.so_digitos(app.j_texto(q, 'documento', 20));
  tel text := app.so_digitos(app.j_texto(q, 'telefone', 20));
  empresa text := app.vazio_para_nulo(app.j_texto(q, 'empresa', 150));
  servico text := app.vazio_para_nulo(app.j_texto(q, 'servico', 150));
  sem_cpf boolean := coalesce(app.j_bool(q, 'semCpf'), false);
  menor boolean := coalesce(app.j_bool(q, 'menorIdade'), false);
BEGIN
  IF cat IS NULL THEN PERFORM app.invalido('categoria', 'Informe a categoria.'); END IF;
  IF cat IN ('morador', 'funcionario') THEN
    PERFORM app.negar_se_nao_pode(a, 'pessoa.cadastrar_morador', 'Seu perfil só cadastra visitante e prestador.');
  END IF;
  RETURN app.pessoa_json(app.inserir_pessoa_nova(a, nome, cat, doc, tel, empresa, servico, sem_cpf, menor));
END $$;

-- ===== Funcionário ===================================================================================================
-- FuncionarioView: o funcionário (funcionario_json, 0022) + a pessoa (sem telefone nem HMAC) + se está em escala agora.
CREATE FUNCTION app.funcionario_view(f public.funcionario) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT app.funcionario_json(f) || jsonb_build_object('pessoa', app.pessoa_json(p), 'emEscalaAgora', app.escala_vigente(f, now()))
    FROM public.pessoa p WHERE p.id = f.pessoa_id
$$;

-- Escala normalizada do corpo (dias ordenados) ou 422 ESCALA_INVALIDA com a mensagem do domain.
CREATE FUNCTION app.j_escala(p jsonb, OUT dias smallint[], OUT ini time, OUT fim time)
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  e jsonb := p -> 'escala';
  erro text;
BEGIN
  IF e IS NULL OR jsonb_typeof(e) <> 'object' THEN PERFORM app.invalido('escala', 'Escala inválida.'); END IF;
  IF (e ? 'horaInicio' AND jsonb_typeof(e -> 'horaInicio') <> 'string') OR (e ? 'horaFim' AND jsonb_typeof(e -> 'horaFim') <> 'string')
     OR length(e ->> 'horaInicio') > 5 OR length(e ->> 'horaFim') > 5 THEN
    PERFORM app.invalido('escala', 'Escala inválida.');
  END IF;
  erro := app.validar_escala(e);
  IF erro IS NOT NULL THEN PERFORM app.erro(422, 'ESCALA_INVALIDA', erro); END IF;
  dias := ARRAY(SELECT (x #>> '{}')::smallint FROM jsonb_array_elements(e -> 'diasSemana') x ORDER BY 1);
  ini := (e ->> 'horaInicio')::time;
  fim := (e ->> 'horaFim')::time;
END $$;

-- Lista (nome da pessoa, id). Cursor = pessoa_id do último da página.
CREATE FUNCTION api.funcionarios_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('funcionario.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  cur uuid := app.j_uuid(q, 'cursor');
  c public.pessoa;
  itens jsonb;
  n integer;
BEGIN
  IF cur IS NOT NULL THEN
    SELECT x.* INTO c FROM public.pessoa x JOIN public.funcionario f ON f.pessoa_id = x.id WHERE x.id = cur;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH pagina AS (
    SELECT f.pessoa_id, row_number() OVER (ORDER BY x.nome, x.id) AS i FROM public.funcionario f JOIN public.pessoa x ON x.id = f.pessoa_id
     WHERE cur IS NULL OR (x.nome, x.id) > (c.nome, c.id)
     ORDER BY x.nome, x.id LIMIT lim + 1
  )
  SELECT coalesce(jsonb_agg(app.funcionario_view(f) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(*)
    INTO itens, n FROM pagina pg JOIN public.funcionario f ON f.pessoa_id = pg.pessoa_id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'pessoaId' END);
END $$;

-- RF-09: pessoa (categoria funcionario) + funcionário, numa transação, com as duas linhas na trilha.
CREATE FUNCTION api.funcionario_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('funcionario.gerenciar');
  q jsonb := app.j_objeto(p);
  nome text := app.aparar(coalesce(app.j_texto(q, 'nome', 150), ''));
  doc text := app.so_digitos(app.j_texto(q, 'documento', 20));
  tel text := app.so_digitos(app.j_texto(q, 'telefone', 20));
  funcao text := app.aparar(coalesce(app.j_texto(q, 'funcao', 80), ''));
  ativo boolean := coalesce(app.j_bool(q, 'ativo'), true);
  e record;
  x public.pessoa;
  f public.funcionario;
BEGIN
  IF NOT (q ? 'nome' AND q ? 'documento' AND q ? 'telefone' AND q ? 'funcao' AND q ? 'escala') THEN
    PERFORM app.invalido('corpo', 'Informe nome, documento, telefone, função e escala.');
  END IF;
  IF funcao = '' THEN PERFORM app.erro(422, 'FUNCAO_OBRIGATORIA', 'Informe a função.'); END IF;
  e := app.j_escala(q);
  x := app.inserir_pessoa_nova(a, nome, 'funcionario', doc, tel, NULL, NULL, false, false);
  INSERT INTO public.funcionario (pessoa_id, funcao, dias_semana, hora_inicio, hora_fim, ativo, criado_em, atualizado_em)
  VALUES (x.id, funcao, e.dias, e.ini, e.fim, ativo, now(), now()) RETURNING * INTO f;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'funcionario.criar', 'funcionario', x.id, NULL, NULL, app.snapshot(to_jsonb(f)));
  RETURN app.funcionario_view(f);
END $$;

-- Função, escala e ativo. Campo ausente não muda; nada mudou: sem trilha.
CREATE FUNCTION api.funcionario_editar(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('funcionario.gerenciar');
  q jsonb := app.j_objeto(p);
  antes public.funcionario;
  novo public.funcionario;
  depois public.funcionario;
  e record;
  v_funcao text;
  v_ativo boolean := app.j_bool(q, 'ativo');
BEGIN
  SELECT * INTO antes FROM public.funcionario WHERE pessoa_id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'FUNCIONARIO_NAO_ENCONTRADO', 'Funcionário não encontrado.'); END IF;
  novo := antes;
  IF q ? 'funcao' THEN
    v_funcao := app.aparar(coalesce(app.j_texto(q, 'funcao', 80), ''));
    IF v_funcao = '' THEN PERFORM app.erro(422, 'FUNCAO_OBRIGATORIA', 'Informe a função.'); END IF;
    novo.funcao := v_funcao;
  END IF;
  IF q ? 'escala' THEN
    e := app.j_escala(q);
    novo.dias_semana := e.dias; novo.hora_inicio := e.ini; novo.hora_fim := e.fim;
  END IF;
  IF v_ativo IS NOT NULL THEN novo.ativo := v_ativo; END IF;
  IF (novo.funcao, novo.dias_semana, novo.hora_inicio, novo.hora_fim, novo.ativo)
     IS NOT DISTINCT FROM (antes.funcao, antes.dias_semana, antes.hora_inicio, antes.hora_fim, antes.ativo) THEN
    RETURN app.funcionario_view(antes);
  END IF;
  UPDATE public.funcionario SET funcao = novo.funcao, dias_semana = novo.dias_semana, hora_inicio = novo.hora_inicio, hora_fim = novo.hora_fim,
         ativo = novo.ativo, atualizado_em = now()
   WHERE pessoa_id = p_id RETURNING * INTO depois;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'funcionario.editar', 'funcionario', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.funcionario_view(depois);
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

-- CREATE OR REPLACE mantém o dono e os GRANTs de api.pessoa_criar (0022); reafirmado aqui por clareza.
GRANT EXECUTE ON FUNCTION
  api.pessoa_criar(jsonb), api.funcionarios_listar(jsonb), api.funcionario_criar(jsonb), api.funcionario_editar(uuid, jsonb)
TO authenticated;
