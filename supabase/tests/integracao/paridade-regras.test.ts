// Paridade TS <-> SQL das regras do servidor (desenho §7 e §9, R1; plano A, premissa assumida). As regras que a UI usa
// continuam em @domain; o banco tem o porte em plpgsql (migração 0020). Aqui os MESMOS casos rodam nos dois
// lados e o resultado tem de ser idêntico. Os casos são o produto das entradas de cada regra (todos os ramos), mais os
// exemplos de src/domain/domain.test.ts e permanencia.test.ts.
// Pré-requisito: Supabase local de pé e com `supabase db reset` (o teste só LÊ: chama funções puras e o HMAC).
import { execFileSync } from 'node:child_process';
import { cpfValido, escalaVigente, estadoAutorizacaoPrevia, justificativaValida, meiosAceitos, prazoInicial, proximaJanelaAutorizacao,
  proximaProrrogacao, restricoesVigentes, validarAutorizacaoEntrada, validarDesativacaoPessoa, vinculoValido } from '@domain/rules';
import { documentoBuscaCpf, mascararCpf, normalizarPlaca } from '@domain/cpf';
import { leiturasDoCodigo, normalizarNumero } from '@domain/units';
import { codigoEvento } from '@domain/hashChain';
import { brt, DIA, HORA, inicioDoDia } from '@domain/time';
import type { AutorizacaoPrevia, CategoriaPessoa, Funcionario, MeioAutorizacao, Restricao, TipoVisita, VinculoUnidade } from '@domain/types';

const PROJETO = 'tcc-gestao-acesso';

/** Executa SQL no banco LOCAL (container do CLI) e devolve a primeira coluna da primeira linha. */
function sql(comando: string): string {
  return execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: `SET ROLE app_rw;\n${comando}`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}
/** Roda `expr` (SQL sobre o jsonb `c`) para cada caso e devolve os resultados na ordem. */
function emLote<T>(casos: unknown[], expr: string): T[] {
  const saida = sql(`SELECT coalesce(jsonb_agg((${expr}) ORDER BY i), '[]') FROM jsonb_array_elements($json$${JSON.stringify(casos)}$json$::jsonb) WITH ORDINALITY AS t(c, i);`);
  return JSON.parse(saida) as T[];
}
const ts = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const prod = <A, B>(as: readonly A[], bs: readonly B[]): [A, B][] => as.flatMap((a) => bs.map((b): [A, B] => [a, b]));

// Instantes de referência (BRT): sáb 31/10/2026 10:00, seg 02/11 07:59/08:00/12:00/17:00/17:01, dom 01/11 03:00, etc.
const INSTANTES = [
  brt(2026, 10, 31, 10, 0), brt(2026, 11, 2, 7, 59), brt(2026, 11, 2, 8, 0), brt(2026, 11, 2, 12, 0), brt(2026, 11, 2, 17, 0),
  brt(2026, 11, 2, 17, 1), brt(2026, 11, 2, 17, 0, 59), brt(2026, 11, 1, 3, 0), brt(2026, 11, 3, 23, 30), brt(2026, 11, 4, 0, 0),
  brt(2026, 11, 6, 22, 0), brt(2026, 11, 7, 5, 59), brt(2026, 11, 7, 6, 1), brt(2026, 12, 31, 23, 59, 59) + 999,
];

