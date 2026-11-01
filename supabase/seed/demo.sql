-- Demonstração SÓ LOCAL (supabase db reset, via [db.seed] do config.toml). Dados fictícios: nenhum nome, login ou
-- senha daqui é de pessoa real. Nunca rodar no projeto hospedado (não usar `db push --include-seed`): a senha de
-- demonstração é pública (README). A estrutura (unidades, áreas, portaria, configuração) vem da migração 0035.
--
-- Recusa banco que já tem usuário ou pessoa: depois do reset local ele está vazio; o hospedado, depois do primeiro
-- síndico, não. Não protege um hospedado ainda sem ninguém: a proteção ali é nunca usar --include-seed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario_sistema) OR EXISTS (SELECT 1 FROM public.pessoa) OR EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'seed de demonstração recusado: o banco já tem usuários ou pessoas (só roda logo depois do supabase db reset local)';
  END IF;
END $$;

-- Usuários do sistema: um por papel, com os logins do legado. A conta do Auth é criada aqui direto em auth.users
-- (o GoTrue aceita bcrypt do pgcrypto), com o e-mail sintético ALEATÓRIO sorteado a cada reset: nem o seed conhece
-- o e-mail de antemão, e o login só funciona pela Edge auth-entrar (desenho §2.1).
-- Senha de demonstração (só local): Demo-Portaria-2026. Sem troca obrigatória, para o e2e cair direto na rota inicial.
DO $$
DECLARE
  r record;
  uid uuid;
  email text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Roberto Faria', 'roberto.faria', 'sindico'),
    ('Paula Nogueira', 'paula.nogueira', 'administracao'),
    ('João Lima', 'joao.lima', 'porteiro'),
    ('Luíza Campos', 'luiza.campos', 'auditor')
  ) AS v (nome, login, papel)
  LOOP
    uid := gen_random_uuid();
    email := 'u-' || gen_random_uuid() || '@usuarios.portaria.invalid';
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                            is_sso_user, is_anonymous)
    VALUES ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email,
            extensions.crypt('Demo-Portaria-2026', extensions.gen_salt('bf', 10)), now(),
            '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
            '', '', '', '', '', '', '', '', false, false);
    INSERT INTO auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (uid, uid::text, jsonb_build_object('sub', uid::text, 'email', email, 'email_verified', true), 'email',
            now(), now(), now());
    INSERT INTO public.usuario_sistema (nome, login, papel, deve_trocar_senha, auth_user_id, auth_email)
    VALUES (r.nome, r.login, r.papel::public.papel, false, uid, email);
  END LOOP;
END $$;

