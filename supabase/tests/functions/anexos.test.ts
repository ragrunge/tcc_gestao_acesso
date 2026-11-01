// Anexos de ocorrência (F4) contra o Supabase LOCAL: Edge `anexos` + Storage + srv.anexo_* (migração 0033), pelo caminho
// real (login na Edge auth-entrar, fetch na Edge, e o adaptador do front no fim). Pré-requisitos:
//   supabase start && supabase db reset && supabase functions serve --env-file <arquivo com PORTARIA_KEK_V1>
//   npm run test:supabase
// As chaves do stack (anon e service_role, as padrão do CLI local, descartáveis) vêm de `supabase status -o env` em tempo de
// execução; o service_role só é usado aqui para OLHAR e ADULTERAR o bucket como faria quem tem a chave (provar que o
// conteúdo é cifrado e que a adulteração é detectada). A KEK nunca é lida pelo teste.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseApi } from '../../../src/api/supabase/createSupabaseApi';
import { ApiError } from '../../../src/api/types';

const PROJETO = 'tcc-gestao-acesso';
const SENHA_DEMO = 'Demo-Portaria-2026';
const MiB4 = 4 * 1024 * 1024;
const NOME_OBJETO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/;

function ambiente() {
  const saida = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const v = Object.fromEntries(saida.split('\n').map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(v.API_URL ?? '')) throw new Error('API_URL não é o Supabase local: recusando rodar');
  return { url: v.API_URL as string, anon: v.ANON_KEY as string, servico: v.SERVICE_ROLE_KEY as string };
}
const { url: API, anon: ANON, servico: SERVICO } = ambiente();
const admin = createClient(API, SERVICO, { auth: { persistSession: false, autoRefreshToken: false } });

function sql(comando: string): string {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: comando, encoding: 'utf8' }).trim();
}