const ap = (o: Partial<AutorizacaoPrevia>): AutorizacaoPrevia => ({
  id: '00000000-0000-4000-8000-0000000000a1', unidadeId: '00000000-0000-4000-8000-0000000000b1', areaComumId: null,
  pessoaId: '00000000-0000-4000-8000-0000000000c1', validaDe: brt(2026, 10, 30), validaAte: brt(2026, 11, 30, 23, 59, 59) + 999,
  diasSemana: null, horaInicio: null, horaFim: null, cadastradaPorId: '00000000-0000-4000-8000-0000000000d1', cadastradaEm: brt(2026, 10, 29),
  solicitadaPorPessoaId: null, semSolicitante: true, justificativa: 'sem solicitante', revogadaEm: null, revogadaPorId: null, ...o,
});
const AUTORIZACOES: AutorizacaoPrevia[] = [
  ap({}),
  ap({ diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFim: '17:00' }),
  ap({ diasSemana: [6], horaInicio: '09:30', horaFim: '10:00' }),
  ap({ diasSemana: [0, 6] }),
  ap({ revogadaEm: brt(2026, 10, 31, 9, 0), revogadaPorId: '00000000-0000-4000-8000-0000000000d1' }),
  ap({ validaDe: brt(2026, 11, 3), validaAte: brt(2026, 11, 3, 23, 59, 59) + 999 }),
  ap({ validaAte: brt(2026, 11, 2, 12, 0) }),
  ap({ horaInicio: '12:00', horaFim: '12:00' }),
];
/** Linha do banco (snake_case) de uma autorização do domínio. */
const apBanco = (a: AutorizacaoPrevia) => ({
  id: a.id, unidade_id: a.unidadeId, area_comum_id: a.areaComumId, pessoa_id: a.pessoaId, valida_de: ts(a.validaDe), valida_ate: ts(a.validaAte),
  dias_semana: a.diasSemana, hora_inicio: a.horaInicio, hora_fim: a.horaFim, cadastrada_por_id: a.cadastradaPorId, cadastrada_em: ts(a.cadastradaEm),
  solicitada_por_pessoa_id: a.solicitadaPorPessoaId, sem_solicitante: a.semSolicitante, justificativa: a.justificativa,
  revogada_em: ts(a.revogadaEm), revogada_por_id: a.revogadaPorId,
});
const AP_SQL = `jsonb_populate_record(NULL::public.autorizacao_previa, c -> 'ap')`;

const func = (o: Partial<Funcionario> & { escala?: Partial<Funcionario['escala']> }): Funcionario => ({
  pessoaId: '00000000-0000-4000-8000-0000000000e1', funcao: 'Zelador', ativo: o.ativo ?? true,
  escala: { diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFim: '17:00', ...o.escala },
});
const FUNCIONARIOS: (Funcionario | undefined)[] = [
  undefined, func({}), func({ ativo: false }), func({ escala: { diasSemana: [5, 6], horaInicio: '22:00', horaFim: '06:00' } }),
  func({ escala: { diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: '00:00', horaFim: '23:59' } }),
];
const funcBanco = (f: Funcionario | undefined) => (f ? {
  pessoa_id: f.pessoaId, funcao: f.funcao, ativo: f.ativo, dias_semana: f.escala.diasSemana, hora_inicio: f.escala.horaInicio, hora_fim: f.escala.horaFim,
} : null);
const FUNC_SQL = `CASE WHEN c -> 'f' = 'null'::jsonb THEN NULL ELSE jsonb_populate_record(NULL::public.funcionario, c -> 'f') END`;

