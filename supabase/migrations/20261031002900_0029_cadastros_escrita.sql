-- 0029 — Escritas de cadastro que a F2 deixou como NAO_MIGRADO (F3, item 5): veículos (RF-08), correção de pessoa
-- (pessoa.editar, RN-09, LGPD art. 18) e unidades (RF-01: criar, editar, desativar, reativar). Nova: não existe no
-- legado Drizzle. Porte de veiculos.module.ts, pessoas.service.ts (editar), formato-cpf.ts e unidades.service.ts (eae0555).
-- Toda escrita grava audit_log na mesma transação (RN-11) e nada é apagado (desativar/reativar).
-- Regra do domain portada aqui: validarEstruturaUnidade (+ normalizarBloco), com teste de paridade.

-- ===== Veículos (RF-08; veiculo.cadastrar: SI, AD) =====================================================================
CREATE FUNCTION app.veiculo_json(v public.veiculo) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', v.id, 'unidadeId', v.unidade_id, 'placa', v.placa, 'modelo', v.modelo, 'cor', v.cor, 'ativo', v.ativo)
$$;

-- Placa antiga ou Mercosul, maiúsculas sem separador; 422 fora do padrão.
CREATE FUNCTION app.placa_ou_erro(t text) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE p text := app.normalizar_placa(t);
BEGIN
  IF p IS NULL THEN PERFORM app.erro(422, 'PLACA_INVALIDA', 'Placa fora do padrão antigo ou Mercosul.'); END IF;
  RETURN p;
END $$;

CREATE FUNCTION app.obrigatorio(t text, p_codigo text, p_mensagem text) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v text := app.aparar(coalesce(t, ''));
BEGIN
  IF v = '' THEN PERFORM app.erro(422, p_codigo, p_mensagem); END IF;
  RETURN v;
END $$;

CREATE FUNCTION api.veiculo_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('veiculo.cadastrar');
  q jsonb := app.j_objeto(p);
  v_unidade uuid := app.j_uuid(q, 'unidadeId');
  v_placa text := app.j_texto(q, 'placa', 10);
  v_modelo text := app.j_texto(q, 'modelo', 60);
  v_cor text := app.j_texto(q, 'cor', 30);
  novo public.veiculo;
