// Carga do conjunto pelas RPCs api.* que a interface usa, como o síndico logado: cada escrita passa pelas regras do
// banco e vai para a trilha. Idempotente e retomável: cada fase confere antes o que já existe (pela listagem, pela
// recusa 409 do banco ou pela chave natural do dado) e só grava o que falta. Nada aqui contorna uma regra: recusa
// inesperada para a carga (ErroCarga) e a próxima execução continua de onde parou.
import { DIA, toInputDate } from '../../src/domain/time.ts';
import { ErroCarga, type Api } from './cliente.ts';
import {
  formatarCpf, formatarTelefone, semAcento, type Conjunto, type EntradaPlanejada, type MoradorGerado, type OcorrenciaGerada,
} from './gerador.ts';

export interface Registro { info(msg: string): void }

type Pagina<T> = { itens: T[]; temMais: boolean; cursor: string | null };
interface Vinculo { id: string; pessoaId: string; unidadeId: string; status: string; conferencia: unknown; pessoaNome: string; unidadeCodigo: string }
interface Evento { id: string; tipo: string; unidadeDestinoId: string | null; areaComumId: string | null }
interface Encomenda { id: string; codigoRastreio: string; retiradaEm: number | null }
interface Ocorrencia { id: string; descricao: string; status: OcorrenciaGerada['status'] }
interface Restricao { id: string; pessoaId: string; escopo: string; unidadeId: string | null }

export interface Contador { criados: number; existentes: number }
export type Relatorio = Record<string, Contador | number | string>;

const ATIVOS = new Set(['pendente', 'aprovado', 'legado']);
const ROTULO_TIPO = { proprietario: 'Proprietário', inquilino: 'Inquilino', dependente: 'Dependente' } as const;
const ORDEM_STATUS = ['aberta', 'em_andamento', 'encerrada'] as const;
const chave = (nome: string, unidade: string) => `${semAcento(nome)}|${unidade}`;

