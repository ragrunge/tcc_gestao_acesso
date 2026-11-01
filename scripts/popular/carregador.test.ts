// Fluxo do carregador contra um banco FALSO em memória que imita o contrato das RPCs usadas (formato das respostas,
// recusas 409 e transições de estado). Prova a orquestração (ordem, chaves de retomada, idempotência); as regras reais
// só o Supabase local prova (ver o roteiro de ensaio no README).
import { codigoUnidade, gerarUnidades } from '@domain/units';
import { carregar } from './carregador';
import { ErroCarga, type Api } from './cliente';
import { gerarConjunto, semAcento } from './gerador';

const LEITURAS = new Set(['catalogo', 'vinculos_listar', 'unidade_detalhe', 'pessoa_funcionario', 'autorizacoes_vigentes', 'restricoes_pendentes',
  'restricao_verificar', 'eventos_listar', 'funcionarios_listar', 'encomendas_listar', 'ocorrencias_listar', 'vinculos_contar', 'encomendas_resumo']);

type R = Record<string, any>;

function bancoFalso() {
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const unidades = gerarUnidades().map((u) => ({ id: `u-${codigoUnidade(u)}`, ...u, ativo: true }));
  const areas = ['Academia', 'Administração', 'Casa de máquinas', 'Jardins', 'Piscina', 'Quadra', 'Salão de festas'].map((nome) => ({ id: `a-${nome}`, nome, ativo: true }));
  const s = {
    pessoas: [] as R[], vinculos: [] as R[], importacoes: new Map<string, R>(), veiculos: [] as R[], funcionarios: [] as R[],
    autorizacoes: [] as R[], restricoes: [] as R[], eventos: [] as R[], encomendas: [] as R[], ocorrencias: [] as R[],
  };
  const escritas: string[] = [];
  const erro = (status: number, codigo: string, detalhes?: unknown): never => { throw new ErroCarga(codigo, codigo, status, detalhes); };
  const unidade = (uid: string) => unidades.find((u) => u.id === uid) ?? erro(404, 'UNIDADE_NAO_ENCONTRADA');
  const pessoa = (pid: string) => s.pessoas.find((p) => p.id === pid) ?? erro(404, 'PESSOA_NAO_ENCONTRADA');
  const ativo = (v: R) => ['pendente', 'aprovado', 'legado'].includes(v.status);
  const valido = (pid: string, uid: string) => s.vinculos.some((v) => v.pessoaId === pid && v.unidadeId === uid && (v.status === 'aprovado' || v.status === 'legado'));
  const vview = (v: R) => ({ ...v, pessoaNome: pessoa(v.pessoaId).nome, unidadeCodigo: codigoUnidade(unidade(v.unidadeId)) });
  const pagina = (itens: R[], p: R = {}) => {
    const ini = p.cursor ? itens.findIndex((x) => (x.id ?? x.pessoaId) === p.cursor) + 1 : 0;
    const fatia = itens.slice(ini, ini + (p.limite ?? 50));
    const temMais = ini + fatia.length < itens.length;
    return { itens: fatia, temMais, cursor: temMais ? (fatia.at(-1)!.id ?? fatia.at(-1)!.pessoaId) : null };
  };
  const dupCpf = (cpf: string) => {
    const x = s.pessoas.find((p) => p.cpf === cpf);
    if (x) erro(409, 'PESSOA_DUPLICADA', { desativada: false, pessoaId: x.id });
  };
  const restricoesVigentes = (pid: string, uid: string | null) =>
    s.restricoes.filter((r) => r.pessoaId === pid && ((r.escopo === 'unidade' && r.unidadeId === uid) || (r.escopo === 'condominio' && r.aprovada)));
  const dentro = (pid: string) => s.eventos.some((e) => e.tipo === 'entrada' && e.pessoaId === pid && !s.eventos.some((x) => x.tipo === 'saida' && x.refere === e.id));
  const evento = (e: R) => { const x = { id: id('ev'), seq: s.eventos.length + 1, unidadeDestinoId: null, areaComumId: null, ...e }; s.eventos.push(x); return x; };
  const analisar = (linhas: R[]) => linhas.map((l) => {
    const u = unidades.find((x) => x.bloco === l.bloco && x.numero === l.unidade) ?? erro(422, 'UNIDADE_INEXISTENTE');
    const cpf = l.documento.replace(/\D/g, '');
    const existente = s.pessoas.find((p) => p.cpf === cpf);
    return { l, u, cpf, existente, reaproveitar: !!existente && s.vinculos.some((v) => v.pessoaId === existente.id && v.unidadeId === u.id && ativo(v)) };
  });

  const h: Record<string, (a: R) => unknown> = {
    catalogo: () => ({ agrupamento: 'Bloco', unidades, areasComuns: areas }),
    vinculos_listar: ({ p }) => pagina([...s.vinculos].reverse().map(vview), p),
    vinculos_contar: ({ p_status }) => s.vinculos.filter((v) => v.status === p_status).length,
    importacao_analisar: ({ p }) => {
      const r = analisar(p.linhas);
      const imp = { id: id('imp'), linhas: JSON.stringify(p.linhas), status: 'analisada' };
      s.importacoes.set(imp.id, imp);
      return { id: imp.id, importaveis: r.length, inconsistencias: r.filter((x) => x.reaproveitar).map((x) => ({ linha: x.l.linha, codigo: 'DUPLICIDADE_BANCO', tipo: 'aviso' })) };
    },
    importacao_confirmar: ({ p_id, p }) => {
      const imp = s.importacoes.get(p_id) ?? erro(404, 'IMPORTACAO_NAO_ENCONTRADA');
      if (imp.status !== 'analisada') erro(409, 'IMPORTACAO_JA_CONFIRMADA');
      if (JSON.stringify(p.linhas) !== imp.linhas) erro(409, 'IMPORTACAO_DIVERGENTE');
      let importados = 0, reaproveitados = 0;
      for (const x of analisar(p.linhas)) {
        if (x.reaproveitar) { reaproveitados++; continue; }
        const pes = x.existente ?? { id: id('p'), nome: x.l.nome, categoria: 'morador', cpf: x.cpf, telefone: x.l.telefone };
        if (!x.existente) s.pessoas.push(pes);
        const tipo = /inquil/i.test(x.l.tipo) ? 'inquilino' : /depend/i.test(x.l.tipo) ? 'dependente' : 'proprietario';
        s.vinculos.push({ id: id('v'), pessoaId: pes.id, unidadeId: x.u.id, tipo, status: 'legado', conferencia: null });
        importados++;
      }
      imp.status = 'confirmada';
      return { importados, reaproveitados };
    },
    vinculo_conferir: ({ p_id, p }) => {
      const v = s.vinculos.find((x) => x.id === p_id) ?? erro(404, 'VINCULO_NAO_ENCONTRADO');
      if (!['pendente', 'legado'].includes(v.status)) erro(409, 'CONFERENCIA_IMUTAVEL');
      if (!['escritura', 'contrato_compra_venda', 'contrato_locacao', 'outro'].includes(p.tipo) || (p.tipo === 'outro' && !p.descricao)) erro(422, 'TIPO_COMPROVANTE_INVALIDO');
      v.conferencia = { tipoDocumento: p.tipo };
      return vview(v);
    },
    vinculo_regularizar: ({ p_id, p }) => {
      const v = s.vinculos.find((x) => x.id === p_id)!;
      if (v.status !== 'legado') erro(409, 'VINCULO_NAO_LEGADO');
      if (!v.conferencia) erro(422, 'CONFERENCIA_OBRIGATORIA');
      if (v.tipo === 'inquilino' && !p.vigenciaFim) erro(422, 'VIGENCIA_OBRIGATORIA');
      v.status = 'aprovado';
      return vview(v);
    },
    vinculo_criar: ({ p }) => {
      pessoa(p.pessoaId); unidade(p.unidadeId);
      if (s.vinculos.some((v) => v.pessoaId === p.pessoaId && v.unidadeId === p.unidadeId && ativo(v))) erro(409, 'VINCULO_DUPLICADO');
      const v = { id: id('v'), pessoaId: p.pessoaId, unidadeId: p.unidadeId, tipo: p.tipo, status: 'pendente', conferencia: null };
      s.vinculos.push(v);
      return vview(v);
    },
    vinculo_aprovar: ({ p_id }) => {
      const v = s.vinculos.find((x) => x.id === p_id)!;
      if (v.status !== 'pendente') erro(409, 'VINCULO_JA_DECIDIDO');
      if (!v.conferencia) erro(422, 'CONFERENCIA_OBRIGATORIA');
      const x = pessoa(v.pessoaId);
      if (!x.cpf && !(x.menor && v.tipo === 'dependente')) erro(422, 'CADASTRO_INCOMPLETO');
      v.status = 'aprovado';
      return vview(v);
    },
    pessoa_criar: ({ p }) => {
      if (p.categoria === 'prestador' && !p.empresa) erro(422, 'EMPRESA_OBRIGATORIA');
      if (p.menorIdade) {
        if (p.documento || p.telefone) erro(422, 'TESTE_MENOR_COM_DADO');
        const x = s.pessoas.find((y) => y.menor && semAcento(y.nome) === semAcento(p.nome));
        if (x) erro(409, 'PESSOA_DUPLICADA', { desativada: false, pessoaId: x.id });
      } else {
        if (!/^\d{11}$/.test(String(p.documento).replace(/\D/g, '')) || !/^\d{10,11}$/.test(String(p.telefone).replace(/\D/g, ''))) erro(422, 'CPF_INVALIDO');
        dupCpf(p.documento.replace(/\D/g, ''));
      }
      const x = { id: id('p'), nome: p.nome, categoria: p.categoria, cpf: p.documento?.replace(/\D/g, '') ?? null, menor: !!p.menorIdade };
      s.pessoas.push(x);
      return x;
    },
    veiculo_criar: ({ p }) => {
      unidade(p.unidadeId);
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.placa) || !p.modelo || !p.cor) erro(422, 'PLACA_INVALIDA');
      if (s.veiculos.some((v) => v.placa === p.placa)) erro(409, 'PLACA_DUPLICADA');
      const v = { id: id('ve'), unidadeId: p.unidadeId, placa: p.placa };
      s.veiculos.push(v);
      return v;
    },
    unidade_detalhe: ({ p_ref }) => ({
      veiculos: s.veiculos.filter((v) => v.unidadeId === p_ref),
      autorizacoes: s.autorizacoes.filter((a) => a.unidadeId === p_ref),
      restricoes: s.restricoes.filter((r) => r.unidadeId === p_ref),
    }),
    funcionario_criar: ({ p }) => {
      for (const k of ['nome', 'documento', 'telefone', 'funcao', 'escala']) if (!(k in p)) erro(400, 'VALIDACAO');
      dupCpf(p.documento.replace(/\D/g, ''));
      const x = { id: id('p'), nome: p.nome, categoria: 'funcionario', cpf: p.documento.replace(/\D/g, '') };
      s.pessoas.push(x);
      s.funcionarios.push({ pessoaId: x.id, funcao: p.funcao });
      return { pessoaId: x.id };
    },
    pessoa_funcionario: ({ p_id }) => s.funcionarios.find((f) => f.pessoaId === p_id) ?? null,
    funcionarios_listar: ({ p }) => pagina(s.funcionarios.map((f, i) => ({ ...f, emEscalaAgora: i === 1 })), p),
    autorizacoes_vigentes: ({ p_pessoa, p_destino }) => s.autorizacoes.filter((a) => a.pessoaId === p_pessoa && a.areaComumId === p_destino),
    autorizacao_criar: ({ p }) => {
      pessoa(p.pessoaId);
      if (!p.validaAte) erro(422, 'VALIDADE_OBRIGATORIA');
      if (p.unidadeId && !p.solicitadaPorPessoaId && !(p.justificativa?.length >= 15)) erro(422, 'SOLICITANTE_OU_JUSTIFICATIVA');
      if (p.solicitadaPorPessoaId && !valido(p.solicitadaPorPessoaId, p.unidadeId)) erro(422, 'SOLICITANTE_SEM_VINCULO');
      const a = { id: id('au'), pessoaId: p.pessoaId, unidadeId: p.unidadeId ?? null, areaComumId: p.areaComumId ?? null };
      s.autorizacoes.push(a);
      return a;
    },
    restricoes_pendentes: () => s.restricoes.filter((r) => r.escopo === 'condominio' && !r.aprovada),
    restricao_verificar: ({ p_pessoa, p_unidade }) => {
      const alertas = restricoesVigentes(p_pessoa, p_unidade);
      return { restrita: alertas.length > 0, alertas };
    },
    restricao_criar: ({ p }) => {
      pessoa(p.pessoaId);
      if (!p.paraTodoCondominio && !valido(p.solicitadaPorPessoaId, p.unidadeId)) erro(422, 'SOLICITANTE_SEM_VINCULO');
      const r = { id: id('r'), pessoaId: p.pessoaId, escopo: p.paraTodoCondominio ? 'condominio' : 'unidade', unidadeId: p.unidadeId ?? null, aprovada: false };
      s.restricoes.push(r);
      return r;
    },
    restricao_aprovar: ({ p_id }) => {
      const r = s.restricoes.find((x) => x.id === p_id)!;
      if (r.aprovada) erro(409, 'RESTRICAO_JA_APROVADA');
      r.aprovada = true;
      return r;
    },
    eventos_listar: ({ p }) => pagina(s.eventos.filter((e) => e.pessoaId === p.pessoaId && e.tipo === p.tipo).reverse(), p),
    evento_entrada: ({ p }) => {
      const x = pessoa(p.pessoaId);
      const uid = p.unidadeDestinoId ?? null;
      if (restricoesVigentes(x.id, uid).length) return { resultado: 'negado', evento: evento({ tipo: 'negado', pessoaId: x.id, unidadeDestinoId: uid }) };
      const morador = x.categoria === 'morador' && uid && valido(x.id, uid);
      if (!morador && x.categoria !== 'funcionario' && !p.autorizadoPorTipo) erro(422, 'AUTORIZADO_POR_OBRIGATORIO');
      if (['interfone', 'celular', 'morador_presente'].includes(p.autorizadoPorTipo) && !valido(p.autorizadoPorPessoaId, uid)) erro(422, 'AUTORIZADOR_SEM_VINCULO');
      if (p.autorizadoPorTipo === 'autorizacao_previa' && !s.autorizacoes.some((a) => a.id === p.autorizacaoPreviaId && a.pessoaId === x.id)) erro(422, 'AUTORIZACAO_PREVIA_INVALIDA');
      if (p.autorizadoPorTipo === 'excecao_porteiro' && !(p.justificativa?.length >= 15)) erro(422, 'JUSTIFICATIVA_OBRIGATORIA');
      if (p.autorizadoPorTipo === 'escala' && x.categoria !== 'funcionario') erro(422, 'MEIO_INVALIDO_PARA_TIPO');
      if (dentro(x.id)) erro(409, 'JA_ESTA_DENTRO');
      return { resultado: 'entrada', evento: evento({ tipo: 'entrada', pessoaId: x.id, unidadeDestinoId: uid, areaComumId: p.areaComumId ?? null }) };
    },
    evento_recusa: ({ p }) => {
      if (!valido(p.moradorPessoaId, p.unidadeDestinoId)) erro(422, 'AUTORIZADOR_SEM_VINCULO');
      return evento({ tipo: 'recusado', pessoaId: p.pessoaId, unidadeDestinoId: p.unidadeDestinoId });
    },
    evento_saida: ({ p_entrada }) => {
      const e = s.eventos.find((x) => x.id === p_entrada && x.tipo === 'entrada') ?? erro(404, 'ENTRADA_NAO_ENCONTRADA');
      if (s.eventos.some((x) => x.tipo === 'saida' && x.refere === e.id)) erro(409, 'SAIDA_JA_REGISTRADA');
      return evento({ tipo: 'saida', pessoaId: e.pessoaId, refere: e.id });
    },
    encomendas_listar: ({ p }) => pagina([...s.encomendas].reverse(), p),
    encomenda_receber: ({ p }) => {
      if (p.unidadeConfirmada !== true || !p.destinatario) erro(422, 'UNIDADE_NAO_CONFIRMADA');
      const e = { id: id('en'), unidadeId: unidade(p.unidadeId).id, codigoRastreio: p.codigoRastreio, retiradaEm: null as number | null };
      s.encomendas.push(e);
      return e;
    },
    encomenda_entregar: ({ p_id, p_pessoa }) => {
      const e = s.encomendas.find((x) => x.id === p_id)!;
      if (e.retiradaEm !== null) erro(409, 'ENCOMENDA_JA_ENTREGUE');
      if (!valido(p_pessoa, e.unidadeId)) erro(422, 'PESSOA_SEM_VINCULO');
      e.retiradaEm = 1;
      return e;
    },
    encomendas_resumo: () => ({ aguardando: s.encomendas.filter((e) => e.retiradaEm === null).length, entregues: s.encomendas.filter((e) => e.retiradaEm !== null).length }),
    ocorrencias_listar: ({ p }) => pagina([...s.ocorrencias].reverse(), p),
    ocorrencia_criar: ({ p }) => {
      for (const ev of p.eventoIds ?? []) if (!s.eventos.some((e) => e.id === ev)) erro(422, 'REFERENCIA_INVALIDA');
      const o = { id: id('oc'), descricao: p.descricao, status: 'aberta', eventoIds: p.eventoIds ?? [] };
      s.ocorrencias.push(o);
      return o;
    },
    ocorrencia_alterar_status: ({ p_id, p_status }) => {
      const o = s.ocorrencias.find((x) => x.id === p_id)!;
      if ({ aberta: 'em_andamento', em_andamento: 'encerrada' }[o.status as string] !== p_status) erro(422, 'TRANSICAO_INVALIDA');
      o.status = p_status;
      return o;
    },
    sessao_encerrar: () => null,
  };

  return {
    s, escritas,
    api(falharNaChamada = 0, registro?: string[]): Api {
      let chamadas = 0;
      return {
        get chamadas() { return chamadas; },
        async rpc<T>(nome: string, args: R = {}) {
          const f = h[nome];
          if (!f) throw new Error(`RPC sem fake: ${nome}`);
          chamadas++;
          registro?.push(nome);
          const r = f(structuredClone(args)) as T;
          if (!LEITURAS.has(nome)) escritas.push(nome);
          // Pior caso de rede: a escrita foi gravada e a resposta se perdeu.
          if (chamadas === falharNaChamada) throw new ErroCarga('FALHA_DE_REDE', 'simulada');
          return structuredClone(r);
        },
        async encerrar() {},
      };
    },
  };
}

