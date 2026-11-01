// Operação (F3) contra o Supabase LOCAL, pelo caminho real: login na Edge auth-entrar, o ADAPTADOR do front
// (createSupabaseApi com o supabase-js de verdade) falando com o PostgREST. Cobre o que pgTAP não cobre: concorrência entre
// transações (duas retiradas e duas decisões ao mesmo tempo), a verificação da cadeia no navegador sobre o banco real
// (e a adulteração detectada), a exportação JSONL que confere com o verificador e a importação de ponta a ponta.
// Pré-requisitos: supabase start && supabase db reset && supabase functions serve.
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { lerExportacaoJsonl } from '@portaria/domain/exportacao';
import { verificarCadeia } from '@portaria/domain/hashChain';
import { createSupabaseApi } from '../../../src/api/supabase/createSupabaseApi';
import { ApiError, type Api } from '../../../src/api/types';

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

/** Um "navegador": cliente supabase-js próprio (sessão em memória) + o adaptador do front. */
async function entrar(login: string): Promise<Api> {
  const sb = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const api = createSupabaseApi(sb, { chaveAnon: ANON });
  await api.auth.login({ login, senha: SENHA_DEMO });
  return api;
}
async function codigo(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { if (e instanceof ApiError) return e.code; throw e; }
}
/** CPF de teste com dígito verificador (só local). */
function cpf(base: string): string {
  const d = base.split('').map(Number);
  for (const n of [9, 10]) {
    const r = (d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0) * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join('');
}
const sufixo = String(Date.now()).slice(-6);

let porteiro: Api;
let porteiro2: Api;
let admin: Api;
let sindico: Api;
let auditor: Api;
let moradora = '';
let unidade = '';

beforeAll(async () => {
  sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 0; UPDATE public.login_limite SET falhas = 0, bloqueado_ate = NULL;');
  [porteiro, porteiro2, admin, sindico, auditor] = await Promise.all(['joao.lima', 'joao.lima', 'paula.nogueira', 'roberto.faria', 'luiza.campos'].map(entrar));
  [moradora, unidade] = sql(`SELECT p.id || '|' || u.id FROM public.pessoa p JOIN public.vinculo_unidade v ON v.pessoa_id = p.id
    JOIN public.unidade u ON u.id = v.unidade_id WHERE p.nome = 'Fernanda Costa'`).split('|') as [string, string];
}, 60_000);

afterAll(() => { sql('UPDATE public.auth_parametros SET login_atraso_base_ms = 250;'); });

describe('concorrência (cada RPC na sua transação)', () => {
  it('duas retiradas da mesma encomenda ao mesmo tempo: uma entrega, a outra 409 ENCOMENDA_JA_ENTREGUE', async () => {
    const e = await porteiro.encomendas.receber({ unidadeId: unidade, destinatario: 'Fernanda', transportadora: '', codigoRastreio: '', unidadeConfirmada: true });
    const r = await Promise.all([codigo(porteiro.encomendas.entregar({ id: e.id, pessoaId: moradora })), codigo(porteiro2.encomendas.entregar({ id: e.id, pessoaId: moradora }))]);
    expect(r.sort()).toEqual(['ENCOMENDA_JA_ENTREGUE', 'ok']);
    expect(sql(`SELECT count(*) FROM public.audit_log WHERE acao = 'encomenda.entregar' AND registro_id = '${e.id}'`)).toBe('1');
  });

  it('aprovar e rejeitar o mesmo vínculo ao mesmo tempo: só uma decisão vale', async () => {
    const p = await admin.pessoas.criar({ nome: `Concorrência Vínculo ${sufixo}`, documento: cpf(`7${sufixo}11`), telefone: '11977001100', categoria: 'morador' });
    const v = await admin.vinculos.criar({ pessoaId: p.id, unidadeId: unidade, tipo: 'proprietario', vigenciaInicio: null, vigenciaFim: null, solicitadoPor: '' });
    await admin.vinculos.registrarConferencia(v.id, { tipo: 'escritura' });
    const r = await Promise.all([codigo(admin.vinculos.decidir({ id: v.id, decisao: 'aprovar' })),
      codigo(sindico.vinculos.decidir({ id: v.id, decisao: 'rejeitar', justificativa: 'Duplicado' }))]);
    expect(r.filter((x) => x === 'ok')).toHaveLength(1);
    expect(r).toContain('VINCULO_JA_DECIDIDO');
    expect(Number(sql(`SELECT count(*) FROM public.audit_log WHERE acao IN ('vinculo.aprovar', 'vinculo.rejeitar') AND registro_id = '${v.id}'`))).toBe(1);
  });
});

describe('ocorrência, funcionário e relatório pelo adaptador', () => {
  it('porteiro abre, outro porteiro não altera, quem abriu anda o status; o auditor só lê', async () => {
    const o = await porteiro.ocorrencias.criar({ tipo: 'outro', descricao: `Portão emperrado ${sufixo}`, unidadeId: null, envolvidos: '' });
    expect(o.status).toBe('aberta');
    // Mesmo login, sessões diferentes: o "dono" é o usuário, então o segundo navegador do mesmo porteiro também altera.
    expect(await codigo(porteiro2.ocorrencias.alterarStatus(o.id, 'em_andamento'))).toBe('ok');
    expect(await codigo(auditor.ocorrencias.alterarStatus(o.id, 'encerrada'))).toBe('SEM_PERMISSAO');
    expect((await auditor.ocorrencias.obter(o.id)).historicoStatus).toHaveLength(1);
  });

  it('funcionário com escala noturna; relatório e CSV para o auditor', async () => {
    const f = await admin.funcionarios.criar({ nome: `Vigia ${sufixo}`, documento: cpf(`6${sufixo}22`), telefone: '11977002200', funcao: 'Vigia',
      escala: { diasSemana: [0, 6], horaInicio: '22:00', horaFim: '06:00' } });
    expect(f.pessoa).not.toHaveProperty('telefone');
    expect((await auditor.funcionarios.listar()).some((x) => x.pessoaId === f.pessoaId)).toBe(true);
    expect(await codigo(porteiro.funcionarios.listar())).toBe('SEM_PERMISSAO');
    const csv = await auditor.relatorios.exportarCsv({ unidadeId: unidade });
    expect(csv.conteudo).toMatch(/^﻿Seção;Item;Total\r\n/);
    expect(csv.conteudo).toMatch(/Filtro;Unidade;[A-Z0-9]+-[0-9]+/);
  });
});

describe('auditoria: verificação no navegador e exportação sobre o banco real', () => {
  it('cadeia íntegra pelo verificador TS; adulteração direta no banco (como dono) é detectada', async () => {
    const e = await porteiro.encomendas.receber({ unidadeId: unidade, destinatario: 'X', transportadora: '', codigoRastreio: '', unidadeConfirmada: true });
    expect(e.id).toBeTruthy();
    const ok = await auditor.auditoria.verificarIntegridade();
    expect(ok.valido, JSON.stringify(ok)).toBe(true);
    expect(ok.ultimoSeq).toBe(Number(sql('SELECT ultimo_seq FROM public.evento_acesso_cadeia WHERE id = 1')));
    // Adulteração: o dono (postgres) desliga o trigger e muda um evento. O verificador do front pega pelo hash.
    const alvo = sql(`SELECT seq FROM public.evento_acesso ORDER BY seq LIMIT 1`);
    if (!alvo) return; // sem eventos no banco (não acontece depois do seed + concorrência), nada a adulterar
    const original = sql(`SELECT coalesce(observacao, '<null>') FROM public.evento_acesso WHERE seq = ${alvo}`);
    sql(`ALTER TABLE public.evento_acesso DISABLE TRIGGER evento_acesso_imutavel; UPDATE public.evento_acesso SET observacao = 'adulterado' WHERE seq = ${alvo};
         ALTER TABLE public.evento_acesso ENABLE TRIGGER evento_acesso_imutavel;`);
    try {
      expect(await auditor.auditoria.verificarIntegridade()).toMatchObject({ valido: false, primeiroSeqInvalido: Number(alvo), motivo: 'hash_divergente' });
    } finally {
      sql(`ALTER TABLE public.evento_acesso DISABLE TRIGGER evento_acesso_imutavel;
           UPDATE public.evento_acesso SET observacao = ${original === '<null>' ? 'NULL' : `'${original.replaceAll("'", "''")}'`} WHERE seq = ${alvo};
           ALTER TABLE public.evento_acesso ENABLE TRIGGER evento_acesso_imutavel;`);
    }
    expect((await auditor.auditoria.verificarIntegridade()).valido).toBe(true);
  });

  it('exportação JSONL da unidade: cada evento confere com o verificador; a trilha registra a exportação', async () => {
    const p = await auditor.auditoria.exportar({ unidadeId: unidade });
    const { eventos, manifesto } = lerExportacaoJsonl(p.conteudo);
    expect(eventos.length).toBeGreaterThan(0);
    // Exportação filtrada: cada evento isolado confere (o encadeamento só vale na trilha completa).
    for (const e of eventos) expect((await verificarCadeia([e], { seq: e.seq - 1, hash: e.hash_anterior })).valido).toBe(true);
    expect(manifesto).toMatchObject({ versao: 3, quantidade: eventos.length });
    expect(Number(sql(`SELECT count(*) FROM public.audit_log WHERE acao = 'auditoria.exportar' AND usuario_nome = 'Luíza Campos'`))).toBeGreaterThan(0);
  });
});

describe('importação de ponta a ponta', () => {
  it('analisar -> confirmar cria pessoa + vínculo legado; a planilha não fica no banco', async () => {
    const [bloco, numero] = sql(`SELECT bloco || '|' || numero FROM public.unidade WHERE id = '${unidade}'`).split('|') as [string, string];
    const doc = cpf(`5${sufixo}33`);
    const linhas = [{ linha: 2, bloco, unidade: numero, nome: `Importado ${sufixo}`, documento: doc, telefone: '11977003300', tipo: 'Proprietário' }];
    const r = await admin.importacao.analisar({ arquivo: 'moradores.xlsx', linhas });
    expect(r).toMatchObject({ lidas: 1, importaveis: 1, rejeitadas: 0 });
    expect(JSON.stringify(r)).not.toContain(doc);
    const c = await admin.importacao.confirmar(r.id);
    expect(c.importados).toBe(1);
    expect(sql(`SELECT v.status FROM public.vinculo_unidade v JOIN public.pessoa p ON p.id = v.pessoa_id WHERE p.nome = 'Importado ${sufixo}'`)).toBe('legado');
    expect(sql(`SELECT count(*) FROM public.importacao WHERE id = '${r.id}' AND arquivo_sha256 LIKE '%${doc}%'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM public.audit_log WHERE depois::text LIKE '%${doc}%' OR antes::text LIKE '%${doc}%'`)).toBe('0');
  });
});
