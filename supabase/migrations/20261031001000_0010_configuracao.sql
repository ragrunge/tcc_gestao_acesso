-- Porte para o Supabase (F0): removido o marcador `--> statement-breakpoint` do Drizzle (o CLI do Supabase
-- separa os comandos sozinho). Nenhuma outra mudança neste arquivo, salvo as listadas abaixo.

-- Configuração do condomínio. Só *expand*: tabela nova, vazia. Linha única com o agrupamento ("Bloco"/"Torre", que era
-- fixo no código) e o fuso (CHECK fixo em Brasília). Sem a linha, a API usa o agrupamento padrão (ESTRUTURA_PADRAO).
CREATE TABLE "configuracao" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"agrupamento" text NOT NULL,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"criado_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracao_linha_unica_ck" CHECK (id = 1),
	CONSTRAINT "configuracao_agrupamento_ck" CHECK (agrupamento IN ('Bloco', 'Torre')),
	CONSTRAINT "configuracao_fuso_ck" CHECK (fuso = 'America/Sao_Paulo')
);

-- ===== Parte manual =========================================================================================
-- app_rw lê e grava a linha uma vez (como o seed, que roda como app_rw). Sem UPDATE nem DELETE:
-- mudar o agrupamento depois é tela da fase seguinte, com GRANT de coluna próprio.
GRANT SELECT, INSERT ON configuracao TO app_rw;