interface Resp { status: number; corpo: any; bytes: Uint8Array; headers: Headers }
async function req(caminho: string, init: RequestInit & { token?: string } = {}): Promise<Resp> {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${init.token ?? ANON}`, ...(init.headers as Record<string, string> | undefined) },
  });
  const bytes = new Uint8Array(await r.arrayBuffer());
  let corpo: unknown = null;
  try { corpo = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* binário */ }
  return { status: r.status, corpo, bytes, headers: r.headers };
}

async function entrar(login: string): Promise<string> {
  const r = await req('/functions/v1/auth-entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, senha: SENHA_DEMO }) });
  expect(r.status, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo.auth.access_token;
}
async function rpc(token: string, nome: string, args: unknown): Promise<any> {
  const r = await req(`/rest/v1/rpc/${nome}`, { method: 'POST', token, headers: { 'Content-Type': 'application/json', 'Content-Profile': 'api' }, body: JSON.stringify(args) });
  expect(r.status, JSON.stringify(r.corpo)).toBe(200);
  return r.corpo;
}
const novaOcorrencia = async (token: string) => (await rpc(token, 'ocorrencia_criar', { p: { tipo: 'dano', descricao: `Teste F4 ${Date.now()}` } })).id as string;

const enviar = (token: string, oc: string, corpo: BodyInit | null, headers: Record<string, string> = { 'Content-Type': 'application/pdf' }, extra: RequestInit = {}) =>
  req(`/functions/v1/anexos?acao=enviar&ocorrencia=${encodeURIComponent(oc)}`, { method: 'POST', token, headers, body: corpo, ...extra });
const baixar = (token: string, oc: string, doc: string) =>
  req(`/functions/v1/anexos?acao=baixar&ocorrencia=${encodeURIComponent(oc)}&documento=${encodeURIComponent(doc)}`, { method: 'POST', token });

/** PDF fictício com um marcador único: se o marcador aparecer no Storage ou no log, o claro vazou. */
const marcador = `MARCADOR-CLARO-${randomBytes(6).toString('hex')}`;
const pdf = (extra = '') => new TextEncoder().encode(`%PDF-1.7\n% ${marcador}${extra}\n%%EOF\n`);
const jpegDe = (n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };

async function objetosNoBucket(): Promise<string[]> {
  const { data, error } = await admin.storage.from('anexos').list('', { limit: 1000 });
  if (error) throw error;
  return (data ?? []).map((o) => o.name);
}
const documentoUltimo = (r: Resp) => r.corpo.documentos[r.corpo.documentos.length - 1] as { id: string; nome: string; mime: string; tamanhoBytes: number };

let porteiro = '';
let administracao = '';
let sindico = '';
let auditor = '';
let ocPorteiro = '';
let docPdf = '';

beforeAll(async () => {
  sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 0; UPDATE public.login_limite SET falhas = 0, bloqueado_ate = NULL;');
  [porteiro, administracao, sindico, auditor] = await Promise.all(['joao.lima', 'paula.nogueira', 'roberto.faria', 'luiza.campos'].map(entrar));
  ocPorteiro = await novaOcorrencia(porteiro);
}, 60_000);
afterAll(() => { sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 250;'); });

describe('envio', () => {
  it('porteiro anexa PDF na ocorrência que abriu: 201, nome gerado, objeto <id>.bin cifrado no bucket, SHA-256 no banco', async () => {
    const claro = pdf();
    const r = await enviar(porteiro, ocPorteiro, claro, { 'Content-Type': 'text/html' }); // o tipo declarado é ignorado
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const d = documentoUltimo(r);
    docPdf = d.id;
    expect(d).toMatchObject({ mime: 'application/pdf', tamanhoBytes: claro.length, nome: `anexo-${d.id.slice(0, 8)}.pdf` });
    const { data } = await admin.storage.from('anexos').download(`${d.id}.bin`);
    const guardado = new Uint8Array(await data!.arrayBuffer());
    expect(guardado.length).toBe(claro.length + 16);
    expect(Buffer.from(guardado).includes(Buffer.from(marcador)), 'claro no Storage').toBe(false);
    expect(sql(`SELECT sha256_conteudo || '|' || caminho_storage FROM public.documento WHERE id = '${d.id}'`))
      .toBe(`${createHash('sha256').update(claro).digest('hex')}|${d.id}.bin`);
    expect(Number(sql(`SELECT count(*) FROM public.audit_log WHERE acao = 'ocorrencia.anexar' AND registro_id = '${ocPorteiro}'`))).toBe(1);
  });

  it('tipo pelo conteúdo: GIF declarado como PNG, executável e SVG são 415; nada sobe', async () => {
    const antes = (await objetosNoBucket()).length;
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    expect((await enviar(porteiro, ocPorteiro, gif, { 'Content-Type': 'image/png' })).corpo.code).toBe('TIPO_NAO_PERMITIDO');
    expect((await enviar(porteiro, ocPorteiro, new Uint8Array([0x4d, 0x5a, 0x90, 0, 3]), { 'Content-Type': 'application/pdf' })).status).toBe(415);
    expect((await enviar(porteiro, ocPorteiro, new TextEncoder().encode('<svg onload=alert(1)>'), { 'Content-Type': 'image/png' })).status).toBe(415);
    expect((await objetosNoBucket()).length).toBe(antes);
  });

  it('tamanho: vazio 422; exatamente 4 MiB aceito; 4 MiB + 1 e corpo sem Content-Length acima do limite: 413', async () => {
    const oc = await novaOcorrencia(porteiro);
    expect((await enviar(porteiro, oc, new Uint8Array(0))).corpo.code).toBe('ARQUIVO_VAZIO');
    const limite = await enviar(porteiro, oc, jpegDe(MiB4), { 'Content-Type': 'image/jpeg' });
    expect(limite.status, JSON.stringify(limite.corpo)).toBe(201);
    expect(documentoUltimo(limite)).toMatchObject({ mime: 'image/jpeg', tamanhoBytes: MiB4 });
    const antes = (await objetosNoBucket()).length;
    const acima = await enviar(porteiro, oc, jpegDe(MiB4 + 1), { 'Content-Type': 'image/jpeg' });
    expect([acima.status, acima.corpo?.code]).toEqual([413, 'ARQUIVO_GRANDE_DEMAIS']);
    // Sem Content-Length (chunked): o teto vale na leitura, não só no cabeçalho declarado.
    const pedacos = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(jpegDe(1024 * 1024)); for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(1024 * 1024)); c.close(); },
    });
    const chunked = await enviar(porteiro, oc, pedacos as unknown as BodyInit, { 'Content-Type': 'image/jpeg' }, { duplex: 'half' } as RequestInit);
    expect([chunked.status, chunked.corpo?.code]).toEqual([413, 'ARQUIVO_GRANDE_DEMAIS']);
    expect((await objetosNoBucket()).length).toBe(antes);
  });

  it('RBAC antes do upload: porteiro na ocorrência de outro (403), auditor (403), anon (401), encerrada (409); nada sobe', async () => {
    const doAdmin = await novaOcorrencia(administracao);
    const antes = (await objetosNoBucket()).length;
    expect((await enviar(porteiro, doAdmin, pdf())).corpo.code).toBe('SO_PROPRIA_OCORRENCIA');
    expect((await enviar(auditor, ocPorteiro, pdf())).corpo.code).toBe('SEM_PERMISSAO');
    expect((await enviar(ANON, ocPorteiro, pdf())).status).toBe(401);
    await rpc(administracao, 'ocorrencia_alterar_status', { p_id: doAdmin, p_status: 'em_andamento' });
    await rpc(administracao, 'ocorrencia_alterar_status', { p_id: doAdmin, p_status: 'encerrada' });
    expect((await enviar(administracao, doAdmin, pdf())).corpo.code).toBe('OCORRENCIA_ENCERRADA');
    expect((await enviar(administracao, '00000000-0000-4000-8000-000000000000', pdf())).corpo.code).toBe('OCORRENCIA_NAO_ENCONTRADA');
    // A decisão vem antes de ler o corpo (srv.anexo_preparar): quem não pode recebe 403 mesmo mandando arquivo grande demais.
    expect((await enviar(administracao, doAdmin, jpegDe(MiB4 + 1), { 'Content-Type': 'image/jpeg' })).corpo.code).toBe('OCORRENCIA_ENCERRADA');
    const outraDoAdmin = await novaOcorrencia(administracao);
    expect((await enviar(porteiro, outraDoAdmin, jpegDe(MiB4 + 1), { 'Content-Type': 'image/jpeg' })).corpo.code).toBe('SO_PROPRIA_OCORRENCIA');
    expect((await objetosNoBucket()).length).toBe(antes);
  });

  it('path traversal e id inválido na query: 422; todo objeto do bucket é <uuid>.bin', async () => {
    for (const oc of ['../../etc/passwd', `${ocPorteiro}/../x`, `${ocPorteiro}.bin`, '']) {
      expect((await enviar(porteiro, oc, pdf())).corpo.code, oc).toBe('VALIDACAO');
    }
    expect((await baixar(administracao, ocPorteiro, `../${docPdf}`)).corpo.code).toBe('VALIDACAO');
    expect((await req(`/functions/v1/anexos?acao=apagar&ocorrencia=${ocPorteiro}`, { method: 'POST', token: administracao })).corpo.code).toBe('VALIDACAO');
    const nomes = await objetosNoBucket();
    expect(nomes.length).toBeGreaterThan(0);
    for (const n of nomes) expect(n).toMatch(NOME_OBJETO);
  });

  it('duplicado: o mesmo arquivo duas vezes vira dois anexos (ids e objetos distintos), como no legado', async () => {
    const oc = await novaOcorrencia(porteiro);
    const claro = pdf('dup');
    const a = documentoUltimo(await enviar(porteiro, oc, claro));
    const r = await enviar(porteiro, oc, claro);
    expect(r.corpo.documentos).toHaveLength(2);
    expect(documentoUltimo(r).id).not.toBe(a.id);
  });

  it('limite de 5 com dois envios ao mesmo tempo na quarta: um entra, o outro 422 LIMITE_ANEXOS e o objeto dele sai do bucket', async () => {
    const oc = await novaOcorrencia(porteiro);
    for (let i = 0; i < 4; i++) expect((await enviar(porteiro, oc, pdf(String(i)))).status).toBe(201);
    const antes = (await objetosNoBucket()).length;
    const r = await Promise.all([enviar(porteiro, oc, pdf('x')), enviar(administracao, oc, pdf('y'))]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 422]);
    expect(r.find((x) => x.status === 422)!.corpo.code).toBe('LIMITE_ANEXOS');
    expect((await objetosNoBucket()).length).toBe(antes + 1);
    expect(Number(sql(`SELECT count(*) FROM public.ocorrencia_anexo WHERE ocorrencia_id = '${oc}'`))).toBe(5);
    expect((await enviar(porteiro, oc, pdf('z'))).corpo.code).toBe('LIMITE_ANEXOS');
  });
});

describe('leitura', () => {
  it('administração e síndico baixam o original; cabeçalhos de download seguro; cada leitura vai à trilha', async () => {
    const antes = Number(sql(`SELECT count(*) FROM public.audit_log WHERE acao = 'documento.ler' AND registro_id = '${docPdf}'`));
    for (const t of [administracao, sindico]) {
      const r = await baixar(t, ocPorteiro, docPdf);
      expect(r.status, JSON.stringify(r.corpo)).toBe(200);
      expect(Buffer.from(r.bytes).equals(Buffer.from(pdf()))).toBe(true);
      expect(r.headers.get('content-type')).toBe('application/octet-stream');
      expect(r.headers.get('content-disposition')).toBe(`attachment; filename="anexo-${docPdf.slice(0, 8)}.pdf"`);
      expect(r.headers.get('x-anexo-tipo')).toBe('application/pdf');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
    expect(Number(sql(`SELECT count(*) FROM public.audit_log WHERE acao = 'documento.ler' AND registro_id = '${docPdf}'`))).toBe(antes + 2);
  });

  it('porteiro (nem o autor) e auditor não abrem o conteúdo; anon 401; documento de outra ocorrência 404', async () => {
    expect((await baixar(porteiro, ocPorteiro, docPdf)).corpo.code).toBe('SEM_PERMISSAO');
    expect((await baixar(auditor, ocPorteiro, docPdf)).corpo.code).toBe('SEM_PERMISSAO');
    expect((await baixar(ANON, ocPorteiro, docPdf)).status).toBe(401);
    const outra = await novaOcorrencia(porteiro);
    expect((await baixar(administracao, outra, docPdf)).corpo.code).toBe('ANEXO_NAO_ENCONTRADO');
  });

  it('adulteração detectada: objeto de outro anexo (AAD), DEK de outro registro, versão de chave sem KEK, objeto ausente', async () => {
    const oc = await novaOcorrencia(porteiro);
    const a = documentoUltimo(await enviar(porteiro, oc, pdf('A')));
    const b = documentoUltimo(await enviar(porteiro, oc, pdf('B')));
    const c = documentoUltimo(await enviar(porteiro, oc, pdf('C')));
    const d = documentoUltimo(await enviar(porteiro, oc, pdf('D')));
    expect((await baixar(administracao, oc, a.id)).status).toBe(200);
    // Quem tem a chave service_role troca o objeto de A pelo de B no bucket: o GCM recusa (AAD = id de A).
    const { data: objB } = await admin.storage.from('anexos').download(`${b.id}.bin`);
    const { error } = await admin.storage.from('anexos').upload(`${a.id}.bin`, await objB!.arrayBuffer(), { upsert: true, contentType: 'application/octet-stream' });
    expect(error).toBeNull();
    expect((await baixar(administracao, oc, a.id)).corpo.code).toBe('DOCUMENTO_CORROMPIDO');
    // O dono do banco desliga o trigger e põe a DEK (e o nonce) de B no registro de C: a AAD da DEK recusa.
    sql(`BEGIN; ALTER TABLE public.documento DISABLE TRIGGER documento_imutavel;
      UPDATE public.documento SET (dek_cifrada, nonce) = (SELECT dek_cifrada, nonce FROM public.documento WHERE id = '${b.id}') WHERE id = '${c.id}';
      ALTER TABLE public.documento ENABLE TRIGGER documento_imutavel; COMMIT;`);
    expect((await baixar(administracao, oc, c.id)).corpo.code).toBe('DOCUMENTO_CORROMPIDO');
    sql(`BEGIN; ALTER TABLE public.documento DISABLE TRIGGER documento_imutavel;
      UPDATE public.documento SET chave_versao = 7 WHERE id = '${d.id}'; ALTER TABLE public.documento ENABLE TRIGGER documento_imutavel; COMMIT;`);
    expect((await baixar(administracao, oc, d.id)).corpo.code).toBe('CHAVE_INDISPONIVEL');
    // Troca completa (objeto, DEK, nonce e SHA de B no registro E no objeto de E): só a AAD (id) separa os dois.
    const e = documentoUltimo(await enviar(administracao, oc, pdf('E')));
    await admin.storage.from('anexos').upload(`${e.id}.bin`, await objB!.arrayBuffer(), { upsert: true, contentType: 'application/octet-stream' });
    sql(`BEGIN; ALTER TABLE public.documento DISABLE TRIGGER documento_imutavel;
      UPDATE public.documento SET (dek_cifrada, nonce, sha256_conteudo, tamanho_bytes) =
        (SELECT dek_cifrada, nonce, sha256_conteudo, tamanho_bytes FROM public.documento WHERE id = '${b.id}') WHERE id = '${e.id}';
      ALTER TABLE public.documento ENABLE TRIGGER documento_imutavel; COMMIT;`);
    expect((await baixar(administracao, oc, e.id)).corpo.code).toBe('DOCUMENTO_CORROMPIDO');
    await admin.storage.from('anexos').remove([`${b.id}.bin`]);
    expect((await baixar(administracao, oc, b.id)).corpo.code).toBe('DOCUMENTO_INDISPONIVEL');
    expect(Boolean(sql(`SELECT 1 FROM public.documento WHERE id = '${b.id}'`))).toBe(true);
  });
});

describe('Storage direto: anon e authenticated não leem nem escrevem nada no bucket', () => {
  const clientes = () => ({
    anon: createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } }),
    authenticated: createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${administracao}` } } }),
  });

  it('download (rota normal, authenticated e public), URL assinada, listagem e info: nada sai', async () => {
    const objeto = `${docPdf}.bin`;
    for (const [papel, sb] of Object.entries(clientes())) {
      const token = papel === 'anon' ? ANON : administracao;
      const st = sb.storage.from('anexos');
      expect((await st.download(objeto)).data, `${papel} download`).toBeNull();
      expect((await st.createSignedUrl(objeto, 60)).data, `${papel} assinar`).toBeNull();
      expect((await st.createSignedUrls([objeto], 60)).data ?? [], `${papel} assinar vários`).toSatisfy((x: { signedUrl?: string | null }[]) => x.every((y) => !y.signedUrl));
      const lista = await st.list('', { limit: 100 });
      expect(lista.data ?? [], `${papel} listar`).toEqual([]);
      for (const rota of [`/storage/v1/object/anexos/${objeto}`, `/storage/v1/object/authenticated/anexos/${objeto}`, `/storage/v1/object/public/anexos/${objeto}`,
        `/storage/v1/object/info/anexos/${objeto}`, `/storage/v1/object/info/authenticated/anexos/${objeto}`, '/storage/v1/bucket/anexos']) {
        const r = await req(rota, { token });
        expect(r.status, `${papel} GET ${rota}`).toBeGreaterThanOrEqual(400);
        expect(Buffer.from(r.bytes).includes(Buffer.from('%PDF')), `${papel} conteúdo em ${rota}`).toBe(false);
      }
      const buckets = await sb.storage.listBuckets();
      expect((buckets.data ?? []).some((b) => b.id === 'anexos'), `${papel} vê o bucket`).toBe(false);
    }
  });

  it('upload, sobrescrita, mover, copiar e apagar: recusados, e o bucket fica igual', async () => {
    const objeto = `${docPdf}.bin`;
    const antes = await objetosNoBucket();
    const { data: original } = await admin.storage.from('anexos').download(objeto);
    const bytesAntes = Buffer.from(await original!.arrayBuffer());
    for (const [papel, sb] of Object.entries(clientes())) {
      const st = sb.storage.from('anexos');
      const intruso = `${crypto.randomUUID()}.bin`;
      expect((await st.upload(intruso, new Uint8Array([1, 2, 3]), { contentType: 'application/octet-stream' })).error, `${papel} upload`).not.toBeNull();
      expect((await st.upload(objeto, new Uint8Array([1, 2, 3]), { upsert: true, contentType: 'application/octet-stream' })).error, `${papel} sobrescrever`).not.toBeNull();
      expect((await st.update(objeto, new Uint8Array([1, 2, 3]), { contentType: 'application/octet-stream' })).error, `${papel} update`).not.toBeNull();
      expect((await st.createSignedUploadUrl(intruso)).data, `${papel} URL de upload`).toBeNull();
      expect((await st.move(objeto, intruso)).error, `${papel} mover`).not.toBeNull();
      expect((await st.copy(objeto, intruso)).error, `${papel} copiar`).not.toBeNull();
      const apagar = await st.remove([objeto]);
      expect(apagar.data ?? [], `${papel} apagar`).toEqual([]);
      expect((await sb.storage.createBucket(`anexos-${papel}`)).error, `${papel} criar bucket`).not.toBeNull();
      expect((await sb.storage.updateBucket('anexos', { public: true })).error, `${papel} tornar público`).not.toBeNull();
      expect((await sb.storage.emptyBucket('anexos')).error ?? null, `${papel} esvaziar`).not.toBeNull();
    }
    expect(await objetosNoBucket()).toEqual(antes);
    const { data: depois } = await admin.storage.from('anexos').download(objeto);
    expect(Buffer.from(await depois!.arrayBuffer()).equals(bytesAntes)).toBe(true);
    expect(sql("SELECT public::text FROM storage.buckets WHERE id = 'anexos'")).toBe('false');
  });
});