-- ===== Portaria (F2): pessoas fictícias, nas unidades da migração 0035 ================================================
-- Pessoas FICTÍCIAS. CPFs gerados com dígito verificador válido a partir de bases sequenciais (nenhum é de pessoa real
-- conhecida); telefones com prefixo 11 9 0000 (faixa não atribuída). Gravados como o cadastro grava: máscara nova
-- (5 primeiros dígitos) + HMAC com a chave do Vault (public.cpf_hmac); o CPF não fica em lugar nenhum.
CREATE FUNCTION pg_temp.cpf(p_base bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE d text := lpad(p_base::text, 9, '0'); s integer; r integer;
BEGIN
  FOR n IN 9..10 LOOP
    s := 0;
    FOR i IN 1..n LOOP s := s + substr(d, i, 1)::integer * (n + 2 - i); END LOOP;
    r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
    d := d || r::text;
  END LOOP;
  RETURN d;
END $$;

CREATE FUNCTION pg_temp.pessoa(p_nome text, p_categoria text, p_base bigint, p_tel text,
                               p_empresa text DEFAULT NULL, p_servico text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c text; i uuid;
BEGIN
  IF p_base IS NULL THEN
    INSERT INTO public.pessoa (nome, categoria, sem_cpf, telefone, empresa, servico)
    VALUES (p_nome, p_categoria::public.categoria_pessoa, true, p_tel, p_empresa, p_servico) RETURNING id INTO i;
  ELSE
    c := pg_temp.cpf(p_base);
    INSERT INTO public.pessoa (nome, categoria, documento_mascarado, documento_busca, telefone, empresa, servico)
    VALUES (p_nome, p_categoria::public.categoria_pessoa, app.mascarar_cpf(c, 'inicio'), public.cpf_hmac(c), p_tel, p_empresa, p_servico)
    RETURNING id INTO i;
  END IF;
  RETURN i;
END $$;

CREATE FUNCTION pg_temp.unidade(p_codigo text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.unidade WHERE bloco || '-' || numero = p_codigo
$$;

-- Vínculo nasce pendente (trigger) e é aprovado com a conferência, como o fluxo do sistema.
CREATE FUNCTION pg_temp.vinculo(p_pessoa uuid, p_unidade text, p_tipo text, p_status text, p_fim date DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE adm uuid := (SELECT id FROM public.usuario_sistema WHERE login = 'paula.nogueira'); v uuid;
BEGIN
  INSERT INTO public.vinculo_unidade (pessoa_id, unidade_id, tipo, status, vigencia_inicio, vigencia_fim, prazo_regularizacao, registrado_por_id, registrado_em)
  VALUES (p_pessoa, pg_temp.unidade(p_unidade), p_tipo::public.tipo_vinculo, CASE WHEN p_status = 'legado' THEN 'legado' ELSE 'pendente' END::public.status_vinculo,
          CASE WHEN p_status = 'legado' THEN NULL ELSE current_date - 400 END, p_fim,
          CASE WHEN p_status = 'legado' THEN current_date + 60 END, adm, now() - interval '30 days')
  RETURNING id INTO v;
  IF p_status = 'aprovado' THEN
    UPDATE public.vinculo_unidade SET status = 'aprovado', conferencia_tipo_documento = CASE WHEN p_tipo = 'inquilino' THEN 'contrato_locacao' ELSE 'escritura' END::public.tipo_comprovante,
           conferencia_data = current_date - 2, conferido_por_id = adm, decidido_por_id = adm, decidido_em = now() - interval '1 day'
     WHERE id = v;
  END IF;
END $$;

DO $$
DECLARE
  carla uuid; bruno uuid; rogerio uuid; fernanda uuid; marcos uuid; ana uuid; helena uuid; tiago uuid; juliana uuid;
  lucas uuid; patricia uuid; rafael uuid; beatriz uuid; sergio uuid; diego uuid; gabriel uuid; valdir uuid;
  adm uuid := (SELECT id FROM public.usuario_sistema WHERE login = 'paula.nogueira');
  po uuid := (SELECT id FROM public.usuario_sistema WHERE login = 'joao.lima');
BEGIN
  carla    := pg_temp.pessoa('Carla Mendes', 'morador', 274185903, '11900000101');
  bruno    := pg_temp.pessoa('Bruno Mendes', 'morador', 361029477, '11900000102');
  rogerio  := pg_temp.pessoa('Rogério Alves', 'morador', 418230659, '11900000103');
  fernanda := pg_temp.pessoa('Fernanda Costa', 'morador', 530718244, '11900000104');
  marcos   := pg_temp.pessoa('Marcos Ribeiro', 'morador', 612947031, '11900000105');
  ana      := pg_temp.pessoa('Ana Ribeiro', 'morador', 705386128, '11900000106');
  helena   := pg_temp.pessoa('Helena Souza', 'morador', 819402563, '11900000107');
  tiago    := pg_temp.pessoa('Tiago Martins', 'morador', 903117845, '11900000108');
  juliana  := pg_temp.pessoa('Juliana Pires', 'morador', 146820397, '11900000109');
  lucas    := pg_temp.pessoa('Lucas Ferreira', 'visitante', 258031764, '11900000110');
  patricia := pg_temp.pessoa('Patrícia Gomes', 'visitante', 347962018, '11900000111');
  rafael   := pg_temp.pessoa('Rafael Duarte', 'visitante', 461530872, '11900000112');
  beatriz  := pg_temp.pessoa('Beatriz Lima', 'visitante', NULL, '11900000113');
  sergio   := pg_temp.pessoa('Sérgio Prado', 'visitante', 624719305, '11900000114');
  diego    := pg_temp.pessoa('Diego Nunes', 'prestador', 736841259, '11900000115', 'Eletro Serviços Ltda', 'Eletricista');
  gabriel  := pg_temp.pessoa('Gabriel Rocha', 'prestador', 849105372, '11900000116', 'Jardim Verde', 'Jardinagem');
  valdir   := pg_temp.pessoa('Valdir Santos', 'funcionario', 957263184, '11900000117');

  PERFORM pg_temp.vinculo(carla, 'A-11', 'proprietario', 'aprovado');
  PERFORM pg_temp.vinculo(bruno, 'A-11', 'dependente', 'aprovado');
  PERFORM pg_temp.vinculo(rogerio, 'A-12', 'inquilino', 'aprovado', current_date + 365);
  PERFORM pg_temp.vinculo(fernanda, 'B-21', 'proprietario', 'aprovado');
  PERFORM pg_temp.vinculo(marcos, 'C-32', 'proprietario', 'aprovado');
  PERFORM pg_temp.vinculo(ana, 'C-32', 'dependente', 'aprovado');
  PERFORM pg_temp.vinculo(helena, 'D-32', 'proprietario', 'aprovado');
  PERFORM pg_temp.vinculo(tiago, 'E-42', 'proprietario', 'legado');
  PERFORM pg_temp.vinculo(juliana, 'F-13', 'proprietario', 'pendente');

  INSERT INTO public.funcionario (pessoa_id, funcao, dias_semana, hora_inicio, hora_fim)
  VALUES (valdir, 'Zelador', ARRAY[1, 2, 3, 4, 5]::smallint[], '07:00', '16:00');

  INSERT INTO public.veiculo (unidade_id, placa, modelo, cor) VALUES
    (pg_temp.unidade('A-11'), 'ABC1D23', 'Onix', 'Prata'),
    (pg_temp.unidade('C-32'), 'BRA2E19', 'HB20', 'Branco'),
    (pg_temp.unidade('D-32'), 'QWE1234', 'Corolla', 'Preto');

  -- Autorização prévia pedida pela moradora (valendo 30 dias, sem janela) e uma de área comum (seg a sex, 8h-17h).
  INSERT INTO public.autorizacao_previa (pessoa_id, unidade_id, valida_de, valida_ate, solicitada_por_pessoa_id, cadastrada_por_id)
  VALUES (lucas, pg_temp.unidade('B-21'), app.inicio_do_dia(now()), app.fim_do_dia(now() + interval '30 days'), fernanda, po);
  INSERT INTO public.autorizacao_previa (pessoa_id, area_comum_id, valida_de, valida_ate, dias_semana, hora_inicio, hora_fim, cadastrada_por_id)
  VALUES (gabriel, (SELECT id FROM public.area_comum WHERE nome = 'Jardins'), app.inicio_do_dia(now()), app.fim_do_dia(now() + interval '30 days'),
          ARRAY[1, 2, 3, 4, 5]::smallint[], '08:00', '17:00', adm);

  -- Restrição de unidade (pedida pela moradora) e uma de condomínio aguardando o síndico.
  INSERT INTO public.restricao (escopo, unidade_id, pessoa_id, motivo, valida_ate, solicitada_por_pessoa_id, cadastrada_por_id)
  VALUES ('unidade', pg_temp.unidade('A-11'), sergio, 'Pedido da moradora: não autorizar visitas', app.fim_do_dia(now() + interval '90 days'), carla, po);
  INSERT INTO public.restricao (escopo, pessoa_id, motivo, valida_ate, cadastrada_por_id)
  VALUES ('condominio', rafael, 'Ocorrência registrada na portaria', app.fim_do_dia(now() + interval '90 days'), po);
END $$;
