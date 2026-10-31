-- 0021 — Visões JSON da portaria (F2): o formato que o front já consome (@portaria/domain/types e src/api/types.ts).
-- Nova: não existe no legado Drizzle. Porte de pessoa-view.ts, busca.service.ts, vinculo-view.ts, evento-view.ts,
-- efetivo.ts e conversoes.ts do legado (eae0555). Instantes em epoch ms; datas de calendário como o início do dia BRT
-- em ms (o adaptador antigo convertia 'AAAA-MM-DD'; aqui já sai convertido).
--
-- Minimização (ADR 2026-10-18 e decisão de 2026-10-24 do legado, pessoa-view.ts): documento_busca NUNCA sai, e o
-- telefone completo também não, para nenhum papel (só telefoneMascarado). A UI não exibe o telefone completo em lugar
-- nenhum: a correção envia o número novo sem ler o atual. DIVERGÊNCIA registrada: o enunciado da F2 previa telefone
-- completo para SI/AD; o legado vigente já o tinha cortado para todos, e esta migração segue o legado (menos exposição).
--
-- Tudo aqui é helper de app.* (SECURITY INVOKER, dono app_rw): roda dentro das RPCs, com os GRANTs do app_rw.

-- ===== Usuário, papel e configuração ==================================================================================
CREATE FUNCTION app.rotulo_papel(p public.papel) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p WHEN 'sindico' THEN 'Síndico' WHEN 'administracao' THEN 'Administração' WHEN 'porteiro' THEN 'Porteiro' WHEN 'auditor' THEN 'Auditor' END
$$;