BEGIN
  IF v_unidade IS NULL THEN PERFORM app.invalido('unidadeId', 'unidade inválida'); END IF;
  IF v_placa IS NULL OR v_modelo IS NULL OR v_cor IS NULL THEN PERFORM app.invalido('corpo', 'Informe placa, modelo e cor.'); END IF;
  v_placa := app.placa_ou_erro(v_placa);
  v_modelo := app.obrigatorio(v_modelo, 'MODELO_OBRIGATORIO', 'Informe o modelo.');
  v_cor := app.obrigatorio(v_cor, 'COR_OBRIGATORIA', 'Informe a cor.');
  PERFORM app.unidade_para_novo_uso(v_unidade);
  BEGIN
    INSERT INTO public.veiculo (unidade_id, placa, modelo, cor, criado_em) VALUES (v_unidade, v_placa, v_modelo, v_cor, now()) RETURNING * INTO novo;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro(409, 'PLACA_DUPLICADA', 'Placa já cadastrada em outro veículo ativo.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'veiculo.criar', 'veiculo', novo.id, NULL, NULL, app.snapshot(app.veiculo_json(novo)));
  RETURN app.veiculo_json(novo);
END $$;

-- Placa, modelo, cor e ativo. A unidade não muda. Reativar conta como novo uso (unidade ativa). desativado_em é do
-- trigger marcar_desativacao (0007): fato gerador da retenção do veículo.
CREATE FUNCTION api.veiculo_editar(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('veiculo.cadastrar');
  q jsonb := app.j_objeto(p);
  v_placa text := app.j_texto(q, 'placa', 10);
  v_modelo text := app.j_texto(q, 'modelo', 60);
  v_cor text := app.j_texto(q, 'cor', 30);
  v_ativo boolean := app.j_bool(q, 'ativo');
  antes public.veiculo;
  novo public.veiculo;
  depois public.veiculo;
BEGIN
  SELECT * INTO antes FROM public.veiculo WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'VEICULO_NAO_ENCONTRADO', 'Veículo não encontrado.'); END IF;
  novo := antes;
  IF v_placa IS NOT NULL THEN novo.placa := app.placa_ou_erro(v_placa); END IF;
  IF v_modelo IS NOT NULL THEN novo.modelo := app.obrigatorio(v_modelo, 'MODELO_OBRIGATORIO', 'Informe o modelo.'); END IF;
  IF v_cor IS NOT NULL THEN novo.cor := app.obrigatorio(v_cor, 'COR_OBRIGATORIA', 'Informe a cor.'); END IF;
  IF v_ativo IS NOT NULL THEN novo.ativo := v_ativo; END IF;
  IF (novo.placa, novo.modelo, novo.cor, novo.ativo) IS NOT DISTINCT FROM (antes.placa, antes.modelo, antes.cor, antes.ativo) THEN
    RETURN app.veiculo_json(antes);
  END IF;
  IF novo.ativo AND NOT antes.ativo THEN PERFORM app.unidade_para_novo_uso(antes.unidade_id); END IF;
  BEGIN
    UPDATE public.veiculo SET placa = novo.placa, modelo = novo.modelo, cor = novo.cor, ativo = novo.ativo WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro(409, 'PLACA_DUPLICADA', 'Placa já cadastrada em outro veículo ativo.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'veiculo.editar', 'veiculo', p_id, NULL,
    app.snapshot(app.veiculo_json(antes)), app.snapshot(app.veiculo_json(depois)));
  RETURN app.veiculo_json(depois);
END $$;

-- ===== Pessoa: correção do cadastro (pessoa.editar: SI, AD) ===========================================================
-- formatoParaCpf (formato-cpf.ts, regra anti-reconstrução): quem já tem máscara continua no formato dela (antigo gera
-- antigo); sem máscara, a regra do cadastro novo (app.formato_cpf_novo, 0022).
CREATE FUNCTION app.formato_cpf_para(p_cpf text, p_mascara_atual text) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_mascara_atual ~ '^\*\*\*\.[0-9]{3}\.[0-9]{3}-\*\*$' THEN 'meio'
              WHEN p_mascara_atual ~ '^[0-9]{3}\.[0-9]{2}\*\.\*\*\*-\*\*$' THEN 'inicio'
              ELSE app.formato_cpf_novo(p_cpf) END
$$;

/*
 * RN-09 e LGPD art. 18 (correção). Campo ausente não muda; CPF informado tira a pessoa de "sem CPF". O CPF digitado só
 * existe nesta chamada (vira máscara + HMAC). Nada mudou: devolve a pessoa sem gravar trilha.
 */
CREATE FUNCTION api.pessoa_editar(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('pessoa.editar');
  q jsonb := app.j_objeto(p);
  v_nome text := app.j_texto(q, 'nome', 150);
  v_tel text := app.j_texto(q, 'telefone', 20);
  v_doc text := app.so_digitos(app.j_texto(q, 'documento', 20));
  v_empresa text := app.j_texto(q, 'empresa', 150);
  v_servico text := app.j_texto(q, 'servico', 150);
  v_menor boolean := app.j_bool(q, 'menorIdade');
  motivo boolean := app.pode(a.papel, 'pessoa.desativar');
  antes public.pessoa;
  novo public.pessoa;
  depois public.pessoa;
  busca text;
  outra uuid;
BEGIN
  antes := app.travar_pessoa(p_id);
  IF antes.anonimizada_em IS NOT NULL THEN PERFORM app.erro(409, 'PESSOA_ANONIMIZADA', 'Cadastro anonimizado não pode ser editado.'); END IF;
  novo := antes;
  IF v_nome IS NOT NULL THEN novo.nome := app.obrigatorio(v_nome, 'NOME_OBRIGATORIO', 'Informe o nome.'); END IF;
  IF v_tel IS NOT NULL THEN
    IF app.so_digitos(v_tel) !~ '^[0-9]{10,11}$' THEN PERFORM app.erro(422, 'TELEFONE_INVALIDO', 'Informe o telefone com DDD (10 ou 11 dígitos).'); END IF;
    novo.telefone := app.so_digitos(v_tel);
  END IF;
  IF v_doc <> '' THEN
    IF NOT app.cpf_valido(v_doc) THEN PERFORM app.erro(422, 'CPF_INVALIDO', 'CPF inválido (confira os dígitos).'); END IF;
    busca := public.cpf_hmac(v_doc);
    SELECT x.id INTO outra FROM public.pessoa x WHERE x.documento_busca = busca LIMIT 1;
    IF outra IS NOT NULL AND outra <> p_id THEN PERFORM app.erro(409, 'PESSOA_DUPLICADA', 'Já existe cadastro com este CPF.'); END IF;
    IF outra IS NULL THEN
      novo.documento_busca := busca;
      novo.documento_mascarado := app.mascarar_cpf(v_doc, app.formato_cpf_para(v_doc, antes.documento_mascarado));
      novo.sem_cpf := false;
    END IF;
  END IF;
  IF v_menor IS NOT NULL AND v_menor IS DISTINCT FROM antes.menor_idade THEN
    IF v_menor AND (antes.categoria <> 'morador' OR antes.sem_cpf) THEN
      PERFORM app.erro(422, 'MENOR_SO_MORADOR', 'Só morador com CPF (ou sem CPF por ser menor) pode ser marcado como menor de idade.');
    END IF;
    novo.menor_idade := v_menor;
  END IF;
  IF NOT novo.menor_idade AND NOT antes.sem_cpf AND antes.importacao_id IS NULL THEN
    -- Deixou de ser menor (ou nunca foi): CPF e telefone obrigatórios, como no cadastro.
    IF coalesce(novo.documento_busca, antes.documento_mascarado) IS NULL THEN
      PERFORM app.erro(422, 'DOCUMENTO_OBRIGATORIO', 'Informe o CPF: só dependente menor de idade fica sem CPF.');
    END IF;
    IF novo.telefone IS NULL THEN PERFORM app.erro(422, 'TELEFONE_INVALIDO', 'Informe o telefone com DDD: só dependente menor de idade fica sem telefone.'); END IF;
  END IF;
  -- empresa/serviço: chave presente (mesmo null) muda; vazio vira nulo.
  IF q ? 'empresa' THEN novo.empresa := app.vazio_para_nulo(v_empresa); END IF;
  IF q ? 'servico' THEN novo.servico := app.vazio_para_nulo(v_servico); END IF;
  IF antes.categoria = 'prestador' AND novo.empresa IS NULL THEN PERFORM app.erro(422, 'EMPRESA_OBRIGATORIA', 'Prestador exige empresa (RF-36).'); END IF;
  IF (novo.nome, novo.telefone, novo.documento_busca, novo.documento_mascarado, novo.sem_cpf, novo.menor_idade, novo.empresa, novo.servico)
     IS NOT DISTINCT FROM (antes.nome, antes.telefone, antes.documento_busca, antes.documento_mascarado, antes.sem_cpf, antes.menor_idade, antes.empresa, antes.servico) THEN
    RETURN app.pessoa_json(antes, motivo);
  END IF;
  BEGIN
    UPDATE public.pessoa SET nome = novo.nome, telefone = novo.telefone, documento_busca = novo.documento_busca,
           documento_mascarado = novo.documento_mascarado, sem_cpf = novo.sem_cpf, menor_idade = novo.menor_idade,
           empresa = novo.empresa, servico = novo.servico, atualizado_em = now()
     WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro(409, 'PESSOA_DUPLICADA', 'Já existe cadastro com este CPF.');
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'pessoa.editar', 'pessoa', p_id, NULL, app.snapshot(to_jsonb(antes)), app.snapshot(to_jsonb(depois)));
  RETURN app.pessoa_json(depois, motivo);
END $$;

-- ===== Unidades (RF-01; unidade.editar: SI, AD) =========================================================================
-- validarEstruturaUnidade: sobre os valores JÁ normalizados. Mensagem ou NULL.
CREATE FUNCTION app.validar_estrutura_unidade(p_bloco text, p_numero text, p_agrupamento text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN coalesce(p_bloco, '') !~ '^[A-Z0-9]{1,3}$'
      THEN CASE WHEN p_agrupamento = 'Torre' THEN 'A torre' ELSE 'O bloco' END || ' deve ter de 1 a 3 letras ou dígitos (ex.: A, 4, B2).'
    WHEN coalesce(p_numero, '') !~ '^(0[1-9]|[1-9][0-9]{1,3})$'
      THEN 'O número do apartamento deve ter só dígitos (até 4) e ser maior que zero.'
  END
$$;

CREATE FUNCTION app.normalizar_bloco(b text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT upper(app.aparar(coalesce(b, ''))) $$;

-- Bloco e número do corpo, normalizados ("a" -> "A", "3" -> "03") e validados (422 UNIDADE_INVALIDA).
CREATE FUNCTION app.j_unidade(q jsonb, OUT bloco text, OUT numero text)
LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE erro text;
BEGIN
  bloco := app.j_texto(q, 'bloco', 10);
  numero := app.j_texto(q, 'numero', 10);
  IF bloco IS NULL OR numero IS NULL THEN PERFORM app.invalido('corpo', 'Informe o bloco e o número.'); END IF;
  bloco := app.normalizar_bloco(bloco);
  numero := app.normalizar_numero(numero);
  erro := app.validar_estrutura_unidade(bloco, numero, app.agrupamento());
  IF erro IS NOT NULL THEN PERFORM app.erro(422, 'UNIDADE_INVALIDA', erro); END IF;
END $$;

CREATE FUNCTION app.erro_unidade_duplicada(p_bloco text, p_numero text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$
  SELECT app.erro(409, 'UNIDADE_DUPLICADA', 'Já existe a unidade ' || app.codigo_unidade(p_bloco, p_numero) || ' (ativa ou desativada).')
$$;

-- Trava com FOR UPDATE: conflita com o FOR KEY SHARE que o INSERT de quem a referencia (FK) toma.
CREATE FUNCTION app.travar_unidade(p_id uuid) RETURNS public.unidade
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE u public.unidade;
BEGIN
  SELECT * INTO u FROM public.unidade WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.'); END IF;
  RETURN u;
END $$;

-- Qualquer registro que aponte para a unidade (inclusive correção de evento que a cite como novo destino).
CREATE FUNCTION app.unidade_referenciada(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.vinculo_unidade WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.veiculo WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.autorizacao_previa WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.restricao WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.encomenda WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.ocorrencia WHERE unidade_id = p_id)
      OR EXISTS (SELECT 1 FROM public.evento_acesso WHERE unidade_destino_id = p_id)
      OR EXISTS (SELECT 1 FROM public.evento_acesso WHERE correcao_valores ->> 'unidade_destino_id' = p_id::text)
$$;

CREATE FUNCTION api.unidade_criar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.editar');
  n record := app.j_unidade(app.j_objeto(p));
  nova public.unidade;
BEGIN
  BEGIN
    INSERT INTO public.unidade (bloco, numero, criado_em, atualizado_em) VALUES (n.bloco, n.numero, now(), now()) RETURNING * INTO nova;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro_unidade_duplicada(n.bloco, n.numero);
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'unidade.criar', 'unidade', nova.id, NULL, NULL, app.unidade_json(nova));
  RETURN app.unidade_json(nova);
END $$;

-- Só bloco/número. Unidade já referenciada não muda de número (422 UNIDADE_REFERENCIADA): desative e cadastre a certa.
CREATE FUNCTION api.unidade_editar(p_id uuid, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('unidade.editar');
  n record := app.j_unidade(app.j_objeto(p));
  antes public.unidade;
  depois public.unidade;
BEGIN
  antes := app.travar_unidade(p_id);
  IF antes.bloco = n.bloco AND antes.numero = n.numero THEN RETURN app.unidade_json(antes); END IF;
  -- Duplicata antes da checagem de referência (a mensagem mais útil primeiro).
  IF EXISTS (SELECT 1 FROM public.unidade x WHERE x.bloco = n.bloco AND x.numero = n.numero) THEN PERFORM app.erro_unidade_duplicada(n.bloco, n.numero); END IF;
  IF app.unidade_referenciada(p_id) THEN
    PERFORM app.erro(422, 'UNIDADE_REFERENCIADA', 'A ' || app.codigo_unidade(antes.bloco, antes.numero)
      || ' já tem registros (vínculos, acessos, encomendas...). Desative-a e cadastre a unidade correta.');
  END IF;
  BEGIN
    UPDATE public.unidade SET bloco = n.bloco, numero = n.numero, atualizado_em = now() WHERE id = p_id RETURNING * INTO depois;
  EXCEPTION WHEN unique_violation THEN
    PERFORM app.erro_unidade_duplicada(n.bloco, n.numero); -- corrida com outra criação
  END;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, 'unidade.editar', 'unidade', p_id, NULL, app.unidade_json(antes), app.unidade_json(depois));
  RETURN app.unidade_json(depois);
END $$;

CREATE FUNCTION app.alternar_unidade(a app.ator_t, p_id uuid, p_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  antes public.unidade := app.travar_unidade(p_id);
  depois public.unidade;
BEGIN
  IF antes.ativo = p_ativo THEN
    IF p_ativo THEN PERFORM app.erro(409, 'UNIDADE_JA_ATIVA', 'A unidade já está ativa.'); END IF;
    PERFORM app.erro(409, 'UNIDADE_JA_INATIVA', 'A unidade já está desativada.');
  END IF;
  UPDATE public.unidade SET ativo = p_ativo, atualizado_em = now() WHERE id = p_id RETURNING * INTO depois;
  PERFORM app.auditar(a.usuario_id, a.nome, a.papel, CASE WHEN p_ativo THEN 'unidade.reativar' ELSE 'unidade.desativar' END, 'unidade', p_id, NULL,
    app.unidade_json(antes), app.unidade_json(depois));
  RETURN app.unidade_json(depois);
END $$;

CREATE FUNCTION api.unidade_desativar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a app.ator_t := app.exigir('unidade.editar');
BEGIN
  RETURN app.alternar_unidade(a, p_id, false);
END $$;

CREATE FUNCTION api.unidade_reativar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a app.ator_t := app.exigir('unidade.editar');
BEGIN
  RETURN app.alternar_unidade(a, p_id, true);
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

GRANT EXECUTE ON FUNCTION
  api.veiculo_criar(jsonb), api.veiculo_editar(uuid, jsonb), api.pessoa_editar(uuid, jsonb),
  api.unidade_criar(jsonb), api.unidade_editar(uuid, jsonb), api.unidade_desativar(uuid), api.unidade_reativar(uuid)
TO authenticated;
