-- 0038 — Listagem e totais dos usuários do sistema (tela de Usuários, F5). Só leitura: a gestão (criar, desativar,
-- reativar, redefinir senha) continua na Edge usuarios-admin e nas srv.usuario_* da 0018, sem mudança.
-- Mesmo contrato da 0037: api.*, dono app_rw, SECURITY DEFINER, search_path vazio, app.exigir na primeira linha
-- (usuario.gerenciar, a mesma ação da gestão), `deslocamento` ou `cursor` (os dois juntos: 400), teto de 100 por página,
-- `total` contado no mesmo conjunto filtrado e desempate por id.
-- O item é app.usuario_gestao (0018): sem auth_user_id nem o e-mail sintético. Usuário anonimizado pela retenção fica
-- fora da listagem e dos totais: o login dele foi trocado por 'anonimizado-<id>' e não pode ser reativado (0018).
-- A busca `q` (nome ou login, sem acento) vai só no corpo do POST e não é gravada em lugar nenhum.

CREATE FUNCTION api.usuarios_listar(p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  a app.ator_t := app.exigir('usuario.gerenciar');
  q jsonb := app.j_objeto(p);
  lim integer := app.j_limite(q, 50, 100);
  v_papel text := app.j_enum(q, 'papel', ARRAY['sindico', 'administracao', 'porteiro', 'auditor']);
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

-- `ativos`, `desativados` e `porPapel` (só ativos) são o `total` de usuarios_listar com o filtro correspondente, sem busca.
CREATE FUNCTION api.usuarios_resumo() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE a app.ator_t := app.exigir('usuario.gerenciar');
BEGIN
  RETURN (SELECT jsonb_build_object(
      'ativos', count(*) FILTER (WHERE x.ativo),
      'desativados', count(*) FILTER (WHERE NOT x.ativo),
      'porPapel', jsonb_build_object(
        'sindico', count(*) FILTER (WHERE x.ativo AND x.papel = 'sindico'),
        'administracao', count(*) FILTER (WHERE x.ativo AND x.papel = 'administracao'),
        'porteiro', count(*) FILTER (WHERE x.ativo AND x.papel = 'porteiro'),
        'auditor', count(*) FILTER (WHERE x.ativo AND x.papel = 'auditor')))
    FROM public.usuario_sistema x WHERE x.anonimizado_em IS NULL);
END $$;

-- ===== Posse e EXECUTE (fail-closed) ==================================================================================
ALTER FUNCTION api.usuarios_listar(jsonb) OWNER TO app_rw;
ALTER FUNCTION api.usuarios_resumo() OWNER TO app_rw;
REVOKE ALL ON FUNCTION api.usuarios_listar(jsonb), api.usuarios_resumo() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.usuarios_listar(jsonb), api.usuarios_resumo() TO authenticated;