CREATE FUNCTION app.nome_usuario(p_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_id IS NULL THEN NULL ELSE coalesce((SELECT nome FROM public.usuario_sistema WHERE id = p_id), '(usuário)') END
$$;

-- "Paula Nogueira (Administração)".
CREATE FUNCTION app.com_papel(p_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((SELECT nome || ' (' || app.rotulo_papel(papel) || ')' FROM public.usuario_sistema WHERE id = p_id), '(usuário)')
$$;

CREATE FUNCTION app.nome_pessoa(p_id uuid, p_padrao text DEFAULT '(pessoa)') RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_id IS NULL THEN NULL ELSE coalesce((SELECT nome FROM public.pessoa WHERE id = p_id), p_padrao) END
$$;

-- "Bloco"/"Torre" da tabela configuracao (sem linha: o padrão, como ESTRUTURA_PADRAO).
CREATE FUNCTION app.agrupamento() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT coalesce((SELECT agrupamento FROM public.configuracao WHERE id = 1), 'Bloco') $$;

-- "BLOCO A · AP 32" (mensagens que citam a unidade).
CREATE FUNCTION app.rotulo_unidade(u public.unidade) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT upper(app.agrupamento() || ' ' || u.bloco || ' · AP ' || u.numero) $$;

-- Ponto de acesso único do MVP (PORTARIA_SOCIAL do domain), do seed.
CREATE FUNCTION app.ponto_padrao() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE i uuid;
BEGIN
  SELECT id INTO i FROM public.ponto_acesso WHERE nome = 'Portaria social';
  IF i IS NULL THEN PERFORM app.erro(500, 'ERRO_INTERNO', 'Ponto de acesso não configurado (rode o seed de estrutura).'); END IF;
  RETURN i;
END $$;

-- ===== Snapshot do audit_log (porte de auditoria/snapshot.ts) =========================================================
-- Chaves proibidas somem em qualquer nível; telefone é mascarado; documento_mascarado e ids passam; o resto do texto
-- passa por mascarar_digitos (CPF ou telefone digitado em texto livre).
CREATE FUNCTION app.snapshot(j jsonb, p_chave text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  r jsonb;
  k text;
  v jsonb;
  s text;
BEGIN
  IF j IS NULL OR jsonb_typeof(j) = 'null' THEN RETURN NULL; END IF;
  CASE jsonb_typeof(j)
    WHEN 'object' THEN
      r := '{}'::jsonb;
      FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
        CONTINUE WHEN k IN ('senha', 'senha_hash', 'senha_atual', 'nova_senha', 'senha_temporaria', 'token', 'token_hash',
                            'documento_busca', 'cookie', 'auth_email', 'dek_cifrada', 'nonce');
        r := r || jsonb_build_object(k, coalesce(app.snapshot(v, k), 'null'::jsonb));
      END LOOP;
      RETURN r;
    WHEN 'array' THEN
      RETURN (SELECT coalesce(jsonb_agg(coalesce(app.snapshot(x, p_chave), 'null'::jsonb)), '[]'::jsonb) FROM jsonb_array_elements(j) x);
    WHEN 'string' THEN
      s := j #>> '{}';
      IF p_chave = 'telefone' THEN RETURN to_jsonb(app.mascarar_telefone(s)); END IF;
      IF p_chave = 'documento_mascarado' OR p_chave = 'id' OR p_chave LIKE '%\_id'
         OR s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN j; END IF;
      RETURN to_jsonb(app.mascarar_digitos(s));
    ELSE RETURN j;
  END CASE;
END $$;

-- ===== Unidade e área ================================================================================================
CREATE FUNCTION app.unidade_json(u public.unidade) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT jsonb_build_object('id', u.id, 'bloco', u.bloco, 'numero', u.numero, 'ativo', u.ativo) $$;

CREATE FUNCTION app.codigo_da_unidade(p_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_id IS NULL THEN NULL
              ELSE coalesce((SELECT app.codigo_unidade(bloco, numero) FROM public.unidade WHERE id = p_id), '(unidade)') END
$$;

-- paraNovoUso: unidade de um NOVO uso precisa existir e estar ativa. FOR SHARE segura a desativação concorrente.
CREATE FUNCTION app.unidade_para_novo_uso(p_id uuid) RETURNS public.unidade
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE u public.unidade;
BEGIN
  SELECT * INTO u FROM public.unidade WHERE id = p_id FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade não encontrada.'); END IF;
  IF NOT u.ativo THEN PERFORM app.erro(422, 'UNIDADE_INATIVA', 'A unidade ' || app.codigo_unidade(u.bloco, u.numero) || ' está desativada.'); END IF;
  RETURN u;
END $$;

CREATE FUNCTION app.area_para_novo_uso(p_id uuid) RETURNS public.area_comum
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE a public.area_comum;
BEGIN
  SELECT * INTO a FROM public.area_comum WHERE id = p_id FOR SHARE;
  IF NOT FOUND THEN PERFORM app.erro(404, 'AREA_COMUM_NAO_ENCONTRADA', 'Área comum não encontrada.'); END IF;
  IF NOT a.ativo THEN PERFORM app.erro(422, 'AREA_COMUM_INATIVA', 'A área comum ' || a.nome || ' está desativada.'); END IF;
  RETURN a;
END $$;

-- ===== Pessoa ========================================================================================================
CREATE FUNCTION app.documento_exibido(p public.pessoa) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p.anonimizada_em IS NOT NULL THEN '(anonimizado)' WHEN p.sem_cpf THEN '(sem CPF)'
              ELSE coalesce(p.documento_mascarado, CASE WHEN p.menor_idade THEN '(menor, sem CPF)' ELSE '(sem CPF)' END) END
$$;

-- PessoaApi (paraPessoaApi): sem documento_busca e sem telefone completo. `p_motivo`: só para quem pode desativar.
CREATE FUNCTION app.pessoa_json(p public.pessoa, p_motivo boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'nome', p.nome, 'documentoTipo', 'cpf', 'categoria', p.categoria, 'semCpf', p.sem_cpf,
           'menorIdade', p.menor_idade, 'documentoMascarado', app.documento_exibido(p), 'telefoneMascarado', app.mascarar_telefone(p.telefone),
           'anonimizadaEm', app.ms(p.anonimizada_em), 'desativadaEm', app.ms(p.desativada_em), 'criadoEm', app.ms(p.criado_em))
    || CASE WHEN coalesce(p.empresa, '') <> '' THEN jsonb_build_object('empresa', p.empresa) ELSE '{}' END
    || CASE WHEN coalesce(p.servico, '') <> '' THEN jsonb_build_object('servico', p.servico) ELSE '{}' END
    || CASE WHEN p.importacao_id IS NOT NULL THEN jsonb_build_object('importacaoId', p.importacao_id) ELSE '{}' END
    || CASE WHEN p_motivo AND p.desativacao_motivo IS NOT NULL THEN jsonb_build_object('desativacaoMotivo', p.desativacao_motivo) ELSE '{}' END
$$;

-- Unidades com vínculo válido da pessoa, na ordem das unidades: {ids, codigos}.
CREATE FUNCTION app.unidades_validas(p_pessoa uuid, p_hoje date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('ids', coalesce(jsonb_agg(u.id ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero), '[]'),
                            'codigos', coalesce(jsonb_agg(app.codigo_unidade(u.bloco, u.numero) ORDER BY app.chave_bloco(u.bloco), u.numero::numeric, u.numero), '[]'))
    FROM public.vinculo_unidade v JOIN public.unidade u ON u.id = v.unidade_id
   WHERE v.pessoa_id = p_pessoa AND app.vinculo_valido(v.status, v.vigencia_inicio, v.vigencia_fim, v.prazo_regularizacao, p_hoje)
$$;

-- "Hoje 14:32 · D-32", "08/10 · Salão de festas (negado)" ou "Sem acessos". Valores gravados (como o legado).
CREATE FUNCTION app.ultimo_acesso_texto(p_pessoa uuid, p_agora timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce((
    SELECT CASE WHEN app.fmt_data(p_agora) = app.fmt_data(e.ocorrido_em) THEN 'Hoje ' || app.fmt_hora(e.ocorrido_em)
                ELSE left(app.fmt_data(e.ocorrido_em), 5) END
        || coalesce(' · ' || coalesce(app.codigo_unidade(u.bloco, u.numero), a.nome), '')
        || CASE e.tipo WHEN 'negado' THEN ' (negado)' WHEN 'recusado' THEN ' (recusado)' ELSE '' END
      FROM public.evento_acesso e
      LEFT JOIN public.unidade u ON u.id = e.unidade_destino_id
      LEFT JOIN public.area_comum a ON a.id = e.area_comum_id
     WHERE e.pessoa_id = p_pessoa AND e.tipo NOT IN ('saida', 'correcao')
     ORDER BY e.seq DESC LIMIT 1), 'Sem acessos')
$$;

-- Selo de restrição (lista e busca do Cadastro), sem motivo: ativa prevalece sobre pendente.
CREATE FUNCTION app.resumo_restricao(p_pessoa uuid, p_agora timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH rs AS (
    SELECT r.escopo, r.aprovada_em, r.cadastrada_em, r.id, u.bloco, u.numero,
           (r.escopo = 'condominio' AND r.aprovada_em IS NULL) AS pendente
      FROM public.restricao r LEFT JOIN public.unidade u ON u.id = r.unidade_id
     WHERE r.pessoa_id = p_pessoa AND r.revogada_em IS NULL AND r.valida_ate >= p_agora
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM rs WHERE NOT pendente) THEN jsonb_build_object('estado', 'ativa',
      'unidadeCodigo', CASE WHEN EXISTS (SELECT 1 FROM rs WHERE NOT pendente AND escopo = 'condominio') THEN NULL
                            ELSE (SELECT app.codigo_unidade(bloco, numero) FROM rs WHERE NOT pendente ORDER BY cadastrada_em, id LIMIT 1) END,
      'total', (SELECT count(*) FROM rs WHERE NOT pendente))
    WHEN EXISTS (SELECT 1 FROM rs) THEN jsonb_build_object('estado', 'pendente', 'unidadeCodigo', NULL, 'total', (SELECT count(*) FROM rs))
  END
$$;

-- PessoaBusca (busca.service.ts): sem telefone e sem documento_busca; `p_restricao` = quem vê restrições.
CREATE FUNCTION app.pessoa_busca_json(p public.pessoa, p_agora timestamptz, p_restricao boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'nome', p.nome, 'documentoTipo', 'cpf', 'categoria', p.categoria, 'semCpf', p.sem_cpf,
           'documentoMascarado', CASE WHEN p.sem_cpf THEN '(sem CPF)' ELSE coalesce(p.documento_mascarado, '(sem CPF)') END,
           'desativadaEm', app.ms(p.desativada_em), 'ultimoAcesso', app.ultimo_acesso_texto(p.id, p_agora),
           'unidadesVinculadas', uv -> 'ids', 'unidadesVinculadasCodigos', uv -> 'codigos')
    || CASE WHEN coalesce(p.empresa, '') <> '' THEN jsonb_build_object('empresa', p.empresa) ELSE '{}' END
    || CASE WHEN coalesce(p.servico, '') <> '' THEN jsonb_build_object('servico', p.servico) ELSE '{}' END
    || CASE WHEN p.importacao_id IS NOT NULL THEN jsonb_build_object('importacaoId', p.importacao_id) ELSE '{}' END
    || CASE WHEN p_restricao THEN jsonb_build_object('restricao', app.resumo_restricao(p.id, p_agora)) ELSE '{}' END
    FROM (SELECT app.unidades_validas(p.id, app.dia_brt(p_agora)) AS uv) x
$$;

-- ===== Vínculo (vinculo-view.ts) =====================================================================================
CREATE FUNCTION app.cadastro_completo(p public.pessoa, p_tipo public.tipo_vinculo) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NOT p.sem_cpf AND p.anonimizada_em IS NULL
     AND ((p.documento_busca IS NOT NULL AND coalesce(p.telefone, '') ~ '^[0-9]{10,11}$') OR (p.menor_idade AND p_tipo = 'dependente'))
$$;

CREATE FUNCTION app.vinculo_json(v public.vinculo_unidade, p_hoje date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', v.id, 'pessoaId', v.pessoa_id, 'unidadeId', v.unidade_id, 'tipo', v.tipo, 'status', v.status,
           'vigenciaInicio', app.ms(app.inicio_da_data(v.vigencia_inicio)), 'vigenciaFim', app.ms(app.inicio_da_data(v.vigencia_fim)),
           'prazoRegularizacao', app.ms(app.inicio_da_data(v.prazo_regularizacao)),
           'conferencia', CASE WHEN v.conferencia_tipo_documento IS NOT NULL AND v.conferencia_data IS NOT NULL AND v.conferido_por_id IS NOT NULL
             THEN jsonb_build_object('tipoDocumento', v.conferencia_tipo_documento, 'data', app.ms(app.inicio_da_data(v.conferencia_data)),
                                     'conferidoPorId', v.conferido_por_id)
                  || CASE WHEN v.conferencia_descricao IS NOT NULL THEN jsonb_build_object('descricao', v.conferencia_descricao) ELSE '{}' END
                  || CASE WHEN v.conferencia_observacao IS NOT NULL THEN jsonb_build_object('observacao', v.conferencia_observacao) ELSE '{}' END END,
           'solicitadoPor', CASE WHEN v.importacao_id IS NOT NULL
             THEN btrim('Importação da planilha ' || coalesce((SELECT arquivo_nome FROM public.importacao WHERE id = v.importacao_id), ''))
             ELSE coalesce((SELECT nome FROM public.usuario_sistema WHERE id = v.registrado_por_id), 'Administração') END,
           'solicitadoEm', app.ms(v.registrado_em), 'registradoPorId', v.registrado_por_id,
           'encerradoEm', app.ms(v.encerrado_em), 'pessoaNome', p.nome, 'pessoaDocumento', app.documento_exibido(p),
           'pessoaCadastroCompleto', app.cadastro_completo(p, v.tipo), 'unidadeCodigo', app.codigo_unidade(u.bloco, u.numero),
           'decididoPorNome', (SELECT nome FROM public.usuario_sistema WHERE id = v.decidido_por_id),
           'registradoPorNome', (SELECT nome FROM public.usuario_sistema WHERE id = v.registrado_por_id),
           'conferidoPorNome', (SELECT nome FROM public.usuario_sistema WHERE id = v.conferido_por_id),
           'legadoVencido', v.status = 'legado' AND v.prazo_regularizacao IS NOT NULL AND v.prazo_regularizacao < p_hoje)
    || CASE WHEN v.importacao_id IS NOT NULL THEN jsonb_build_object('importacaoId', v.importacao_id) ELSE '{}' END
    || CASE WHEN v.nota IS NOT NULL AND v.nota <> '' THEN jsonb_build_object('nota', v.nota) ELSE '{}' END
    || CASE WHEN v.decidido_por_id IS NOT NULL THEN jsonb_build_object('decididoPorId', v.decidido_por_id) ELSE '{}' END
    || CASE WHEN v.decidido_em IS NOT NULL THEN jsonb_build_object('decididoEm', app.ms(v.decidido_em)) ELSE '{}' END
    || CASE WHEN v.justificativa IS NOT NULL AND v.justificativa <> '' THEN jsonb_build_object('justificativa', v.justificativa) ELSE '{}' END
    FROM public.pessoa p, public.unidade u WHERE p.id = v.pessoa_id AND u.id = v.unidade_id
$$;

-- ===== Autorização prévia e restrição (conversoes.ts) ================================================================
CREATE FUNCTION app.autorizacao_json(a public.autorizacao_previa) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', a.id, 'unidadeId', a.unidade_id, 'areaComumId', a.area_comum_id, 'pessoaId', a.pessoa_id,
    'validaDe', app.ms(a.valida_de), 'validaAte', app.ms(a.valida_ate), 'diasSemana', to_jsonb(a.dias_semana),
    'horaInicio', app.hhmm(a.hora_inicio), 'horaFim', app.hhmm(a.hora_fim), 'cadastradaPorId', a.cadastrada_por_id,
    'cadastradaEm', app.ms(a.cadastrada_em), 'solicitadaPorPessoaId', a.solicitada_por_pessoa_id, 'semSolicitante', a.sem_solicitante,
    'justificativa', a.justificativa, 'revogadaEm', app.ms(a.revogada_em), 'revogadaPorId', a.revogada_por_id)
$$;

-- AutorizacaoView: estado e "utilizada hoje" pelo instante `p_agora` (o relógio do banco).
CREATE FUNCTION app.autorizacao_view(a public.autorizacao_previa, p_agora timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT app.autorizacao_json(a) || jsonb_build_object(
    'pessoaNome', coalesce(app.nome_pessoa(a.pessoa_id), '?'), 'estado', app.estado_autorizacao(a, p_agora),
    'unidadeRotulo', CASE WHEN a.unidade_id IS NOT NULL THEN app.codigo_da_unidade(a.unidade_id)
                          ELSE coalesce((SELECT nome FROM public.area_comum WHERE id = a.area_comum_id), '(área comum)') END,
    'utilizadaEm', (SELECT app.ms(e.ocorrido_em) FROM public.evento_acesso e
                     WHERE e.tipo = 'entrada' AND e.autorizacao_previa_id = a.id
                       AND e.ocorrido_em BETWEEN app.inicio_do_dia(p_agora) AND app.fim_do_dia(p_agora) ORDER BY e.seq LIMIT 1),
    'cadastradaPorNome', app.com_papel(a.cadastrada_por_id), 'solicitadaPorNome', app.nome_pessoa(a.solicitada_por_pessoa_id),
    'revogadaPorNome', app.nome_usuario(a.revogada_por_id))
$$;

CREATE FUNCTION app.restricao_json(r public.restricao) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', r.id, 'escopo', r.escopo, 'unidadeId', r.unidade_id, 'pessoaId', r.pessoa_id, 'motivo', r.motivo,
    'validaAte', app.ms(r.valida_ate), 'cadastradaPorId', r.cadastrada_por_id, 'cadastradaEm', app.ms(r.cadastrada_em),
    'solicitadaPorPessoaId', r.solicitada_por_pessoa_id, 'aprovadaPorId', r.aprovada_por_id, 'aprovadaEm', app.ms(r.aprovada_em),
    'revogadaEm', app.ms(r.revogada_em), 'revogadaPorId', r.revogada_por_id)
$$;

CREATE FUNCTION app.restricao_view(r public.restricao) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT app.restricao_json(r) || jsonb_build_object(
    'pessoaNome', coalesce(app.nome_pessoa(r.pessoa_id), '?'), 'pendente', r.escopo = 'condominio' AND r.aprovada_em IS NULL,
    'unidadeCodigo', app.codigo_da_unidade(r.unidade_id), 'cadastradaPorNome', app.com_papel(r.cadastrada_por_id),
    'solicitadaPorNome', app.nome_pessoa(r.solicitada_por_pessoa_id), 'aprovadaPorNome', app.nome_usuario(r.aprovada_por_id),
    'revogadaPorNome', app.nome_usuario(r.revogada_por_id))
$$;

-- ===== Evento: valores efetivos (efetivo.ts) e view (evento-view.ts) ==================================================
-- codigoEvento: "EV-000123" (padStart não corta: seq com mais de 6 dígitos sai inteiro).
CREATE FUNCTION app.codigo_evento(p_seq bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 'EV-' || lpad(p_seq::text, greatest(6, length(p_seq::text)), '0') $$;

-- correcao_valores do banco (snake_case, ISO) -> domínio (camelCase, epoch ms), só as chaves presentes, ordem canônica.
CREATE FUNCTION app.correcao_dominio(v jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN v IS NULL OR jsonb_typeof(v) <> 'object' THEN NULL ELSE
       CASE WHEN v ? 'unidade_destino_id' THEN jsonb_build_object('unidadeDestinoId', v -> 'unidade_destino_id') ELSE '{}' END
    || CASE WHEN v ? 'ocorrido_em' THEN jsonb_build_object('ocorridoEm', app.ms((v ->> 'ocorrido_em')::timestamptz)) ELSE '{}' END
    || CASE WHEN v ? 'pessoa_id' THEN jsonb_build_object('pessoaId', v -> 'pessoa_id') ELSE '{}' END
    || CASE WHEN v ? 'autorizado_por_pessoa_id' THEN jsonb_build_object('autorizadoPorPessoaId', v -> 'autorizado_por_pessoa_id') ELSE '{}' END
  END
$$;

-- Última correção (maior seq) do evento, ou NULL.
CREATE FUNCTION app.ultima_correcao(p_evento uuid) RETURNS public.evento_acesso
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c FROM public.evento_acesso c WHERE c.tipo = 'correcao' AND c.corrige_evento_id = p_evento ORDER BY c.seq DESC LIMIT 1
$$;

-- Valores efetivos = original + a última correção (o acumulado). Correção não é corrigida: volta como está.
CREATE FUNCTION app.efetivo(e public.evento_acesso) RETURNS public.evento_acesso
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
  IF e.tipo = 'correcao' THEN RETURN e; END IF;
  v := (app.ultima_correcao(e.id)).correcao_valores;
  IF v IS NULL THEN RETURN e; END IF;
  IF v ? 'unidade_destino_id' THEN e.unidade_destino_id := (v ->> 'unidade_destino_id')::uuid; END IF;
  IF v ? 'ocorrido_em' THEN e.ocorrido_em := (v ->> 'ocorrido_em')::timestamptz; END IF;
  IF v ? 'pessoa_id' THEN e.pessoa_id := (v ->> 'pessoa_id')::uuid; END IF;
  IF v ? 'autorizado_por_pessoa_id' THEN e.autorizado_por_pessoa_id := (v ->> 'autorizado_por_pessoa_id')::uuid; END IF;
  RETURN e;
END $$;

-- Pessoa efetiva (para filtrar "dentro" e "última entrada" sem montar a linha inteira).
CREATE FUNCTION app.pessoa_efetiva(e public.evento_acesso) RETURNS uuid
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT (app.efetivo(e)).pessoa_id $$;

-- Entrada (pessoa efetiva) sem saída: "já está dentro".
CREATE FUNCTION app.esta_dentro(p_pessoa uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evento_acesso e
     WHERE e.tipo = 'entrada'
       AND (e.pessoa_id = p_pessoa OR e.id IN (SELECT c.corrige_evento_id FROM public.evento_acesso c
                                                WHERE c.corrige_evento_id IS NOT NULL AND c.correcao_valores ? 'pessoa_id'))
       AND app.pessoa_efetiva(e) = p_pessoa
       AND NOT EXISTS (SELECT 1 FROM public.evento_acesso s WHERE s.tipo = 'saida' AND s.refere_evento_id = e.id))
$$;

-- Exceção (RF-31): liberação do porteiro ou autorização prévia de unidade sem solicitante.
CREATE FUNCTION app.eh_excecao(e public.evento_acesso) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT e.tipo = 'entrada' AND (e.autorizado_por_tipo = 'excecao_porteiro' OR (e.autorizado_por_tipo = 'autorizacao_previa'
    AND EXISTS (SELECT 1 FROM public.autorizacao_previa a WHERE a.id = e.autorizacao_previa_id AND a.sem_solicitante)))
$$;

-- EventoAcesso do domínio (camelCase, epoch ms).
CREATE FUNCTION app.evento_json(e public.evento_acesso) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', e.id, 'seq', e.seq, 'formatoHash', e.formato_hash, 'tipo', e.tipo, 'categoriaPessoa', e.categoria_pessoa,
    'pessoaId', e.pessoa_id, 'unidadeDestinoId', e.unidade_destino_id, 'areaComumId', e.area_comum_id, 'pontoAcessoId', e.ponto_acesso_id,
    'autorizadoPorTipo', e.autorizado_por_tipo, 'autorizadoPorPessoaId', e.autorizado_por_pessoa_id,
    'autorizacaoPreviaId', e.autorizacao_previa_id, 'justificativa', e.justificativa, 'restricaoId', e.restricao_id,
    'operadorId', e.operador_id, 'operadorPapel', e.operador_papel, 'ocorridoEm', app.ms(e.ocorrido_em),
    'registradoEm', app.ms(e.registrado_em), 'retroativo', e.retroativo, 'refereEventoId', e.refere_evento_id,
    'corrigeEventoId', e.corrige_evento_id, 'observacao', e.observacao, 'formularioContingencia', e.formulario_contingencia)
  || jsonb_build_object('correcaoValores', app.correcao_dominio(e.correcao_valores), 'empresa', e.empresa, 'servico', e.servico,
    'veiculoPlaca', e.veiculo_placa, 'veiculoModelo', e.veiculo_modelo, 'veiculoCor', e.veiculo_cor,
    'hashAnterior', e.hash_anterior, 'hash', e.hash)
$$;

-- Quem autorizou, pelo id; autorização sem solicitante ou de área comum: quem cadastrou.
CREATE FUNCTION app.nome_autorizador(e public.evento_acesso) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN e.autorizado_por_pessoa_id IS NOT NULL THEN app.nome_pessoa(e.autorizado_por_pessoa_id)
    WHEN e.autorizado_por_tipo = 'autorizacao_previa' AND e.autorizacao_previa_id IS NOT NULL THEN (
      SELECT CASE WHEN a.area_comum_id IS NOT NULL THEN 'Área comum — cadastrada por ' || app.nome_usuario(a.cadastrada_por_id)
                  WHEN a.sem_solicitante THEN 'Sem solicitante — cadastrada por ' || app.nome_usuario(a.cadastrada_por_id) END
        FROM public.autorizacao_previa a WHERE a.id = e.autorizacao_previa_id)
  END
$$;

-- Prazo de permanência vigente (linha de maior ordem), ou NULL.
CREATE FUNCTION app.permanencia_vigente(p_entrada uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('tipoVisita', tipo_visita, 'prazoAte', app.ms(prazo_ate), 'prorrogacoes', ordem)
    FROM public.permanencia WHERE evento_entrada_id = p_entrada ORDER BY ordem DESC LIMIT 1
$$;

-- EventoView: o gravado + valores efetivos + nomes resolvidos (mesmos campos de montarViews do legado).
CREATE FUNCTION app.evento_view(b public.evento_acesso) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  e public.evento_acesso := app.efetivo(b);
  c public.evento_acesso;
  s public.evento_acesso;
  ent public.evento_acesso;
  aplicados jsonb;
  originais jsonb := '{}';
  corrigidos jsonb;
  ap public.autorizacao_previa;
BEGIN
  IF b.tipo <> 'correcao' THEN c := app.ultima_correcao(b.id); END IF;
  aplicados := app.correcao_dominio(c.correcao_valores);
  IF aplicados IS NOT NULL THEN
    IF aplicados ? 'unidadeDestinoId' THEN originais := originais || jsonb_build_object('unidadeDestinoId', b.unidade_destino_id); END IF;
    IF aplicados ? 'ocorridoEm' THEN originais := originais || jsonb_build_object('ocorridoEm', app.ms(b.ocorrido_em)); END IF;
    IF aplicados ? 'pessoaId' THEN originais := originais || jsonb_build_object('pessoaId', b.pessoa_id); END IF;
    IF aplicados ? 'autorizadoPorPessoaId' THEN originais := originais || jsonb_build_object('autorizadoPorPessoaId', b.autorizado_por_pessoa_id); END IF;
  END IF;
  corrigidos := CASE WHEN b.tipo = 'correcao' THEN app.correcao_dominio(b.correcao_valores) END;
  IF b.tipo = 'entrada' THEN
    SELECT * INTO s FROM public.evento_acesso WHERE tipo = 'saida' AND refere_evento_id = b.id;
  ELSIF b.tipo = 'saida' THEN
    SELECT * INTO ent FROM public.evento_acesso WHERE id = b.refere_evento_id;
  END IF;
  IF e.autorizacao_previa_id IS NOT NULL THEN SELECT * INTO ap FROM public.autorizacao_previa WHERE id = e.autorizacao_previa_id; END IF;

  RETURN app.evento_json(e) || jsonb_build_object(
    'codigo', app.codigo_evento(b.seq),
    'pessoaNome', app.nome_pessoa(e.pessoa_id, '(pessoa removida)'),
    'operadorNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = e.operador_id), '(operador)'),
    'unidadeRotulo', CASE WHEN e.unidade_destino_id IS NOT NULL THEN app.codigo_da_unidade(e.unidade_destino_id)
                          WHEN e.area_comum_id IS NOT NULL THEN coalesce((SELECT nome FROM public.area_comum WHERE id = e.area_comum_id), '(área comum)') END,
    'areaComumNome', CASE WHEN e.area_comum_id IS NOT NULL THEN coalesce((SELECT nome FROM public.area_comum WHERE id = e.area_comum_id), '(área comum)') END,
    'pontoAcessoNome', coalesce((SELECT nome FROM public.ponto_acesso WHERE id = e.ponto_acesso_id), 'Portaria social'),
    'autorizadoPorNome', app.nome_autorizador(e),
    'veiculo', CASE WHEN b.tipo = 'entrada' AND b.veiculo_placa IS NOT NULL
                      THEN jsonb_build_object('placa', b.veiculo_placa, 'modelo', b.veiculo_modelo, 'cor', b.veiculo_cor)
                    WHEN b.tipo = 'saida' AND ent.veiculo_placa IS NOT NULL
                      THEN jsonb_build_object('placa', ent.veiculo_placa, 'modelo', ent.veiculo_modelo, 'cor', ent.veiculo_cor) END,
    'saida', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id', s.id, 'codigo', app.codigo_evento(s.seq), 'em', app.ms((app.efetivo(s)).ocorrido_em)) END,
    'dentro', b.tipo = 'entrada' AND s.id IS NULL,
    'entradaCodigo', CASE WHEN ent.id IS NOT NULL THEN app.codigo_evento(ent.seq) END,
    'valoresOriginais', CASE WHEN originais <> '{}' THEN originais END,
    'correcao', CASE WHEN c.id IS NOT NULL THEN jsonb_build_object('id', c.id, 'codigo', app.codigo_evento(c.seq), 'em', app.ms(c.registrado_em),
      'justificativa', c.justificativa, 'observacao', c.observacao,
      'operadorNome', coalesce((SELECT nome FROM public.usuario_sistema WHERE id = c.operador_id), '(operador)')) END,
    'valoresCorrigidos', corrigidos)
  || jsonb_build_object(
    'pessoaNomeOriginal', CASE WHEN aplicados ? 'pessoaId' THEN (SELECT nome FROM public.pessoa WHERE id = b.pessoa_id) END,
    'pessoaNomeCorrigida', CASE WHEN corrigidos ->> 'pessoaId' IS NOT NULL THEN (SELECT nome FROM public.pessoa WHERE id = (corrigidos ->> 'pessoaId')::uuid) END,
    'autorizadoPorNomeOriginal', CASE WHEN aplicados ? 'autorizadoPorPessoaId' THEN app.nome_autorizador(b) END,
    'autorizadoPorNomeCorrigido', CASE WHEN corrigidos ? 'autorizadoPorPessoaId' THEN app.nome_pessoa((corrigidos ->> 'autorizadoPorPessoaId')::uuid) END,
    'autorizacaoSemSolicitante', coalesce(ap.sem_solicitante, false));
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