describe('adaptador do front (createSupabaseApi)', () => {
  it('anexar(File) ignora o nome e o tipo do arquivo; baixarAnexo devolve o Blob original com o nome gerado', async () => {
    const sb = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const api = createSupabaseApi(sb, { chaveAnon: ANON });
    await api.auth.login({ login: 'paula.nogueira', senha: SENHA_DEMO });
    expect(api.suporta!('anexos')).toBe(true);
    const oc = await api.ocorrencias.criar({ tipo: 'dano', descricao: 'Pelo adaptador', unidadeId: null });
    const claro = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...randomBytes(64)]);
    const v = await api.ocorrencias.anexar(oc.id, new File([claro], '../../Fulano de Tal CPF 123.pdf', { type: 'application/pdf' }));
    const d = v.documentos![0]!;
    expect(d).toMatchObject({ mime: 'image/png', nome: `anexo-${d.id.slice(0, 8)}.png`, enviadoPorNome: expect.any(String) });
    expect(JSON.stringify(v)).not.toContain('Fulano');
    const a = await api.ocorrencias.baixarAnexo(oc.id, d.id);
    expect(a).toMatchObject({ nome: d.nome, mime: 'image/png' });
    expect(a.conteudo.type).toBe('image/png');
    expect(Buffer.from(await a.conteudo.arrayBuffer()).equals(Buffer.from(claro))).toBe(true);
    const erro = await api.ocorrencias.anexar(oc.id, new File([new Uint8Array(0)], 'vazio.pdf')).catch((e) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).code).toBe('ARQUIVO_VAZIO');
  });
});

describe('higiene', () => {
  it('nem o conteúdo em claro, nem token aparecem no log das Edge Functions', () => {
    const r = spawnSync('docker', ['logs', `supabase_edge_runtime_${PROJETO}`], { encoding: 'utf8' });
    const log = `${r.stdout}${r.stderr}`;
    expect(log.length).toBeGreaterThan(0);
    expect(log.includes(marcador), 'conteúdo do anexo no log').toBe(false);
    expect(log.includes('Fulano'), 'nome do arquivo no log').toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(log), 'JWT no log').toBe(false);
  });
});
