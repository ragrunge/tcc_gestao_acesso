-- 0040 — Papel novo 'admin_sistema' (Administrador do sistema, F5): o técnico que gerencia as contas sem ver dado
-- pessoal de morador. Só o valor do enum, sozinho no arquivo: o valor criado por ADD VALUE não pode ser USADO na mesma
-- transação ("unsafe use of new value", ver a 0015). O CLI do Supabase aplica cada migração na sua transação, então a
-- 0041 (matriz, guardas, rótulo, listagem) já o enxerga confirmado.
-- Sem efeito sozinha: sem linha em rbac_matriz, app.pode() nega tudo ao papel novo (falha fechada), e nenhuma conta o
-- tem. Desfazer: não há DROP VALUE; um valor sem uso não atrapalha nada.
ALTER TYPE public.papel ADD VALUE IF NOT EXISTS 'admin_sistema';
