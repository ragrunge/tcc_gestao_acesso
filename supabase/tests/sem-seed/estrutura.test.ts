// Estrutura do condomínio (migração 0035) contra o Supabase LOCAL SEM seed, o estado em que o projeto hospedado fica
// depois do `db push`. Roda no `npm run test:supabase:sindico` (faz `supabase db reset --no-seed`), junto com o
// bootstrap do síndico; por isso nada aqui depende de rodar antes ou depois dele.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTAINER = 'supabase_db_tcc-gestao-acesso';
const raiz = (caminho: string) => fileURLToPath(new URL(`../../../${caminho}`, import.meta.url));
const ESTRUTURA = readFileSync(raiz('supabase/migrations/20261031003500_0035_estrutura_condominio.sql'), 'utf8');
const DEMO = readFileSync(raiz('supabase/seed/demo.sql'), 'utf8');

// Mesmo papel do `db push` (postgres: dono das tabelas, não superusuário).
const sql = (comando: string): string => execFileSync('docker',
  ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { input: comando, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const valor = (consulta: string) => sql(consulta);

beforeAll(() => {
  if (Number(valor('SELECT count(*) FROM public.pessoa')) !== 0) {
    throw new Error('Banco com seed: rode `npm run test:supabase:sindico` (faz supabase db reset --no-seed).');
  }
});

describe('estrutura do condomínio sem a demonstração', () => {
  it('só as migrações deixam unidades, áreas, a portaria e a configuração', () => {
    expect(valor(`SELECT count(*) || '|' || count(DISTINCT bloco) || '|' || bool_and(ativo)
                    || '|' || count(*) FILTER (WHERE numero IN ('01', '02')) FROM public.unidade`)).toBe('162|9|true|0');
    expect(valor(`SELECT string_agg(bloco, '' ORDER BY bloco) FROM (SELECT DISTINCT bloco FROM public.unidade) b`)).toBe('ABCDEFGHI');
    expect(valor(`SELECT min(numero) || '|' || max(numero) FROM public.unidade`)).toBe('03|44');
    expect(valor(`SELECT string_agg(nome || ':' || ativo, ',' ORDER BY nome) FROM public.ponto_acesso`)).toBe('Portaria social:true');
    expect(valor(`SELECT id || '|' || agrupamento || '|' || fuso FROM public.configuracao`)).toBe('1|Bloco|America/Sao_Paulo');
    expect(valor(`SELECT string_agg(nome, ',' ORDER BY nome) FROM public.area_comum WHERE ativo`))
      .toBe('Academia,Administração,Casa de máquinas,Jardins,Piscina,Quadra,Salão de festas');
    // A portaria resolve o ponto padrão sem erro (é o que a entrada usa).
    expect(valor(`SELECT app.ponto_padrao() = (SELECT id FROM public.ponto_acesso WHERE nome = 'Portaria social')`)).toBe('t');
  });

  it('nada da demonstração: nenhuma pessoa, nenhum cadastro, nenhum usuário além do bootstrap, nenhuma senha de demo', () => {
    for (const t of ['pessoa', 'vinculo_unidade', 'veiculo', 'funcionario', 'autorizacao_previa', 'restricao', 'evento_acesso',
      'encomenda', 'ocorrencia']) {
      expect(`${t}=${valor(`SELECT count(*) FROM public.${t}`)}`).toBe(`${t}=0`);
    }
    expect(valor(`SELECT count(*) FROM public.usuario_sistema WHERE login IN ('roberto.faria', 'paula.nogueira', 'joao.lima', 'luiza.campos')`)).toBe('0');
    // Todo usuário tem a criação na trilha (bootstrap ou tela, da outra suíte deste banco); a estrutura não cria nenhum.
    expect(valor(`SELECT count(*) FROM public.usuario_sistema u
                   WHERE NOT EXISTS (SELECT 1 FROM public.audit_log a WHERE a.acao = 'usuario.criar' AND a.registro_id = u.id)`)).toBe('0');
    expect(valor(`SELECT count(*) FROM auth.users WHERE encrypted_password = extensions.crypt('Demo-Portaria-2026', encrypted_password)`)).toBe('0');
  });

  it('o arquivo da estrutura só insere nas 4 tabelas de estrutura e não cita usuário, Auth nem senha', () => {
    const codigo = ESTRUTURA.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    const alvos = [...codigo.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|MERGE\s+INTO)\s+([\w.]+)/gi)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
    expect(alvos.sort()).toEqual(['INSERT INTO public.area_comum', 'INSERT INTO public.configuracao', 'INSERT INTO public.ponto_acesso', 'INSERT INTO public.unidade']);
    expect(codigo).not.toMatch(/\bauth\.|usuario_sistema|crypt|senha|password|Demo-Portaria|\bpessoa\b/i);
  });

  it('reaplicada num banco já usado não muda nada: estrutura editada pelo sistema, eventos e cadeia de hash intactos', () => {
    const saida = sql(`
      BEGIN;
      INSERT INTO public.usuario_sistema (id, nome, login, papel) VALUES ('00000000-0000-4000-8000-0000000000e1', 'Porteiro Teste', 'porteiro.estrutura', 'porteiro');
      INSERT INTO public.pessoa (id, nome, categoria, telefone, documento_mascarado, documento_busca)
      VALUES ('00000000-0000-4000-8000-0000000000e2', 'Morador Teste', 'morador', '11900000999', '***.820.910-**', repeat('e', 64));
      INSERT INTO public.evento_acesso (tipo, categoria_pessoa, pessoa_id, unidade_destino_id, ponto_acesso_id, operador_id, operador_papel)
      SELECT 'entrada', 'morador', '00000000-0000-4000-8000-0000000000e2', u.id, app.ponto_padrao(), '00000000-0000-4000-8000-0000000000e1', 'porteiro'
        FROM public.unidade u WHERE u.bloco || '-' || u.numero IN ('A-11', 'B-21');
      -- O que o sistema permite fazer com a estrutura depois da carga.
      UPDATE public.unidade SET ativo = false WHERE bloco = 'A' AND numero = '03';
      UPDATE public.unidade SET numero = '45' WHERE bloco = 'I' AND numero = '44';
      INSERT INTO public.unidade (bloco, numero) VALUES ('J', '01');
      UPDATE public.area_comum SET ativo = false WHERE nome = 'Quadra';
      UPDATE public.ponto_acesso SET ativo = false WHERE nome = 'Portaria social';
      UPDATE public.configuracao SET agrupamento = 'Torre' WHERE id = 1;
      CREATE FUNCTION pg_temp.foto() RETURNS text LANGUAGE sql AS $f$
        SELECT md5(concat_ws('|',
          (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM public.unidade x),
          (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM public.area_comum x),
          (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM public.ponto_acesso x),
          (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM public.configuracao x),
          (SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.seq) FROM public.evento_acesso x),
          (SELECT to_jsonb(x)::text FROM public.evento_acesso_cadeia x),
          (SELECT count(*)::text FROM public.audit_log)))
      $f$;
      CREATE TEMP TABLE antes AS SELECT pg_temp.foto() AS f, (SELECT count(*) FROM public.unidade) AS n;
      ${ESTRUTURA}
      ${ESTRUTURA}
      SELECT 'igual=' || ((SELECT f FROM antes) = pg_temp.foto()) || ';unidades=' || (SELECT n FROM antes) || '>' || (SELECT count(*) FROM public.unidade)
          || ';eventos=' || (SELECT count(*) FROM public.evento_acesso)
          || ';hash_invalido=' || (SELECT count(*) FROM public.evento_acesso e LEFT JOIN public.evento_acesso p ON p.seq = e.seq - 1
                                    WHERE e.hash <> encode(sha256(convert_to(e.hash_anterior || public.evento_acesso_canonico(e), 'UTF8')), 'hex')
                                       OR e.hash_anterior <> coalesce(p.hash, encode(sha256(convert_to('genesis', 'UTF8')), 'hex')))
          || ';cabeca=' || ((SELECT ultimo_hash FROM public.evento_acesso_cadeia) = (SELECT hash FROM public.evento_acesso ORDER BY seq DESC LIMIT 1));
      ROLLBACK;`);
    expect(saida).toBe('igual=true;unidades=163>163;eventos=2;hash_invalido=0;cabeca=true');
  });

  it('a demonstração recusa banco que já tem usuário (o hospedado depois do primeiro síndico)', () => {
    let erro = '';
    try {
      sql(`BEGIN;
        INSERT INTO public.usuario_sistema (nome, login, papel) VALUES ('Síndico Teste', 'sindico.estrutura', 'sindico');
        ${DEMO}`);
    } catch (e) {
      erro = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(erro).toContain('seed de demonstração recusado');
    expect(valor(`SELECT count(*) FROM public.pessoa`)).toBe('0');
  });
});