const c = gerarConjunto();
const silencioso = { info: () => {} };
const AGORA = Date.UTC(2026, 10, 3, 15, 0);

function retrato(s: ReturnType<typeof bancoFalso>['s']) {
  const nome = (pid: string) => s.pessoas.find((p) => p.id === pid)!.nome;
  const ordenado = (xs: string[]) => [...xs].sort();
  return {
    pessoas: ordenado(s.pessoas.map((p) => `${p.categoria}|${p.nome}`)),
    vinculos: ordenado(s.vinculos.map((v) => `${nome(v.pessoaId)}|${v.unidadeId}|${v.tipo}|${v.status}|${!!v.conferencia}`)),
    veiculos: ordenado(s.veiculos.map((v) => `${v.placa}|${v.unidadeId}`)),
    funcionarios: s.funcionarios.length,
    autorizacoes: ordenado(s.autorizacoes.map((a) => `${nome(a.pessoaId)}|${a.unidadeId ?? a.areaComumId}`)),
    restricoes: ordenado(s.restricoes.map((r) => `${nome(r.pessoaId)}|${r.escopo}|${r.unidadeId}|${r.aprovada}`)),
    eventos: ordenado(s.eventos.map((e) => `${e.tipo}|${e.tipo === 'entrada' && s.funcionarios.some((f) => f.pessoaId === e.pessoaId) ? 'porteiro' : nome(e.pessoaId)}|${e.unidadeDestinoId}|${e.areaComumId}`)),
    encomendas: ordenado(s.encomendas.map((e) => `${e.codigoRastreio}|${e.retiradaEm !== null}`)),
    ocorrencias: ordenado(s.ocorrencias.map((o) => `${o.descricao}|${o.status}|${o.eventoIds.length}`)),
    importacoesConfirmadas: [...s.importacoes.values()].filter((i) => i.status === 'confirmada').length,
  };
}

