// Paridade TS <-> SQL das regras portadas na F3 (desenho §7 e §9, R1; plano A). Mesmo método do paridade-regras.test.ts:
// os MESMOS casos rodam nas funções puras de @portaria/domain e no porte em plpgsql (migrações 0025–0032), e o resultado
// tem de ser idêntico. Pré-requisito: Supabase local de pé com `supabase db reset` (o teste só LÊ: funções puras).
import { execFileSync } from 'node:child_process';
import { cadastroCompleto, diasDesde, encomendaAtrasada, validarConferencia, validarDecisaoVinculo, validarEscala } from '@portaria/domain/rules';
import { leiturasDoBloco, normalizarBloco, normalizarNumero, validarEstruturaUnidade, type Agrupamento } from '@portaria/domain/units';
import { mascararCpf } from '@portaria/domain/cpf';
import { codigoEvento } from '@portaria/domain/hashChain';
import { celula } from '@portaria/domain/relatorio';
import { brt, DIA, HORA, inicioDoDia } from '@portaria/domain/time';
import type { ConferenciaComprovante, Escala } from '@portaria/domain/types';

const PROJETO = 'tcc-gestao-acesso';

function sql(comando: string): string {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: `SET ROLE app_rw;\n${comando}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}
function emLote<T>(casos: unknown[], expr: string): T[] {
  const saida = sql(`SELECT coalesce(jsonb_agg((${expr}) ORDER BY i), '[]') FROM jsonb_array_elements($json$${JSON.stringify(casos)}$json$::jsonb) WITH ORDINALITY AS t(c, i);`);
  return JSON.parse(saida) as T[];
}
const ts = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const prod = <A, B>(as: readonly A[], bs: readonly B[]): [A, B][] => as.flatMap((a) => bs.map((b): [A, B] => [a, b]));
/** Início do dia BRT -> 'AAAA-MM-DD'. */
const dia = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);

const AGORA = brt(2026, 11, 2, 10, 0);

describe('paridade TS == SQL das regras da F3', () => {
  it('validarConferencia (tipo x descrição x observação x data), inclusive o número de pessoa e os brancos Unicode', () => {
    const tipos = ['escritura', 'contrato_compra_venda', 'contrato_locacao', 'outro', 'rg', ''];
    const descricoes = [undefined, '', '   ', 'Declaração do síndico', 'x'.repeat(80), 'x'.repeat(81), 'CPF 529.982.247-25', '  1234-5678 9  ', `${' '}a${' '}`];
    const observacoes = [undefined, '', 'conferido no balcão', 'o'.repeat(200), 'o'.repeat(201), 'tel 11 98765-4321', '123.456.78'];
    const datas = [inicioDoDia(AGORA), inicioDoDia(AGORA) - DIA, inicioDoDia(AGORA) + DIA, AGORA + 1];
    const casos: { tipo: string; descricao?: string; observacao?: string; data: number }[] = [];
    for (const [t, d] of prod(tipos, descricoes)) for (const [o, dt] of prod(observacoes, datas)) casos.push({ tipo: t, descricao: d, observacao: o, data: dt });
    expect(casos.length).toBeGreaterThan(1000);
    const r = emLote(casos.map((c) => ({ ...c, data: ts(c.data) })),
      `app.validar_conferencia(c ->> 'tipo', c ->> 'descricao', c ->> 'observacao', (c ->> 'data')::timestamptz, '${ts(AGORA)}'::timestamptz)`);
    expect(r).toEqual(casos.map((c) => validarConferencia(c, AGORA)));
  });

  it('validarDecisaoVinculo (decisão x justificativa x conferência)', () => {
    const conf: ConferenciaComprovante = { tipoDocumento: 'escritura', data: 0, conferidoPorId: 'u' };
    const casos = prod(prod(['aprovar', 'rejeitar'] as const, [undefined, '', '   ', 'Documento não confere']), [null, conf]);
    expect(emLote(casos.map(([[d, j], c]) => ({ d, j, c: !!c })), `app.validar_decisao_vinculo(c ->> 'd', c ->> 'j', (c ->> 'c')::boolean)`))
      .toEqual(casos.map(([[d, j], c]) => validarDecisaoVinculo(d, j, c)));
  });

  it('cadastroCompleto (sem CPF, HMAC, telefone, anonimizada, menor x tipo do vínculo)', () => {
    const pessoas = [] as { semCpf: boolean; documentoBusca: string | null; telefone: string | null; anonimizadaEm: number | null; menorIdade: boolean }[];
    for (const semCpf of [false, true]) for (const busca of [null, 'a'.repeat(64)]) for (const tel of [null, '', '1198765432', '11987654321', '119876543'])
      for (const anon of [null, 1]) for (const menor of [false, true]) pessoas.push({ semCpf, documentoBusca: busca, telefone: tel, anonimizadaEm: anon, menorIdade: menor });
    const casos = prod(pessoas, ['proprietario', 'inquilino', 'dependente']);
    const r = emLote(casos.map(([p, t]) => ({ p: { sem_cpf: p.semCpf, documento_busca: p.documentoBusca, telefone: p.telefone,
      anonimizada_em: p.anonimizadaEm ? ts(p.anonimizadaEm) : null, menor_idade: p.menorIdade }, t })),
      `to_jsonb(app.cadastro_completo(jsonb_populate_record(NULL::public.pessoa, c -> 'p'), (c ->> 't')::public.tipo_vinculo))`);
    expect(r).toEqual(casos.map(([p, t]) => cadastroCompleto(p, t)));
  });

  it('diasDesde e encomendaAtrasada (limite de 7 dias e outros N)', () => {
    const recebidas = [AGORA, AGORA - 1, AGORA - DIA + 1, AGORA - DIA, AGORA - 7 * DIA, AGORA - 8 * DIA + 1, AGORA - 8 * DIA, AGORA - 30 * DIA, AGORA + HORA];
    const casos = prod(recebidas, [0, 1, 7, 30]);
    expect(emLote(casos.map(([r]) => ({ r: ts(r) })), `to_jsonb(app.dias_desde((c ->> 'r')::timestamptz, '${ts(AGORA)}'::timestamptz))`))
      .toEqual(casos.map(([r]) => diasDesde(r, AGORA)));
    expect(emLote(recebidas.map((r) => ({ r: ts(r) })), `to_jsonb(app.encomenda_atrasada((c ->> 'r')::timestamptz, '${ts(AGORA)}'::timestamptz))`))
      .toEqual(recebidas.map((r) => encomendaAtrasada(r, AGORA)));
    // Com N explícito: a mesma regra (diasDesde > N) que a lista "atrasadas há mais de N dias" usa.
    expect(emLote(casos.map(([r, n]) => ({ r: ts(r), n })), `to_jsonb(app.encomenda_atrasada((c ->> 'r')::timestamptz, '${ts(AGORA)}'::timestamptz, (c ->> 'n')::integer))`))
      .toEqual(casos.map(([r, n]) => diasDesde(r, AGORA) > n));
  });

  it('validarEscala (dias, repetidos, não inteiros, fora de 0..6, formato da hora, início = fim)', () => {
    const dias: unknown[] = [[], [1], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6, 0], [1, 1], [7], [-1], [1.5], [6, 0]];
    const horas = [['08:00', '17:00'], ['22:00', '06:00'], ['08:00', '08:00'], ['8:00', '17:00'], ['24:00', '01:00'], ['08:60', '09:00'], ['', '09:00']];
    const casos = prod(dias, horas).map(([d, [i, f]]) => ({ diasSemana: d, horaInicio: i, horaFim: f }));
    expect(emLote(casos, `to_jsonb(app.validar_escala(c))`)).toEqual(casos.map((e) => validarEscala(e as Escala)));
  });

  it('normalizarBloco + validarEstruturaUnidade (Bloco e Torre) e normalizarNumero', () => {
    const blocos = ['a', ' b2 ', 'T4', 'ABCD', 'A-1', '', '10', 'ç'];
    const numeros = ['3', '03', '101', '0', '00', '12345', 'x1', ' 7 '];
    const casos = prod(prod(blocos, numeros), ['Bloco', 'Torre'] as Agrupamento[]);
    expect(emLote(casos.map(([[b, n], a]) => ({ b, n, a })),
      `jsonb_build_array(app.normalizar_bloco(c ->> 'b'), app.normalizar_numero(c ->> 'n'),
        app.validar_estrutura_unidade(app.normalizar_bloco(c ->> 'b'), app.normalizar_numero(c ->> 'n'), c ->> 'a'))`))
      .toEqual(casos.map(([[b, n], a]) => [normalizarBloco(b), normalizarNumero(n), validarEstruturaUnidade(normalizarBloco(b), normalizarNumero(n), a)]));
  });

  it('leiturasDoBloco (célula da planilha de importação)', () => {
    const celulas = ['A', 'bloco a', 'Bloco  B2', 'Torre 4', 'torre4', '4', 'T4', 't12', 'T123', ' c ', 'Blocos A'];
    expect(emLote(celulas.map((t) => ({ t })), `to_jsonb(app.leituras_do_bloco(c ->> 't'))`)).toEqual(celulas.map((t) => leiturasDoBloco(t)));
  });

  it('códigos e formatos exibidos: ocorrência, encomenda, CPF da amostra', () => {
    // codigoOcorrencia do legado (ano BRT + padStart 3, que não corta) e o K da encomenda.
    const casos = [[1, brt(2026, 1, 1, 0, 30)], [47, brt(2025, 12, 31, 23, 59)], [1234, brt(2026, 6, 1)]] as const;
    expect(emLote(casos.map(([n, a]) => ({ n, a: ts(a) })), `to_jsonb(app.codigo_ocorrencia((c ->> 'n')::integer, (c ->> 'a')::timestamptz))`))
      .toEqual(casos.map(([n, a]) => `OC-${new Date(a - 3 * HORA).getUTCFullYear()}-${String(n).padStart(3, '0')}`));
    expect(emLote([{ n: 108 }], `to_jsonb(app.codigo_encomenda((c ->> 'n')::integer))`)).toEqual(['K108']);
    const docs = ['', '52998224725', '529.982.247-25', '123', 'abc'];
    expect(emLote(docs.map((d) => ({ d })), `to_jsonb(app.documento_da_amostra(c ->> 'd'))`)).toEqual(docs.map((d) => {
      const x = d.replace(/\D/g, '');
      return !x ? '' : x.length === 11 ? mascararCpf(x) : x.replace(/\d/g, '•');
    }));
    // Sanidade do helper compartilhado com a F2 (o relatório usa os mesmos dias BRT).
    expect(emLote([{ t: ts(AGORA) }], `to_jsonb(to_char(app.dia_brt((c ->> 't')::timestamptz), 'YYYY-MM-DD'))`)).toEqual([dia(AGORA)]);
    expect(codigoEvento(1)).toBe('EV-000001');
    expect(celula('=1')).toBe("'=1");
  });
});
