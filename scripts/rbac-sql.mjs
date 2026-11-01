// Gera o SQL da matriz RBAC a partir de src/domain/rbac.ts (fonte única; desenho §2.3).
//   node scripts/rbac-sql.mjs migracao   -> bloco INSERT para uma migração NOVA (nunca editar migração aplicada)
//   node scripts/rbac-sql.mjs teste      -> conteúdo de supabase/tests/database/04_rbac_matriz.test.sql
// O teste de paridade (src/test/rbac-paridade.test.ts) confere que o teste pgTAP commitado é exatamente o gerado
// agora; o pgTAP confere que a tabela do banco é a esperada e que app.exigir() decide igual para papel x ação.
// Cadeia: rbac.ts == teste commitado (vitest) e teste == banco (supabase test db).
import { pathToFileURL } from 'node:url';
import { MATRIZ } from '../src/domain/rbac.ts';

export const PAPEIS = ['sindico', 'administracao', 'porteiro', 'auditor'];

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

export function acoes() {
  return Object.keys(MATRIZ).sort();
}

/** Pares (acao, papel) permitidos, em ordem estável. */
export function pares() {
  return acoes().flatMap((a) => PAPEIS.filter((p) => MATRIZ[a].includes(p)).map((p) => [a, p]));
}

export function sqlMigracao() {
  return [
    'INSERT INTO public.rbac_acao (acao) VALUES',
    acoes().map((a) => `  (${q(a)})`).join(',\n') + ';',
    '',
    'INSERT INTO public.rbac_matriz (acao, papel) VALUES',
    pares().map(([a, p]) => `  (${q(a)}, ${q(p)})`).join(',\n') + ';',
    '',
  ].join('\n');
}

export function sqlTeste() {
  const lista = acoes();
  const total = 2 + lista.length * PAPEIS.length + 1;
  const ids = { sindico: '1', administracao: '2', porteiro: '3', auditor: '4' };
  const linhas = [];
  linhas.push(
    '-- GERADO por `node scripts/rbac-sql.mjs teste` a partir de src/domain/rbac.ts. NÃO editar à mão:',
    '-- o teste src/test/rbac-paridade.test.ts falha se este arquivo divergir do gerado.',
    '-- Matriz RBAC (desenho §3.4, item 2): a tabela do banco é a do TS, e app.exigir() decide igual para cada',
    '-- papel x ação, passando pelo caminho real (claims da JWT -> sessão -> usuário -> papel ATUAL -> rbac_matriz).',
    'BEGIN;',
    'CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;',
    `SELECT plan(${total});`,
    '',
    '-- Fixtures: um usuário e uma sessão válida por papel.',
    'INSERT INTO public.usuario_sistema (id, nome, login, papel, deve_trocar_senha, auth_user_id, auth_email) VALUES',
    PAPEIS.map((p) => `  ('00000000-0000-4000-8000-00000000010${ids[p]}', 'Teste ${p}', 'rbac.${p}', ${q(p)}, false, ` +
      `'00000000-0000-4000-8000-00000000020${ids[p]}', 'u-00000000-0000-4000-8000-00000000030${ids[p]}@usuarios.portaria.invalid')`).join(',\n') + ';',
    'INSERT INTO public.sessao (id, usuario_id, auth_session_id, expira_em) VALUES',
    PAPEIS.map((p) => `  ('00000000-0000-4000-8000-00000000040${ids[p]}', '00000000-0000-4000-8000-00000000010${ids[p]}', ` +
      `'00000000-0000-4000-8000-00000000050${ids[p]}', now() + interval '1 hour')`).join(',\n') + ';',
    '',
    '-- Resultado de app.exigir(acao) com a JWT do papel: \'ok\' ou o código do erro (JSON da mensagem PGRST).',
    'CREATE FUNCTION pg_temp.exigir_como(p_papel text, p_acao text) RETURNS text LANGUAGE plpgsql AS $$',
    'DECLARE n text := CASE p_papel WHEN \'sindico\' THEN \'1\' WHEN \'administracao\' THEN \'2\' WHEN \'porteiro\' THEN \'3\' ELSE \'4\' END;',
    'BEGIN',
    "  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated',",
    "    'sub', '00000000-0000-4000-8000-00000000020' || n, 'session_id', '00000000-0000-4000-8000-00000000050' || n)::text, true);",
    '  PERFORM app.exigir(p_acao);',
    "  RETURN 'ok';",
    'EXCEPTION WHEN SQLSTATE \'PGRST\' THEN',
    "  RETURN (SQLERRM::jsonb) ->> 'code';",
    'END $$;',
    '',
    'SELECT set_eq(',
    "  'SELECT acao FROM public.rbac_acao',",
    `  ARRAY[${lista.map(q).join(', ')}]::text[],`,
    "  'rbac_acao tem exatamente as ações de MATRIZ (rbac.ts)');",
    '',
    'SELECT set_eq(',
    "  'SELECT acao || '':'' || papel::text FROM public.rbac_matriz',",
    `  ARRAY[${pares().map(([a, p]) => q(`${a}:${p}`)).join(', ')}]::text[],`,
    "  'rbac_matriz tem exatamente os pares (ação, papel) de MATRIZ (rbac.ts)');",
    '',
  );
  for (const a of lista) {
    for (const p of PAPEIS) {
      const pode = MATRIZ[a].includes(p);
      linhas.push(`SELECT is(pg_temp.exigir_como(${q(p)}, ${q(a)}), ${q(pode ? 'ok' : 'SEM_PERMISSAO')}, ${q(`${p} ${pode ? 'pode' : 'NÃO pode'} ${a}`)});`);
    }
  }
  linhas.push(
    '',
    "SELECT throws_ok($$SELECT app.pode('sindico', 'acao.inexistente')$$, 'P0001', NULL,",
    "  'ação fora da matriz é erro de programação (falha fechada), não \"permitido\"');",
    '',
    'SELECT * FROM finish();',
    'ROLLBACK;',
    '',
  );
  return linhas.join('\n');
}

const direto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const modo = direto ? process.argv[2] : undefined;
if (modo === 'migracao') process.stdout.write(sqlMigracao());
else if (modo === 'teste') process.stdout.write(sqlTeste());
else if (direto) {
  process.stderr.write('uso: node scripts/rbac-sql.mjs migracao|teste\n');
  process.exit(1);
}
