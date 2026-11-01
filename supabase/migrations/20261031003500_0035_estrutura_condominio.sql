-- Estrutura do condomínio (carga inicial): configuração, o ponto de acesso, as áreas comuns e as unidades. Sem isso
-- ninguém registra entrada (app.ponto_padrao). Saiu do seed (só local) para cá, para chegar ao projeto hospedado pelo
-- mesmo `db push` das outras migrações. Nenhum usuário, pessoa ou senha: isso é demonstração (supabase/seed/demo.sql).
--
-- Só INSERT, nunca UPDATE nem DELETE: reaplicada num banco já usado, não muda nada (o id do ponto e das unidades entra
-- no hash dos eventos; nada aqui o troca). As unidades só entram com a tabela vazia: depois da carga, a estrutura é do
-- sistema (api.unidade_criar/editar/desativar, com trilha), e esta migração não recria unidade desativada nem renumerada.
--
-- Estrutura do estudo de caso (ESTRUTURA_PADRAO de src/domain/units.ts): 9 blocos (A a I), térreo e 4 andares, 4
-- apartamentos por andar, sem 01 e 02 no térreo = 162 unidades. PROVISÓRIO: a contagem (162 ou 165) ainda depende do
-- síndico. Confirmada antes do primeiro push, corrigir aqui; depois, pelas telas de unidade.
INSERT INTO public.configuracao (id, agrupamento) VALUES (1, 'Bloco')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ponto_acesso (nome) VALUES ('Portaria social')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.area_comum (nome)
SELECT unnest(ARRAY['Salão de festas', 'Piscina', 'Quadra', 'Academia', 'Administração', 'Casa de máquinas', 'Jardins'])
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.unidade (bloco, numero)
SELECT b, lpad((andar * 10 + final)::text, 2, '0')
  FROM unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) b, generate_series(0, 4) andar, generate_series(1, 4) final
 WHERE NOT (andar = 0 AND final IN (1, 2))
   AND NOT EXISTS (SELECT 1 FROM public.unidade);