describe('carregador (banco falso)', () => {
  it('carga completa: tudo pelo fluxo das RPCs, nas contagens declaradas', async () => {
    const b = bancoFalso();
    const rel = await carregar(c, b.api(), silencioso, AGORA);
    const r = retrato(b.s);
    expect(r.pessoas.filter((p) => p.startsWith('morador|'))).toHaveLength(543);
    expect(b.s.vinculos.filter((v) => v.status === 'aprovado')).toHaveLength(499);
    expect(b.s.vinculos.filter((v) => v.status === 'legado')).toHaveLength(44);
    expect(b.s.vinculos.filter((v) => v.status === 'legado').every((v) => !v.conferencia)).toBe(true);
    expect(r.veiculos).toHaveLength(175);
    expect(r.funcionarios).toBe(6);
    expect(r.pessoas.filter((p) => /^(visitante|prestador)\|/.test(p))).toHaveLength(24);
    expect(r.autorizacoes).toHaveLength(8);
    expect(b.s.restricoes.map((x) => `${x.escopo}:${x.aprovada}`).sort()).toEqual(['condominio:true', 'unidade:false', 'unidade:false']);
    const tipos = b.s.eventos.reduce<Record<string, number>>((m, e) => ({ ...m, [e.tipo]: (m[e.tipo] ?? 0) + 1 }), {});
    expect(tipos).toEqual({ entrada: 18, saida: 18, negado: 1, recusado: 1 });
    expect(b.s.eventos.filter((e) => e.tipo === 'entrada' && !b.s.eventos.some((x) => x.refere === e.id))).toHaveLength(0);
    expect(r.encomendas.filter((e) => e.endsWith('|true'))).toHaveLength(5);
    expect(r.encomendas).toHaveLength(8);
    expect(b.s.ocorrencias.map((o) => o.status).sort()).toEqual(['aberta', 'aberta', 'em_andamento', 'encerrada']);
    expect(b.s.ocorrencias.find((o) => o.eventoIds.length)!.eventoIds).toEqual([b.s.eventos.find((e) => e.tipo === 'negado')!.id]);
    expect(r.importacoesConfirmadas).toBe(9);
    expect(b.escritas.filter((x) => x === 'pessoa_criar')).toHaveLength(137 + 24);
    expect(rel).toMatchObject({ banco_vinculos_aprovados: 499, banco_vinculos_legado: 44, banco_vinculos_pendentes: 0, banco_funcionarios: 6 });
  });

  it('rodar de novo não grava nada', async () => {
    const b = bancoFalso();
    await carregar(c, b.api(), silencioso, AGORA);
    const antes = retrato(b.s);
    const n = b.escritas.length;
    const rel = await carregar(c, b.api(), silencioso, AGORA);
    expect(b.escritas.length).toBe(n);
    expect(retrato(b.s)).toEqual(antes);
    for (const [k, v] of Object.entries(rel)) if (typeof v === 'object') expect(`${k}:${v.criados}`).toBe(`${k}:0`);
  });

  it('parou no meio (resposta perdida depois de gravar) e retomou: mesmo estado final, sem duplicar', async () => {
    const limpo = bancoFalso();
    const registro: string[] = [];
    await carregar(c, limpo.api(0, registro), silencioso, AGORA);
    const esperado = retrato(limpo.s);
    // Parada na primeira, na segunda e na última chamada de cada RPC de escrita (todas as fases), mais pontos no meio.
    const pontos = new Set<number>([1, 2, Math.floor(registro.length / 3), Math.floor(registro.length / 2)]);
    for (const nome of new Set(registro.filter((x) => !LEITURAS.has(x)))) {
      const idx = registro.flatMap((x, i) => (x === nome ? [i + 1] : []));
      [idx[0]!, idx[1] ?? idx[0]!, idx.at(-1)!].forEach((k) => pontos.add(k));
    }
    expect(pontos.size).toBeGreaterThan(40);
    for (const ponto of pontos) {
      const b = bancoFalso();
      await expect(carregar(c, b.api(ponto), silencioso, AGORA)).rejects.toBeInstanceOf(ErroCarga);
      await carregar(c, b.api(), silencioso, AGORA);
      expect(retrato(b.s), `parada na chamada ${ponto} (${registro[ponto - 1]})`).toEqual(esperado);
    }
  });

  it('para, sem gravar, se a estrutura do banco não tem as 165 unidades (0036 não aplicada)', async () => {
    const b = bancoFalso();
    const api = b.api();
    const rpc = api.rpc.bind(api);
    const semG02: Api = { ...api, rpc: async <T,>(nome: string, a?: R) => {
      const r = await rpc<T>(nome, a);
      if (nome === 'catalogo') (r as R).unidades = (r as R).unidades.filter((u: R) => !(u.bloco === 'G' && u.numero === '02'));
      return r;
    } };
    await expect(carregar(c, semG02, silencioso, AGORA)).rejects.toThrow(/G-02/);
    expect(b.escritas).toEqual([]);
  });
});
