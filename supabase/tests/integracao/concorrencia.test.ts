// Concorrência do registro de acesso contra o Supabase LOCAL (desenho §3.4, fim; porte de
// apps/api/test/postgres-real/eventos-concorrencia.test.ts). Pelo caminho real: login na Edge auth-entrar, RPCs pelo
// PostgREST em paralelo, cada uma na sua transação. Depois, a cadeia gravada é verificada pelo verificador INDEPENDENTE
// do domain (verificarCadeia, TS), a partir da cabeça lida antes.
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve.
import { execFileSync } from 'node:child_process';
import { verificarCadeia, type EventoExportado } from '@domain/hashChain';

const PROJETO = 'tcc-gestao-acesso';
const SENHA_DEMO = 'Demo-Portaria-2026';

function ambiente() {
  const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '')) throw new Error('API_URL não é o Supabase local: recusando rodar');
  return { url: v.API_URL as string, anon: v.ANON_KEY as string };
}
const { url: API, anon: ANON } = ambiente();

function sql(comando: string): string {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: comando, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

async function post(caminho: string, corpo: unknown, token = ANON, perfil?: string) {
  const r = await fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}`, ...(perfil ? { 'Content-Profile': perfil } : {}) },
    body: JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json: any = texto;
  try { json = JSON.parse(texto); } catch { /* não JSON */ }
  return { status: r.status, corpo: json };
}
const rpc = (nome: string, corpo: unknown, token: string) => post(`/rest/v1/rpc/${nome}`, corpo, token, 'api');

let token = '';
let moradora = '';
let unidade = '';
const visitantes: string[] = [];

beforeAll(async () => {
  sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 0; UPDATE public.login_limite SET falhas = 0, bloqueado_ate = NULL;');
  const r = await post('/functions/v1/auth-entrar', { login: 'joao.lima', senha: SENHA_DEMO });
  expect(r.status, JSON.stringify(r.corpo)).toBe(200);
  token = r.corpo.auth.access_token;
  [moradora, unidade] = sql(`SELECT p.id || '|' || u.id FROM public.pessoa p JOIN public.vinculo_unidade v ON v.pessoa_id = p.id
    JOIN public.unidade u ON u.id = v.unidade_id WHERE p.nome = 'Fernanda Costa'`).split('|') as [string, string];
  // 31 visitantes novos (fictícios, sem CPF não servem: só entram por exceção) com CPF de teste válido.
  const ids = sql(`
    CREATE FUNCTION pg_temp.cpf(p_base bigint) RETURNS text LANGUAGE plpgsql AS $$
    DECLARE d text := lpad(p_base::text, 9, '0'); s integer; r integer;
    BEGIN
      FOR n IN 9..10 LOOP s := 0; FOR i IN 1..n LOOP s := s + substr(d, i, 1)::integer * (n + 2 - i); END LOOP;
        r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF; d := d || r::text; END LOOP;
      RETURN d;
    END $$;
    WITH novos AS (
      INSERT INTO public.pessoa (nome, categoria, documento_mascarado, documento_busca, telefone)
      SELECT 'Concorrente ' || g || ' ' || substr(md5(random()::text), 1, 6), 'visitante', app.mascarar_cpf(c, 'inicio'), public.cpf_hmac(c), '11900009' || lpad(g::text, 3, '0')
        FROM generate_series(1, 31) g, LATERAL (SELECT pg_temp.cpf(800000000 + g * 1000003 + (random() * 999)::bigint) AS c) x
      ON CONFLICT DO NOTHING RETURNING id)
    SELECT string_agg(id::text, ',') FROM novos;`);
  visitantes.push(...ids.split(','));
  expect(visitantes.length).toBe(31);
});

afterAll(() => { sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 250;'); });

/** Linhas gravadas a partir de um seq, no formato de exportação que o verificador TS consome. */
function exportadosDesde(seq: number): EventoExportado[] {
  const iso = (c: string) => `to_char(${c} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  return JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('v', formato_hash, 'seq', seq, 'id', id, 'tipo', tipo, 'categoria_pessoa', categoria_pessoa,
      'pessoa_id', pessoa_id, 'unidade_destino_id', unidade_destino_id, 'area_comum_id', area_comum_id, 'ponto_acesso_id', ponto_acesso_id,
      'autorizado_por_tipo', autorizado_por_tipo, 'autorizado_por_pessoa_id', autorizado_por_pessoa_id, 'autorizacao_previa_id', autorizacao_previa_id,
      'justificativa', justificativa, 'restricao_id', restricao_id, 'operador_id', operador_id, 'operador_papel', operador_papel,
      'ocorrido_em', ${iso('ocorrido_em')}, 'registrado_em', ${iso('registrado_em')}, 'retroativo', retroativo,
      'formulario_contingencia', formulario_contingencia, 'refere_evento_id', refere_evento_id, 'corrige_evento_id', corrige_evento_id,
      'correcao_valores', correcao_valores, 'empresa', empresa, 'servico', servico, 'observacao', observacao, 'hash_anterior', hash_anterior, 'hash', hash)
      || CASE WHEN formato_hash = 2 THEN jsonb_build_object('veiculo_placa', veiculo_placa, 'veiculo_modelo', veiculo_modelo, 'veiculo_cor', veiculo_cor) ELSE '{}' END
      ORDER BY seq), '[]') FROM public.evento_acesso WHERE seq > ${seq}`));
}
const cabeca = () => { const [s, h] = sql('SELECT ultimo_seq || \'|\' || ultimo_hash FROM public.evento_acesso_cadeia WHERE id = 1').split('|'); return { seq: Number(s), hash: h! }; };

describe('concorrência das RPCs de evento (Supabase local)', () => {
  it('30 entradas simultâneas de pessoas diferentes: todas gravadas, seq contíguo e cadeia íntegra pelo verificador TS', async () => {
    const antes = cabeca();
    const rs = await Promise.all(visitantes.slice(0, 30).map((p, i) => rpc('evento_entrada', { p: {
      pessoaId: p, unidadeDestinoId: unidade, autorizadoPorTipo: 'interfone', autorizadoPorPessoaId: moradora,
      ...(i % 3 === 0 ? { veiculo: { placa: `ABC${String(1000 + i)}`, modelo: 'Gol' } } : {}),
    } }, token)));
    expect(rs.map((r) => r.status)).toEqual(Array(30).fill(200));
    expect(rs.every((r) => r.corpo.resultado === 'entrada')).toBe(true);
    const evs = exportadosDesde(antes.seq);
    expect(evs.length).toBe(30);
    expect(evs.map((e) => e.seq)).toEqual(Array.from({ length: 30 }, (_, i) => antes.seq + 1 + i));
    const v = await verificarCadeia(evs, antes);
    expect(v).toMatchObject({ valido: true, verificados: 30, ultimoSeq: antes.seq + 30 });
    expect(cabeca()).toEqual({ seq: v.ultimoSeq, hash: v.ultimoHash });
  });

  it('5 entradas simultâneas da MESMA pessoa: 1 grava, 4 recebem JA_ESTA_DENTRO (sem duplicar)', async () => {
    const p = visitantes[30]!;
    const rs = await Promise.all(Array.from({ length: 5 }, () => rpc('evento_entrada', { p: {
      pessoaId: p, unidadeDestinoId: unidade, autorizadoPorTipo: 'interfone', autorizadoPorPessoaId: moradora } }, token)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && r.corpo.code === 'JA_ESTA_DENTRO')).toHaveLength(4);
    expect(Number(sql(`SELECT count(*) FROM public.evento_acesso WHERE tipo = 'entrada' AND pessoa_id = '${p}'`))).toBe(1);
  });

  it('5 saídas simultâneas da mesma entrada: 1 grava, 4 recebem SAIDA_JA_REGISTRADA', async () => {
    const entrada = sql(`SELECT id FROM public.evento_acesso WHERE tipo = 'entrada' AND pessoa_id = '${visitantes[30]}'`);
    const rs = await Promise.all(Array.from({ length: 5 }, () => rpc('evento_saida', { p_entrada: entrada, p: {} }, token)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && r.corpo.code === 'SAIDA_JA_REGISTRADA')).toHaveLength(4);
  });

  it('prorrogações simultâneas da mesma entrada: nenhuma ordem repetida, no máximo 4', async () => {
    const entrada = sql(`SELECT id FROM public.evento_acesso WHERE tipo = 'entrada' AND pessoa_id = '${visitantes[0]}'`);
    const rs = await Promise.all(Array.from({ length: 6 }, () => rpc('evento_prorrogar', { p_entrada: entrada }, token)));
    const ok = rs.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(rs.every((r) => r.status === 200 || (r.status === 409 && r.corpo.code === 'PRORROGACAO_CONCORRENTE') || r.corpo.code === 'PRORROGACAO_LIMITE')).toBe(true);
    const ordens = sql(`SELECT string_agg(ordem::text, ',' ORDER BY ordem) FROM public.permanencia WHERE evento_entrada_id = '${entrada}'`).split(',').map(Number);
    expect(ordens).toEqual(Array.from({ length: ordens.length }, (_, i) => i));
    expect(ordens.length - 1).toBe(ok.length);
  });

  it('o resultado bate com o verificador TS sobre a cadeia INTEIRA (desde a gênese)', async () => {
    const v = await verificarCadeia(exportadosDesde(0));
    expect(v.valido).toBe(true);
    expect(v.ultimoSeq).toBe(cabeca().seq);
  });
});