describe('paridade TS == SQL das regras do servidor', () => {
  it('justificativaValida (inclusive espaços Unicode nas pontas)', () => {
    const casos = [null, '', '   ', 'curta', '14 caracteres!', '15 caracteres!!', `${' '.repeat(3)}quinze letras.!${' '.repeat(3)}`,
      '\n\t  exatamente 15 \t', 'x'.repeat(14) + ' ', 'ção ção ção ção', '               a'];
    expect(emLote(casos.map((t) => ({ t })), `app.justificativa_valida(c ->> 't')`)).toEqual(casos.map((t) => justificativaValida(t)));
  });

  it('validarAutorizacaoEntrada: produto de categoria, destino, meio, autorizador, sem CPF, justificativa e contexto', () => {
    const categorias: CategoriaPessoa[] = ['morador', 'visitante', 'prestador', 'funcionario'];
    const destinos = [{ u: 'U', a: null }, { u: null, a: 'A' }, { u: 'U', a: 'A' }, { u: null, a: null }] as const;
    const meios: (MeioAutorizacao | null)[] = [null, 'interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro', 'escala'];
    const autorizadores = [null, '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2'];
    const justificativas = [null, 'curta', 'Justificativa longa o bastante'];
    const casos: object[] = [];
    const esperado: unknown[] = [];
    let k = 0;
    for (const [cat, d] of prod(categorias, destinos)) for (const [meio, aut] of prod(meios, autorizadores)) for (const [semCpf, just] of prod([false, true], justificativas)) {
      // Contexto rotativo (todas as autorizações, funcionários e instantes aparecem), para o produto não explodir.
      const quando = INSTANTES[k % INSTANTES.length]!;
      const f = FUNCIONARIOS[k % FUNCIONARIOS.length];
      const apAlvo = AUTORIZACOES[k % AUTORIZACOES.length]!;
      const apId = k % 3 === 0 ? '00000000-0000-4000-8000-00000000ffff' : apAlvo.id;
      k++;
      const dados = {
        categoriaPessoa: cat, unidadeDestinoId: d.u ? '00000000-0000-4000-8000-0000000000b1' : null,
        areaComumId: d.a ? '00000000-0000-4000-8000-0000000000b2' : null, autorizadoPorTipo: meio, autorizadoPorPessoaId: aut,
        autorizacaoPreviaId: apId, justificativa: just, semCpf,
      };
      esperado.push(validarAutorizacaoEntrada(dados, { quando, moradoresValidosIds: new Set(['00000000-0000-4000-8000-0000000000f1']),
        autorizacoes: [apAlvo], funcionario: f }));
      casos.push({ ...dados, quando: ts(quando), ap: apBanco(apAlvo), f: funcBanco(f) });
    }
    const sqlRes = emLote(casos, `app.validar_autorizacao_entrada((c ->> 'categoriaPessoa')::public.categoria_pessoa, (c ->> 'unidadeDestinoId')::uuid,
      (c ->> 'areaComumId')::uuid, (c ->> 'autorizadoPorTipo')::public.meio_autorizacao, (c ->> 'autorizadoPorPessoaId')::uuid,
      (c ->> 'autorizacaoPreviaId')::uuid, c ->> 'justificativa', (c ->> 'semCpf')::boolean, (c ->> 'quando')::timestamptz,
      ARRAY['00000000-0000-4000-8000-0000000000f1']::uuid[], ARRAY[${AP_SQL}], ${FUNC_SQL})`);
    expect(casos.length).toBeGreaterThan(1000);
    expect(sqlRes).toEqual(esperado);
  });

  it('meiosAceitos (categoria x destino)', () => {
    const casos = prod(['morador', 'visitante', 'prestador', 'funcionario'] as CategoriaPessoa[], [false, true]);
    expect(emLote(casos.map(([c, a]) => ({ c, a })), `to_jsonb(app.meios_aceitos((c ->> 'c')::public.categoria_pessoa, (c ->> 'a')::boolean))`))
      .toEqual(casos.map(([c, a]) => meiosAceitos(c, a ? 'area_comum' : 'unidade')));
  });

  it('estadoAutorizacaoPrevia (autorizações x instantes)', () => {
    const casos = prod(AUTORIZACOES, INSTANTES);
    expect(emLote(casos.map(([a, t]) => ({ ap: apBanco(a), t: ts(t) })), `to_jsonb(app.estado_autorizacao(${AP_SQL}, (c ->> 't')::timestamptz))`))
      .toEqual(casos.map(([a, t]) => estadoAutorizacaoPrevia(a, t)));
  });

  it('proximaJanelaAutorizacao (autorizações x instantes x horizontes)', () => {
    const casos = prod(prod(AUTORIZACOES, INSTANTES), [0, HORA, 12 * HORA, 24 * HORA, 3 * DIA]);
    const esperado = casos.map(([[a, t], h]) => proximaJanelaAutorizacao(a, t, h));
    const r = emLote<{ inicio: number | null; fim: number | null }>(casos.map(([[a, t], h]) => ({ ap: apBanco(a), t: ts(t), h })),
      `(SELECT jsonb_build_object('inicio', app.ms(j.inicio), 'fim', app.ms(j.fim)) FROM app.proxima_janela(${AP_SQL}, (c ->> 't')::timestamptz,
        make_interval(secs => (c ->> 'h')::bigint / 1000.0)) j)`);
    expect(r.map((x) => (x.inicio === null ? null : x))).toEqual(esperado);
  });

  it('escalaVigente (funcionários x instantes, inclusive turno que atravessa a meia-noite)', () => {
    const casos = prod(FUNCIONARIOS, [...INSTANTES, ...[0, 1, 2, 3, 4, 5, 6].flatMap((d) => [brt(2026, 11, 1 + d, 5, 0), brt(2026, 11, 1 + d, 23, 0)])]);
    expect(emLote(casos.map(([f, t]) => ({ f: funcBanco(f), t: ts(t) })), `to_jsonb(app.escala_vigente(${FUNC_SQL}, (c ->> 't')::timestamptz))`))
      .toEqual(casos.map(([f, t]) => escalaVigente(f, t)));
  });

  it('restricoesVigentes (escopo, aprovação, revogação, validade, unidade)', () => {
    const P = '00000000-0000-4000-8000-000000000001';
    const U = '00000000-0000-4000-8000-000000000002';
    const r = (o: Partial<Restricao>): Restricao => ({
      id: '00000000-0000-4000-8000-000000000009', escopo: 'unidade', unidadeId: U, pessoaId: P, motivo: 'm', validaAte: brt(2026, 11, 2, 12, 0),
      cadastradaPorId: P, cadastradaEm: brt(2026, 10, 1), solicitadaPorPessoaId: P, aprovadaPorId: null, aprovadaEm: null, revogadaEm: null,
      revogadaPorId: null, ...o,
    });
    const restricoes = [r({}), r({ unidadeId: '00000000-0000-4000-8000-000000000003' }), r({ escopo: 'condominio', unidadeId: null, solicitadaPorPessoaId: null }),
      r({ escopo: 'condominio', unidadeId: null, aprovadaEm: brt(2026, 10, 2), aprovadaPorId: P }), r({ revogadaEm: brt(2026, 10, 3), revogadaPorId: P }),
      r({ pessoaId: '00000000-0000-4000-8000-000000000004' })];
    const casos = prod(prod(restricoes, [U, null]), INSTANTES);
    const banco = (x: Restricao) => ({ id: x.id, escopo: x.escopo, unidade_id: x.unidadeId, pessoa_id: x.pessoaId, motivo: x.motivo, valida_ate: ts(x.validaAte),
      cadastrada_por_id: x.cadastradaPorId, cadastrada_em: ts(x.cadastradaEm), solicitada_por_pessoa_id: x.solicitadaPorPessoaId,
      aprovada_por_id: x.aprovadaPorId, aprovada_em: ts(x.aprovadaEm), revogada_em: ts(x.revogadaEm), revogada_por_id: x.revogadaPorId });
    expect(emLote(casos.map(([[x, u], t]) => ({ r: banco(x), u, t: ts(t) })),
      `to_jsonb(app.restricao_vigente(jsonb_populate_record(NULL::public.restricao, c -> 'r'), '${P}'::uuid, (c ->> 'u')::uuid, (c ->> 't')::timestamptz))`))
      .toEqual(casos.map(([[x, u], t]) => restricoesVigentes([x], P, u, t).length === 1));
  });

  it('vinculoValido (status x vigência x prazo x dia), em dias BRT', () => {
    const d = (a: number, m: number, dd: number) => brt(a, m, dd);
    const vincs: Partial<VinculoUnidade>[] = [
      { status: 'aprovado', vigenciaInicio: null, vigenciaFim: null }, { status: 'aprovado', vigenciaInicio: d(2026, 11, 2), vigenciaFim: null },
      { status: 'aprovado', vigenciaInicio: null, vigenciaFim: d(2026, 11, 2) }, { status: 'legado', prazoRegularizacao: d(2026, 11, 2) },
      { status: 'legado', prazoRegularizacao: null }, { status: 'pendente' }, { status: 'rejeitado' }, { status: 'encerrado' },
    ];
    const casos = prod(vincs, INSTANTES);
    const dia = (ms: number | null | undefined) => (ms == null ? null : new Date(ms - 3 * HORA).toISOString().slice(0, 10));
    const esperado = casos.map(([v, t]) => vinculoValido({ vigenciaInicio: null, vigenciaFim: null, prazoRegularizacao: null, ...v } as VinculoUnidade, t));
    expect(emLote(casos.map(([v, t]) => ({ s: v.status, i: dia(v.vigenciaInicio), f: dia(v.vigenciaFim), p: dia(v.prazoRegularizacao), t: ts(t) })),
      `to_jsonb(app.vinculo_valido((c ->> 's')::public.status_vinculo, (c ->> 'i')::date, (c ->> 'f')::date, (c ->> 'p')::date, app.dia_brt((c ->> 't')::timestamptz)))`))
      .toEqual(esperado);
  });

  it('validarDesativacaoPessoa (todas as combinações)', () => {
    const bools = [false, true];
    const casos: [boolean, boolean, string | null, boolean, boolean, boolean][] = [];
    for (const an of bools) for (const de of bools) for (const m of [null, 'curto', 'Motivo longo o bastante']) for (const v of bools) for (const dt of bools) for (const fa of bools) {
      casos.push([an, de, m, v, dt, fa]);
    }
    expect(emLote(casos.map(([an, de, m, v, dt, fa]) => ({ an, de, m, v, dt, fa })),
      `app.validar_desativacao_pessoa((c ->> 'an')::boolean, (c ->> 'de')::boolean, c ->> 'm', (c ->> 'v')::boolean, (c ->> 'dt')::boolean, (c ->> 'fa')::boolean)`))
      .toEqual(casos.map(([an, de, m, v, dt, fa]) => validarDesativacaoPessoa({ anonimizada: an, desativada: de }, m, { vinculoValido: v, dentro: dt, funcionarioAtivo: fa })));
  });

  it('prazoInicial e proximaProrrogacao (tipos, janela da autorização, teto de 12 h, limite de 4)', () => {
    const tipos: TipoVisita[] = ['visita', 'entrega', 'transporte_app', 'servico'];
    const casosP = prod(prod(tipos, INSTANTES), [null, '08:00', '12:00', '17:00', '23:59']);
    expect(emLote(casosP.map(([[t, e], h]) => ({ t, e: ts(e), h })), `app.ms(app.prazo_inicial((c ->> 't')::public.tipo_visita, (c ->> 'e')::timestamptz, (c ->> 'h')::time))`))
      .toEqual(casosP.map(([[t, e], h]) => prazoInicial(t, e, h)));
    const entrada = brt(2026, 11, 2, 8, 0);
    const casosR = prod(prod([entrada + 30 * 60_000, entrada + 4 * HORA, entrada + 11.5 * HORA, entrada + 12 * HORA], [0, 1, 3, 4]),
      [entrada + HORA, entrada + 5 * HORA, entrada + 11 * HORA, entrada + 11.9 * HORA, entrada + 13 * HORA]);
    expect(emLote(casosR.map(([[p, n], a]) => ({ p: ts(p), n, a: ts(a) })),
      `app.proxima_prorrogacao('${ts(entrada)}'::timestamptz, (c ->> 'p')::timestamptz, (c ->> 'n')::integer, (c ->> 'a')::timestamptz)`))
      .toEqual(casosR.map(([[p, n], a]) => proximaProrrogacao({ entradaEm: entrada, prazoAte: p, prorrogacoes: n }, a)));
  });

  it('CPF (dígito verificador e máscaras), placa, código de unidade, número e código do evento', () => {
    const cpfs = ['52998224725', '52998224724', '11111111111', '00000000000', '1234567890', '12345678909', '39053344705', '15350946056', 'abc'];
    expect(emLote(cpfs.map((d) => ({ d })), `to_jsonb(app.cpf_valido(c ->> 'd'))`)).toEqual(cpfs.map((d) => cpfValido(d)));
    const validos = cpfs.filter((d) => /^\d{11}$/.test(d));
    expect(emLote(validos.map((d) => ({ d })), `jsonb_build_array(app.mascarar_cpf(c ->> 'd', 'inicio'), app.mascarar_cpf(c ->> 'd', 'meio'))`))
      .toEqual(validos.map((d) => [mascararCpf(d, 'inicio'), mascararCpf(d, 'meio')]));
    const placas = ['abc-1234', 'ABC1D23', 'abc 1d23', 'AB12345', 'ABCD123', '', 'ABC12345', 'xyz9z99'];
    expect(emLote(placas.map((p) => ({ p })), `to_jsonb(app.normalizar_placa(c ->> 'p'))`)).toEqual(placas.map((p) => normalizarPlaca(p)));
    const codigos = ['A-32', 'a 32', 'Bloco A · AP 32', 'T4-32', 't4 03', '4.32', 'B2/101', 'A32', '432', 'A-0', 'A-00', 'Torre 4 apto 12', 'ABCD-1', 'A-12345'];
    expect(emLote(codigos.map((t) => ({ t })), `(SELECT coalesce(jsonb_agg(jsonb_build_object('bloco', bloco, 'numero', numero) ORDER BY ordem), '[]') FROM app.leituras_do_codigo(c ->> 't'))`))
      .toEqual(codigos.map((t) => leiturasDoCodigo(t)));
    const numeros = ['3', '03', '032', '101', '0', '00', 'x1', ' 7 '];
    expect(emLote(numeros.map((n) => ({ n })), `to_jsonb(app.normalizar_numero(c ->> 'n'))`)).toEqual(numeros.map((n) => normalizarNumero(n)));
    const seqs = [1, 12, 999999, 1000000, 123456789];
    expect(emLote(seqs.map((s) => ({ s })), `to_jsonb(app.codigo_evento((c ->> 's')::bigint))`)).toEqual(seqs.map((s) => codigoEvento(s)));
  });

  it('fuso e dia BRT: início do dia igual ao domain', () => {
    const casos = INSTANTES;
    expect(emLote(casos.map((t) => ({ t: ts(t) })), `to_jsonb(app.ms(app.inicio_do_dia((c ->> 't')::timestamptz)))`)).toEqual(casos.map((t) => inicioDoDia(t)));
  });

  it('HMAC do CPF no banco (chave do Vault) == documentoBuscaCpf do domain com a mesma chave', async () => {
    // Só aqui a chave sai do banco: lida como postgres, no stack LOCAL, para provar o mesmo algoritmo (bytes da chave, UTF-8, hex).
    const hex = execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
      `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'portaria_hmac_cpf_v1'`], { encoding: 'utf8' }).trim();
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    const chave = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
    const cpfs = ['52998224725', '11144477735', '39053344705'];
    const banco = JSON.parse(execFileSync('docker', ['exec', '-i', `supabase_db_${PROJETO}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
      `SELECT jsonb_agg(public.cpf_hmac(x) ORDER BY i) FROM unnest(ARRAY['${cpfs.join("','")}']) WITH ORDINALITY u(x, i)`], { encoding: 'utf8' }).trim());
    expect(banco).toEqual(await Promise.all(cpfs.map((c) => documentoBuscaCpf(c, chave))));
  });
});
