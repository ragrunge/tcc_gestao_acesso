-- Estrutura do condomínio, complemento da 0035: o apartamento 02 do térreo dos blocos G, H e I, para chegar às 165
-- unidades do estudo de caso (6 blocos com 18 unidades e 3 com 19). PROVISÓRIO: a distribuição foi escolhida para a
-- demonstração e ainda depende do síndico; confirmada outra, corrigir pelas telas de unidade, com trilha.
--
-- A 0035 já foi aplicada no projeto hospedado e não é editada. Esta segue a mesma regra: só INSERT, nunca UPDATE nem
-- DELETE, reaplicável sem mudar nada. Unidade que já existe (inclusive desativada) fica como está, e não se cria
-- unidade num bloco que não existe mais (bloco renomeado pelo sistema).
INSERT INTO public.unidade (bloco, numero)
SELECT b, '02'
  FROM unnest(ARRAY['G', 'H', 'I']) b
 WHERE EXISTS (SELECT 1 FROM public.unidade x WHERE x.bloco = b)
ON CONFLICT (bloco, numero) DO NOTHING;