export async function carregar(c: Conjunto, api: Api, log: Registro, agora: number = Date.now()): Promise<Relatorio> {
  const dia = (dias: number) => toInputDate(agora + dias * DIA);
  const contadores: Record<string, Contador> = {};
  const conta = (nome: string, criado: boolean) => {
    const k = (contadores[nome] ??= { criados: 0, existentes: 0 });
    if (criado) k.criados++; else k.existentes++;
  };
  const tentar = async <T>(f: () => Promise<T>, codigo: string): Promise<T | ErroCarga> => {
    try { return await f(); } catch (e) {
      if (e instanceof ErroCarga && e.codigo === codigo) return e;
      throw e;
    }
  };
  async function todas<T>(nome: string, filtro: Record<string, unknown> = {}): Promise<T[]> {
    const itens: T[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 200; i++) {
      const p: Pagina<T> = await api.rpc(nome, { p: { ...filtro, limite: 100, ...(cursor ? { cursor } : {}) } }, { leitura: true });
      itens.push(...p.itens);
      if (!p.temMais || !p.cursor) return itens;
      cursor = p.cursor;
    }
    throw new ErroCarga('PAGINACAO', `${nome}: páginas demais`);
  }

  // ----- Estrutura -----
  const cat = await api.rpc<{ unidades: { id: string; bloco: string; numero: string; ativo: boolean }[]; areasComuns: { id: string; nome: string; ativo: boolean }[] }>('catalogo', {}, { leitura: true });
  const unidadeId = new Map(cat.unidades.filter((u) => u.ativo).map((u) => [`${u.bloco}-${u.numero}`, u.id]));
  const areaId = new Map(cat.areasComuns.filter((a) => a.ativo).map((a) => [a.nome, a.id]));
  const faltam = c.unidades.filter((u) => !unidadeId.has(u.codigo)).map((u) => u.codigo);
  if (faltam.length) throw new ErroCarga('ESTRUTURA', `Unidades ausentes ou desativadas no banco (${faltam.join(', ')}). Aplique a migração 0036 antes.`);
  const uid = (codigo: string) => unidadeId.get(codigo)!;
  const aid = (nome: string) => {
    const id = areaId.get(nome);
    if (!id) throw new ErroCarga('ESTRUTURA', `Área comum "${nome}" ausente ou desativada.`);
    return id;
  };
  log.info(`Estrutura: ${unidadeId.size} unidades ativas, ${areaId.size} áreas comuns.`);

  const vinculos = new Map<string, Vinculo>();
  const recarregarVinculos = async () => {
    vinculos.clear();
    for (const v of await todas<Vinculo>('vinculos_listar')) if (ATIVOS.has(v.status)) vinculos.set(chave(v.pessoaNome, v.unidadeCodigo), v);
  };
  const vinculoDe = (m: Pick<MoradorGerado, 'nome' | 'unidade'>) => vinculos.get(chave(m.nome, m.unidade));

  // ----- Moradores adultos: planilha (RF-11), um arquivo por bloco -----
  await recarregarVinculos();
  const adultos = c.moradores.filter((m) => !m.menor);
  for (const bloco of [...new Set(c.unidades.map((u) => u.bloco))]) {
    const doBloco = adultos.filter((m) => m.unidade.startsWith(`${bloco}-`));
    const faltantes = doBloco.filter((m) => !vinculoDe(m));
    if (!faltantes.length) { doBloco.forEach(() => conta('moradores_adultos', false)); continue; }
    const linhas = doBloco.map((m, i) => ({
      linha: i + 2, bloco, unidade: m.unidade.slice(bloco.length + 1), nome: m.nome,
      documento: formatarCpf(m.cpf!), telefone: formatarTelefone(m.telefone!), tipo: ROTULO_TIPO[m.tipo],
    }));
    const arquivo = `moradores-ficticios-bloco-${bloco}.csv`;
    const analise = await api.rpc<{ id: string; importaveis: number; inconsistencias: { linha: number; codigo: string; tipo: string }[] }>(
      'importacao_analisar', { p: { arquivo, linhas } });
    const inesperadas = analise.inconsistencias.filter((i) => i.codigo !== 'DUPLICIDADE_BANCO');
    if (inesperadas.length) {
      throw new ErroCarga('IMPORTACAO', `Bloco ${bloco}: a análise apontou ${inesperadas.map((i) => `linha ${i.linha} ${i.codigo}`).join(', ')}. Nada foi confirmado.`);
    }
    const r = await api.rpc<{ importados: number; reaproveitados: number }>('importacao_confirmar', { p_id: analise.id, p: { linhas } });
    log.info(`Bloco ${bloco}: planilha com ${linhas.length} linhas, ${r.importados} vínculos novos, ${r.reaproveitados} reaproveitados.`);
    for (let i = 0; i < r.importados; i++) conta('moradores_adultos', true);
    for (let i = 0; i < r.reaproveitados; i++) conta('moradores_adultos', false);
  }
  await recarregarVinculos();

  // ----- Regularização dos vínculos legados (RN-09): conferência do comprovante e aprovação -----
  for (const m of adultos) {
    const v = vinculoDe(m);
    if (!v) throw new ErroCarga('IMPORTACAO', `Vínculo de ${m.nome} na ${m.unidade} não encontrado depois da importação.`);
    if (!m.regularizar || v.status === 'aprovado') { if (m.regularizar) conta('regularizados', false); continue; }
    if (v.status !== 'legado') throw new ErroCarga('VINCULO', `Vínculo de ${m.nome} na ${m.unidade} está ${v.status}; esperado legado.`);
    if (!v.conferencia) await api.rpc('vinculo_conferir', { p_id: v.id, p: { tipo: m.comprovante.tipo, ...(m.comprovante.descricao ? { descricao: m.comprovante.descricao } : {}) } });
    await api.rpc('vinculo_regularizar', { p_id: v.id, p: m.vigenciaFimDias !== null ? { vigenciaFim: dia(m.vigenciaFimDias) } : {} });
    conta('regularizados', true);
  }
  log.info(`Regularização: ${JSON.stringify(contadores.regularizados ?? {})}.`);

  // ----- Menores: cadastro sem CPF e sem telefone (LGPD art. 14), vínculo de dependente conferido e aprovado -----
  const pessoaCriar = async (p: Record<string, unknown>): Promise<{ id: string; criado: boolean }> => {
    const r = await tentar(() => api.rpc<{ id: string }>('pessoa_criar', { p }), 'PESSOA_DUPLICADA');
    if (!(r instanceof ErroCarga)) return { id: r.id, criado: true };
    const id = (r.detalhes as { pessoaId?: string; desativada?: boolean } | undefined)?.pessoaId;
    if (!id || (r.detalhes as { desativada?: boolean }).desativada) throw new ErroCarga('PESSOA', `${String(p.nome)}: cadastro existente desativado ou sem id.`);
    return { id, criado: false };
  };
  for (const m of c.moradores.filter((x) => x.menor)) {
    let v = vinculoDe(m);
    if (v?.status === 'aprovado') { conta('moradores_menores', false); continue; }
    if (!v) {
      const pessoa = await pessoaCriar({ nome: m.nome, categoria: 'morador', menorIdade: true });
      v = await api.rpc<Vinculo>('vinculo_criar', { p: { pessoaId: pessoa.id, unidadeId: uid(m.unidade), tipo: 'dependente' } });
    }
    if (v.status !== 'pendente') throw new ErroCarga('VINCULO', `Vínculo de ${m.nome} está ${v.status}; esperado pendente.`);
    if (!v.conferencia) await api.rpc('vinculo_conferir', { p_id: v.id, p: { tipo: 'outro', descricao: m.comprovante.descricao } });
    await api.rpc('vinculo_aprovar', { p_id: v.id });
    conta('moradores_menores', true);
  }
  await recarregarVinculos();
  const moradorId = (nome: string, unidade: string) => {
    const v = vinculos.get(chave(nome, unidade));
    if (!v) throw new ErroCarga('VINCULO', `${nome} sem vínculo na ${unidade}.`);
    return v.pessoaId;
  };
  log.info(`Moradores: ${JSON.stringify(contadores.moradores_adultos)} adultos, ${JSON.stringify(contadores.moradores_menores ?? {})} menores.`);

  // ----- Veículos da unidade (RF-08) -----
  for (const v of c.veiculos) {
    const r = await tentar(() => api.rpc('veiculo_criar', { p: { unidadeId: uid(v.unidade), placa: v.placa, modelo: v.modelo, cor: v.cor } }), 'PLACA_DUPLICADA');
    if (r instanceof ErroCarga) {
      const d = await api.rpc<{ veiculos: { placa: string }[] }>('unidade_detalhe', { p_ref: uid(v.unidade) }, { leitura: true });
      if (!d.veiculos.some((x) => x.placa.replace(/[^A-Z0-9]/g, '') === v.placa)) throw new ErroCarga('PLACA_DUPLICADA', `Placa ${v.placa} já ativa em outra unidade.`);
    }
    conta('veiculos', !(r instanceof ErroCarga));
  }

  // ----- Funcionários e escala (RF-09) -----
  const funcionarioId = new Map<string, string>();
  for (const f of c.funcionarios) {
    const r = await tentar(() => api.rpc<{ pessoaId: string }>('funcionario_criar', { p: {
      nome: f.nome, documento: formatarCpf(f.cpf), telefone: formatarTelefone(f.telefone), funcao: f.funcao, escala: f.escala, ativo: true,
    } }), 'PESSOA_DUPLICADA');
    let id: string;
    if (r instanceof ErroCarga) {
      id = (r.detalhes as { pessoaId?: string } | undefined)?.pessoaId ?? '';
      if (!id || !(await api.rpc('pessoa_funcionario', { p_id: id }, { leitura: true }))) throw new ErroCarga('FUNCIONARIO', `${f.nome}: CPF já cadastrado como pessoa que não é funcionário.`);
    } else id = r.pessoaId;
    funcionarioId.set(f.nome, id);
    conta('funcionarios', !(r instanceof ErroCarga));
  }

  // ----- Visitantes e prestadores -----
  const externoId = new Map<string, string>();
  for (const e of c.externos) {
    const r = await pessoaCriar({
      nome: e.nome, categoria: e.categoria, documento: formatarCpf(e.cpf), telefone: formatarTelefone(e.telefone),
      ...(e.empresa ? { empresa: e.empresa } : {}), ...(e.servico ? { servico: e.servico } : {}),
    });
    externoId.set(e.nome, r.id);
    conta(e.categoria === 'prestador' ? 'prestadores' : 'visitantes', r.criado);
  }
  const xid = (nome: string) => externoId.get(nome)!;

  // ----- Autorizações prévias (RF-14, RN-07, RF-36) -----
  const autorizacaoId = new Map<string, string>();
  for (const a of c.autorizacoes) {
    const pessoaId = xid(a.pessoa);
    let existente: { id: string } | undefined;
    if (a.unidade) {
      const d = await api.rpc<{ autorizacoes: { id: string; pessoaId: string }[] }>('unidade_detalhe', { p_ref: uid(a.unidade) }, { leitura: true });
      existente = d.autorizacoes.find((x) => x.pessoaId === pessoaId);
    } else {
      existente = (await api.rpc<{ id: string }[]>('autorizacoes_vigentes', { p_pessoa: pessoaId, p_destino: aid(a.area!), p_area_comum: true }, { leitura: true }))[0];
    }
    const id = existente?.id ?? (await api.rpc<{ id: string }>('autorizacao_criar', { p: {
      pessoaId, validaAte: dia(a.validaAteDias),
      ...(a.unidade ? { unidadeId: uid(a.unidade) } : { areaComumId: aid(a.area!) }),
      ...(a.solicitante ? { solicitadaPorPessoaId: moradorId(a.solicitante, a.unidade!) } : {}),
      ...(a.justificativa ? { justificativa: a.justificativa } : {}),
      ...(a.diasSemana ? { diasSemana: a.diasSemana } : {}),
      ...(a.horaInicio ? { horaInicio: a.horaInicio, horaFim: a.horaFim } : {}),
    } })).id;
    autorizacaoId.set(a.chave, id);
    conta('autorizacoes', !existente);
  }

  // ----- Restrições (RF-15, RN-06) -----
  for (const r of c.restricoes) {
    const pessoaId = xid(r.pessoa);
    if (!r.condominio) {
      const d = await api.rpc<{ restricoes: Restricao[] }>('unidade_detalhe', { p_ref: uid(r.unidade!) }, { leitura: true });
      const existe = d.restricoes.some((x) => x.pessoaId === pessoaId);
      if (!existe) {
        await api.rpc('restricao_criar', { p: {
          pessoaId, unidadeId: uid(r.unidade!), motivo: r.motivo, validaAte: dia(r.validaAteDias), solicitadaPorPessoaId: moradorId(r.solicitante!, r.unidade!),
        } });
      }
      conta('restricoes', !existe);
      continue;
    }
    let pendente = (await api.rpc<Restricao[]>('restricoes_pendentes', {}, { leitura: true })).find((x) => x.pessoaId === pessoaId);
    const vigente = (await api.rpc<{ alertas: Restricao[] }>('restricao_verificar', { p_pessoa: pessoaId, p_unidade: null }, { leitura: true }))
      .alertas.some((x) => x.escopo === 'condominio');
    if (vigente && !pendente) { conta('restricoes', false); continue; }
    pendente ??= await api.rpc<Restricao>('restricao_criar', { p: { pessoaId, motivo: r.motivo, validaAte: dia(r.validaAteDias), paraTodoCondominio: true } });
    await api.rpc('restricao_aprovar', { p_id: pendente.id });
    conta('restricoes', true);
  }
  log.info(`Cadastros: ${JSON.stringify({ veiculos: contadores.veiculos, funcionarios: contadores.funcionarios, autorizacoes: contadores.autorizacoes, restricoes: contadores.restricoes })}.`);

  // ----- Histórico curto: eventos reais no momento da carga (sem retroativo: a contingência é só para queda do sistema) -----
  // A listagem vem do mais novo para o mais antigo; o evento da carga é o mais antigo da pessoa (cadastro novo), e o
  // uso real posterior da demonstração não é confundido com ele.
  const eventosDe = (pessoaId: string, tipo: string) =>
    api.rpc<Pagina<Evento>>('eventos_listar', { p: { pessoaId, tipo, limite: 100 } }, { leitura: true }).then((p) => p.itens);
  const pessoaDoEvento = (e: { pessoa: string; unidade?: string }) => externoId.get(e.pessoa) ?? moradorId(e.pessoa, e.unidade!);
  const entradaId = new Map<string, string>();

  for (const e of c.eventos) {
    if (e.tipo === 'negado') {
      const pessoaId = xid(e.pessoa);
      if ((await eventosDe(pessoaId, 'negado')).length) { conta('eventos_negados', false); continue; }
      const rv = await api.rpc<{ restrita: boolean }>('restricao_verificar', { p_pessoa: pessoaId, p_unidade: uid(e.unidade) }, { leitura: true });
      if (!rv.restrita) throw new ErroCarga('RESTRICAO', `${e.chave}: a restrição não está vigente; a tentativa viraria entrada.`);
      const r = await api.rpc<{ resultado: string }>('evento_entrada', { p: {
        pessoaId, unidadeDestinoId: uid(e.unidade), autorizadoPorTipo: e.meio, autorizadoPorPessoaId: moradorId(e.autorizador, e.unidade),
      } });
      if (r.resultado !== 'negado') throw new ErroCarga('EVENTO', `${e.chave}: esperado negado, o banco respondeu ${r.resultado}.`);
      conta('eventos_negados', true);
      continue;
    }
    if (e.tipo === 'recusado') {
      const pessoaId = xid(e.pessoa);
      const existe = (await eventosDe(pessoaId, 'recusado')).length > 0;
      if (!existe) {
        await api.rpc('evento_recusa', { p: { pessoaId, unidadeDestinoId: uid(e.unidade), meio: e.meio, moradorPessoaId: moradorId(e.morador, e.unidade) } });
      }
      conta('eventos_recusas', !existe);
      continue;
    }
    entradaId.set(e.chave, await registrarEntrada(e));
  }

  async function registrarEntrada(e: EntradaPlanejada): Promise<string> {
    if (e.pessoa === null) {
      const porteiros = c.funcionarios.filter((f) => f.porteiro).map((f) => funcionarioId.get(f.nome)!);
      for (const id of porteiros) {
        const ja = (await eventosDe(id, 'entrada')).at(-1);
        if (ja) { conta('eventos_entradas', false); return ja.id; }
      }
      const lista = await todas<{ pessoaId: string; emEscalaAgora: boolean }>('funcionarios_listar');
      const emEscala = porteiros.find((id) => lista.some((f) => f.pessoaId === id && f.emEscalaAgora));
      if (!emEscala) throw new ErroCarga('ESCALA', `${e.chave}: nenhum porteiro do conjunto em escala agora.`);
      const r = await api.rpc<{ resultado: string; evento: { id: string } }>('evento_entrada', { p: { pessoaId: emEscala, autorizadoPorTipo: 'escala' } });
      conta('eventos_entradas', true);
      return r.evento.id;
    }
    const pessoaId = pessoaDoEvento({ pessoa: e.pessoa, unidade: e.unidade });
    const destino = e.unidade ? uid(e.unidade) : aid(e.area!);
    const ja = (await eventosDe(pessoaId, 'entrada')).filter((x) => (e.unidade ? x.unidadeDestinoId : x.areaComumId) === destino).at(-1);
    if (ja) { conta('eventos_entradas', false); return ja.id; }
    const r = await api.rpc<{ resultado: string; evento: { id: string } }>('evento_entrada', { p: {
      pessoaId, ...(e.unidade ? { unidadeDestinoId: destino } : { areaComumId: destino }), autorizadoPorTipo: e.meio ?? null,
      ...(e.autorizador ? { autorizadoPorPessoaId: moradorId(e.autorizador, e.unidade!) } : {}),
      ...(e.autorizacao ? { autorizacaoPreviaId: autorizacaoId.get(e.autorizacao) } : {}),
      ...(e.justificativa ? { justificativa: e.justificativa } : {}),
      ...(e.tipoVisita ? { tipoVisita: e.tipoVisita } : {}),
      ...(e.veiculo ? { veiculo: e.veiculo } : {}),
    } });
    if (r.resultado !== 'entrada') throw new ErroCarga('EVENTO', `${e.chave}: esperado entrada, o banco respondeu ${r.resultado}.`);
    conta('eventos_entradas', true);
    return r.evento.id;
  }

  for (const k of c.saidas) {
    const r = await tentar(() => api.rpc('evento_saida', { p_entrada: entradaId.get(k), p: {} }), 'SAIDA_JA_REGISTRADA');
    conta('eventos_saidas', !(r instanceof ErroCarga));
  }

  // ----- Encomendas (RF-22 a RF-26) -----
  const encomendas = new Map((await todas<Encomenda>('encomendas_listar')).map((x) => [x.codigoRastreio, x]));
  for (const x of c.encomendas) {
    let e = encomendas.get(x.rastreio);
    conta('encomendas_recebidas', !e);
    e ??= await api.rpc<Encomenda>('encomenda_receber', { p: {
      unidadeId: uid(x.unidade), destinatario: x.destinatario, transportadora: x.transportadora, codigoRastreio: x.rastreio, unidadeConfirmada: true,
    } });
    if (!x.entregarPara) continue;
    const ja = e.retiradaEm !== null;
    if (!ja) await api.rpc('encomenda_entregar', { p_id: e.id, p_pessoa: moradorId(x.entregarPara, x.unidade) });
    conta('encomendas_entregues', !ja);
  }

  // ----- Ocorrências sem anexo (RF-27, RF-28) -----
  const ocorrencias = new Map((await todas<Ocorrencia>('ocorrencias_listar')).map((o) => [o.descricao, o]));
  for (const o of c.ocorrencias) {
    let atual = ocorrencias.get(o.descricao);
    conta('ocorrencias', !atual);
    if (!atual) {
      const ids: string[] = [];
      if (o.vincularNegado) {
        const n = c.eventos.find((e) => e.chave === o.vincularNegado);
        const ev = n && n.tipo === 'negado' ? (await eventosDe(xid(n.pessoa), 'negado')).at(-1) : undefined;
        if (!ev) throw new ErroCarga('OCORRENCIA', `Evento ${o.vincularNegado} não encontrado para ligar à ocorrência.`);
        ids.push(ev.id);
      }
      atual = await api.rpc<Ocorrencia>('ocorrencia_criar', { p: {
        tipo: o.tipo, descricao: o.descricao, ...(o.unidade ? { unidadeId: uid(o.unidade) } : {}), ...(ids.length ? { eventoIds: ids } : {}),
      } });
    }
    for (let i = ORDEM_STATUS.indexOf(atual.status); i < ORDEM_STATUS.indexOf(o.status); i++) {
      atual = await api.rpc<Ocorrencia>('ocorrencia_alterar_status', { p_id: atual.id, p_status: ORDEM_STATUS[i + 1] });
      conta('ocorrencias_status', true);
    }
  }

  // ----- Relatório: contagens do banco -----
  const vinc = async (s: string) => api.rpc<number>('vinculos_contar', { p_status: s }, { leitura: true });
  const resumo = await api.rpc<{ aguardando: number; entregues: number }>('encomendas_resumo', { p_dias: 7 }, { leitura: true });
  return {
    ...contadores,
    banco_unidades_ativas: unidadeId.size,
    banco_vinculos_aprovados: await vinc('aprovado'),
    banco_vinculos_legado: await vinc('legado'),
    banco_vinculos_pendentes: await vinc('pendente'),
    banco_funcionarios: (await todas('funcionarios_listar')).length,
    banco_encomendas_aguardando: resumo.aguardando,
    banco_encomendas_entregues: resumo.entregues,
    chamadas_rpc: api.chamadas,
  };
}
