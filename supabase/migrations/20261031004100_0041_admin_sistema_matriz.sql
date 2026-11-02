-- 0041 — Administrador do sistema (F5), sobre o valor criado na 0040.
--   * Matriz: admin_sistema tem usuario.ver e usuario.gerenciar, nada mais (sem pessoa, unidade, evento, vínculo,
--     documento, lgpd, relatório, auditoria, funcionário, encomenda, ocorrência). Toda RPC api.* começa por
--     app.exigir(ação) (01_superficie), então o papel novo é negado por falta de linha, sem mexer nelas. api.catalogo
--     (qualquer autenticado: bloco/número das unidades e áreas comuns, sem dado pessoal) e api.sessao_atual/encerrar
--     (a própria sessão) continuam abertas a ele.
--   * Gestão: app.exigir_gestao_sindico passa a proteger 'sindico' E 'admin_sistema'. Todas as srv.usuario_* (criar,
--     criar_preparar, desativar, reativar, redefinir_senha, editar) já chamam o helper com o papel do alvo e/ou o papel
--     novo; trocar só o helper cobre todas, sem reescrever nenhuma. Efeito: alvo síndico ou admin_sistema, ou atribuir
--     um desses papéis, exige usuario.gerenciar_sindico (só o síndico). O admin_sistema não se promove, não cria outro
--     admin_sistema, não mexe em colega admin_sistema nem no próprio cadastro (a própria senha muda em "Trocar minha
--     senha", srv.troca_*, que não passa por aqui). AUTO_PAPEL, ULTIMO_SINDICO e o resto da 0039 ficam como estão.
--   * Rótulo (trilha, relatório, exportação), filtro e totais da listagem de usuários com o papel novo.
--   * evento_acesso: admin_sistema nunca é operador de evento (como o auditor). Defesa: o RBAC já não deixa registrar.
-- Sessão: app.sessao_longa só nega 'manter conectado' ao porteiro; o admin_sistema pode pedir sessão longa, como os
-- demais perfis fora da portaria. sessao_motivo_ck não muda (nenhum motivo novo de revogação).
-- CREATE OR REPLACE mantém dono (app_rw) e GRANTs das funções; nenhuma função nova.

-- ===== Matriz RBAC ============================================================================================
-- ===== Bloco gerado (scripts/rbac-sql.mjs migracao) ===========================================================
DELETE FROM public.rbac_matriz;

INSERT INTO public.rbac_acao (acao) VALUES
  ('auditoria.exportar'),
  ('auditoria.selar'),
  ('auditoria.verificar'),
  ('autorizacao.area_comum'),
  ('autorizacao.criar'),
  ('documento.ver'),
  ('encomenda.autorizar_retirada'),
  ('encomenda.operar'),
  ('encomenda.ver'),
  ('evento.corrigir'),
  ('evento.registrar'),
  ('evento.retroativo'),
  ('evento.ver'),
  ('funcionario.gerenciar'),
  ('funcionario.ver'),
  ('importacao.executar'),
  ('lgpd.anonimizar'),
  ('lgpd.exportar'),
  ('lgpd.retencao'),
  ('ocorrencia.operar'),
  ('ocorrencia.ver'),
  ('pessoa.cadastrar_externo'),
  ('pessoa.cadastrar_morador'),
  ('pessoa.desativar'),
  ('pessoa.editar'),
  ('pessoa.ver'),
  ('relatorio.ver'),
  ('restricao.aprovar'),
  ('restricao.criar'),
  ('turno.ver'),
  ('unidade.editar'),
  ('unidade.ver'),
  ('usuario.gerenciar'),
  ('usuario.gerenciar_sindico'),
  ('usuario.ver'),
  ('veiculo.cadastrar'),
  ('vinculo.criar'),
  ('vinculo.decidir'),
  ('vinculo.ver')
ON CONFLICT (acao) DO NOTHING;

INSERT INTO public.rbac_matriz (acao, papel) VALUES
  ('auditoria.exportar', 'sindico'),
  ('auditoria.exportar', 'administracao'),
  ('auditoria.exportar', 'auditor'),
  ('auditoria.selar', 'sindico'),
  ('auditoria.selar', 'auditor'),
  ('auditoria.verificar', 'sindico'),
  ('auditoria.verificar', 'administracao'),
  ('auditoria.verificar', 'auditor'),
  ('autorizacao.area_comum', 'sindico'),
  ('autorizacao.area_comum', 'administracao'),
  ('autorizacao.criar', 'sindico'),
  ('autorizacao.criar', 'administracao'),
  ('autorizacao.criar', 'porteiro'),
  ('documento.ver', 'sindico'),
  ('documento.ver', 'administracao'),
  ('encomenda.autorizar_retirada', 'sindico'),
  ('encomenda.autorizar_retirada', 'administracao'),
  ('encomenda.autorizar_retirada', 'porteiro'),
  ('encomenda.operar', 'sindico'),
  ('encomenda.operar', 'administracao'),
  ('encomenda.operar', 'porteiro'),
  ('encomenda.ver', 'sindico'),
  ('encomenda.ver', 'administracao'),
  ('encomenda.ver', 'porteiro'),
  ('encomenda.ver', 'auditor'),
  ('evento.corrigir', 'sindico'),
  ('evento.corrigir', 'administracao'),
  ('evento.registrar', 'sindico'),
  ('evento.registrar', 'administracao'),
  ('evento.registrar', 'porteiro'),
  ('evento.retroativo', 'sindico'),
  ('evento.retroativo', 'administracao'),
  ('evento.retroativo', 'porteiro'),
  ('evento.ver', 'sindico'),
  ('evento.ver', 'administracao'),
  ('evento.ver', 'porteiro'),
  ('evento.ver', 'auditor'),
  ('funcionario.gerenciar', 'sindico'),
  ('funcionario.gerenciar', 'administracao'),
  ('funcionario.ver', 'sindico'),
  ('funcionario.ver', 'administracao'),
  ('funcionario.ver', 'auditor'),
  ('importacao.executar', 'sindico'),
  ('importacao.executar', 'administracao'),
  ('lgpd.anonimizar', 'sindico'),
  ('lgpd.exportar', 'sindico'),
  ('lgpd.exportar', 'administracao'),
  ('lgpd.retencao', 'sindico'),
  ('ocorrencia.operar', 'sindico'),
  ('ocorrencia.operar', 'administracao'),
  ('ocorrencia.operar', 'porteiro'),
  ('ocorrencia.ver', 'sindico'),
  ('ocorrencia.ver', 'administracao'),
  ('ocorrencia.ver', 'porteiro'),
  ('ocorrencia.ver', 'auditor'),
  ('pessoa.cadastrar_externo', 'sindico'),
  ('pessoa.cadastrar_externo', 'administracao'),
  ('pessoa.cadastrar_externo', 'porteiro'),
  ('pessoa.cadastrar_morador', 'sindico'),
  ('pessoa.cadastrar_morador', 'administracao'),
  ('pessoa.desativar', 'sindico'),
  ('pessoa.desativar', 'administracao'),
  ('pessoa.editar', 'sindico'),
  ('pessoa.editar', 'administracao'),
  ('pessoa.ver', 'sindico'),
  ('pessoa.ver', 'administracao'),
  ('pessoa.ver', 'porteiro'),
  ('pessoa.ver', 'auditor'),
  ('relatorio.ver', 'sindico'),
  ('relatorio.ver', 'administracao'),
  ('relatorio.ver', 'auditor'),
  ('restricao.aprovar', 'sindico'),
  ('restricao.criar', 'sindico'),
  ('restricao.criar', 'administracao'),
  ('restricao.criar', 'porteiro'),
  ('turno.ver', 'sindico'),
  ('turno.ver', 'administracao'),
  ('turno.ver', 'porteiro'),
  ('unidade.editar', 'sindico'),
  ('unidade.editar', 'administracao'),
  ('unidade.ver', 'sindico'),
  ('unidade.ver', 'administracao'),
  ('unidade.ver', 'porteiro'),
  ('unidade.ver', 'auditor'),
  ('usuario.gerenciar', 'sindico'),
  ('usuario.gerenciar', 'admin_sistema'),
  ('usuario.gerenciar_sindico', 'sindico'),
  ('usuario.ver', 'sindico'),
  ('usuario.ver', 'administracao'),
  ('usuario.ver', 'admin_sistema'),
  ('veiculo.cadastrar', 'sindico'),
  ('veiculo.cadastrar', 'administracao'),
  ('vinculo.criar', 'sindico'),
  ('vinculo.criar', 'administracao'),
  ('vinculo.decidir', 'sindico'),
  ('vinculo.decidir', 'administracao'),
  ('vinculo.ver', 'sindico'),
  ('vinculo.ver', 'administracao'),
  ('vinculo.ver', 'auditor');
-- ===== Fim do bloco gerado ======================================================================================

-- ===== Gestão de contas protegidas ================================================================================
CREATE OR REPLACE FUNCTION app.exigir_gestao_sindico(a app.ator_t, p_papeis public.papel[]) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF p_papeis && ARRAY['sindico', 'admin_sistema']::public.papel[] THEN
    PERFORM app.negar_se_nao_pode(a, 'usuario.gerenciar_sindico',
      'Só o síndico gerencia usuários com o papel de síndico ou de administrador do sistema.');
  END IF;
END $$;

-- ===== Rótulo =========================================================================================================
CREATE OR REPLACE FUNCTION app.rotulo_papel(p public.papel) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p WHEN 'sindico' THEN 'Síndico' WHEN 'administracao' THEN 'Administração' WHEN 'porteiro' THEN 'Porteiro'
    WHEN 'auditor' THEN 'Auditor' WHEN 'admin_sistema' THEN 'Administrador do sistema' END
$$;

-- ===== evento_acesso: operador nunca é auditor nem admin_sistema =======================================================
-- Valida as linhas existentes (uma varredura sob o lock do ALTER); todas passam: nenhuma tem o papel novo.
ALTER TABLE public.evento_acesso DROP CONSTRAINT evento_operador_papel_ck;
ALTER TABLE public.evento_acesso ADD CONSTRAINT evento_operador_papel_ck CHECK (operador_papel NOT IN ('auditor', 'admin_sistema'));

-- ===== Listagem e totais: papel novo no filtro e em porPapel (contrato de paginação igual ao da 0039) ==================
CREATE OR REPLACE FUNCTION api.usuarios_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('usuario.ver');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_papel text := app.j_enum(q, 'papel', ARRAY['sindico', 'administracao', 'porteiro', 'auditor', 'admin_sistema']);
  v_situacao text := app.j_enum(q, 'situacao', ARRAY['ativos', 'desativados']);
  termo text := app.sem_acento(app.aparar(coalesce(app.j_texto(q, 'q', 100), '')));
  cur uuid := app.j_uuid(q, 'cursor');
  desl integer := app.j_deslocamento(q);
  padrao text;
  c public.usuario_sistema;
  itens jsonb;
  n integer;
  total bigint;
BEGIN
  IF termo <> '' THEN padrao := '%' || app.escapar_like(termo) || '%'; END IF;
  IF cur IS NOT NULL THEN
    SELECT * INTO c FROM public.usuario_sistema WHERE id = cur AND anonimizado_em IS NULL;
    IF NOT FOUND THEN PERFORM app.erro(400, 'CURSOR_INVALIDO', 'Cursor de paginação inválido.'); END IF;
  END IF;
  WITH base AS (
    SELECT x.id, x.nome FROM public.usuario_sistema x
     WHERE x.anonimizado_em IS NULL
       AND (v_papel IS NULL OR x.papel = v_papel::public.papel)
       AND (v_situacao IS NULL OR x.ativo = (v_situacao = 'ativos'))
       AND (padrao IS NULL OR app.sem_acento(x.nome) LIKE padrao OR lower(x.login) LIKE padrao)
  ), pagina AS (
    SELECT s.id, row_number() OVER (ORDER BY s.nome, s.id) AS i FROM (
      SELECT b.id, b.nome FROM base b WHERE cur IS NULL OR (b.nome, b.id) > (c.nome, c.id)
       ORDER BY b.nome, b.id OFFSET desl LIMIT lim + 1) s
  )
  SELECT coalesce(jsonb_agg(app.usuario_gestao(u) ORDER BY pg.i) FILTER (WHERE pg.i <= lim), '[]'), count(pg.id),
         (SELECT count(*) FROM base)
    INTO itens, n, total FROM pagina pg JOIN public.usuario_sistema u ON u.id = pg.id;
  RETURN jsonb_build_object('itens', itens, 'temMais', n > lim, 'cursor', CASE WHEN n > lim THEN itens -> (lim - 1) ->> 'id' END,
    'total', total);
END $$;

CREATE OR REPLACE FUNCTION api.usuarios_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('usuario.ver');
BEGIN
  RETURN (SELECT jsonb_build_object(
      'ativos', count(*) FILTER (WHERE x.ativo),
      'desativados', count(*) FILTER (WHERE NOT x.ativo),
      'porPapel', jsonb_build_object(
        'sindico', count(*) FILTER (WHERE x.ativo AND x.papel = 'sindico'),
        'administracao', count(*) FILTER (WHERE x.ativo AND x.papel = 'administracao'),
        'porteiro', count(*) FILTER (WHERE x.ativo AND x.papel = 'porteiro'),
        'auditor', count(*) FILTER (WHERE x.ativo AND x.papel = 'auditor'),
        'admin_sistema', count(*) FILTER (WHERE x.ativo AND x.papel = 'admin_sistema')))
    FROM public.usuario_sistema x WHERE x.anonimizado_em IS NULL);
END $$;
