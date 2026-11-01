// Validação do conjunto sem rede (o `--dry-run`): as regras que o banco vai aplicar, conferidas antes, para a carga não
// parar no meio por um dado ruim. O banco continua sendo a autoridade (app.cpf_valido, validar_autorizacao_entrada...).
// Este arquivo roda direto no Node (sem bundler), por isso não importa src/domain/rules.ts (imports sem extensão): as
// poucas regras usadas aqui têm teste de paridade com as de rules.ts em popular.test.ts.
import { normalizarPlaca } from '../../src/domain/cpf.ts';
import { AREAS_COMUNS_INICIAIS, codigoUnidade, gerarUnidades, type EstruturaUnidade } from '../../src/domain/units.ts';
import { contar, cpfComDigitoValido, semAcento, type Conjunto, type Escala, type Contagens } from './gerador.ts';

export const MIN_JUSTIFICATIVA = 15;
export const justificativaValida = (t?: string | null) => (t ?? '').trim().length >= MIN_JUSTIFICATIVA;
export const temNumeroDePessoa = (t: string) => /[0-9]{9}/.test(t.replace(/[. -]/g, ''));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

export function validarEscala(e: Escala): string | null {
  if (!Array.isArray(e.diasSemana) || e.diasSemana.length < 1 || e.diasSemana.length > 7) return 'Escolha de 1 a 7 dias da semana.';
  if (new Set(e.diasSemana).size !== e.diasSemana.length || e.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Dias da semana inválidos.';
  if (!HHMM.test(e.horaInicio) || !HHMM.test(e.horaFim)) return 'Informe início e fim no formato HH:MM.';
  if (e.horaInicio === e.horaFim) return 'O início e o fim da escala devem ser diferentes.';
  return null;
}

/** Escala vigente num minuto da semana (dow 0 = domingo); turno que passa da meia-noite vale no dia em que começa. */
export function escalaVigenteNoMinuto(e: Escala, dow: number, m: number): boolean {
  const ini = minutos(e.horaInicio);
  const fim = minutos(e.horaFim);
  if (fim >= ini) return e.diasSemana.includes(dow) && m >= ini && m <= fim;
  return (e.diasSemana.includes(dow) && m >= ini) || (e.diasSemana.includes((dow + 6) % 7) && m <= fim);
}

export interface Resultado { problemas: string[]; contagens: Contagens }

export function validarConjunto(c: Conjunto, estrutura: readonly EstruturaUnidade[] = gerarUnidades()): Resultado {
  const p: string[] = [];
  const codigos = new Set(estrutura.map(codigoUnidade));
  const areas = new Set<string>(AREAS_COMUNS_INICIAIS);

  if (codigos.size !== 165) p.push(`estrutura com ${codigos.size} unidades (esperado 165)`);
  const geradas = new Set(c.unidades.map((u) => u.codigo));
  if (geradas.size !== codigos.size || [...geradas].some((x) => !codigos.has(x))) p.push('unidades do conjunto diferentes da estrutura do domain');

  const nomes = new Map<string, number>();
  const marcar = (nome: string) => nomes.set(semAcento(nome), (nomes.get(semAcento(nome)) ?? 0) + 1);
  const cpfs = new Map<string, number>();
  const cpf = (dono: string, d: string | null, obrigatorio: boolean) => {
    if (d === null) { if (obrigatorio) p.push(`${dono}: sem CPF`); return; }
    if (!cpfComDigitoValido(d)) p.push(`${dono}: CPF com dígito inválido`);
    cpfs.set(d, (cpfs.get(d) ?? 0) + 1);
  };
  const telefone = (dono: string, t: string | null) => {
    if (t !== null && !/^119[0-9]{8}$/.test(t)) p.push(`${dono}: telefone fora do padrão (11) 9xxxx-xxxx`);
  };

  const moradoresDa = new Map<string, Set<string>>();
  const adultoValido = new Map<string, Set<string>>();
  for (const m of c.moradores) {
    marcar(m.nome);
    if (!codigos.has(m.unidade)) p.push(`${m.nome}: unidade ${m.unidade} não existe`);
    if (!['proprietario', 'inquilino', 'dependente'].includes(m.tipo)) p.push(`${m.nome}: tipo de vínculo ${m.tipo}`);
    if (m.nome.length > 150 || m.nome.trim() !== m.nome || !m.nome) p.push(`${m.nome}: nome inválido`);
    if (m.menor) {
      if (m.tipo !== 'dependente') p.push(`${m.nome}: menor só como dependente`);
      if (m.cpf !== null || m.telefone !== null) p.push(`${m.nome}: menor cadastrado sem CPF e sem telefone (minimização)`);
      if (!m.regularizar) p.push(`${m.nome}: menor entra pelo cadastro individual, sempre aprovado`);
    } else {
      cpf(m.nome, m.cpf, true);
      telefone(m.nome, m.telefone);
      if (m.telefone === null) p.push(`${m.nome}: adulto sem telefone não regulariza (cadastro incompleto)`);
    }
    if (m.tipo === 'inquilino' && m.regularizar && !(m.vigenciaFimDias !== null && m.vigenciaFimDias > 0)) {
      p.push(`${m.nome}: inquilino regularizado exige fim da vigência futuro`);
    }
    const d = m.comprovante.descricao ?? '';
    if (m.comprovante.tipo === 'outro' && !d.trim()) p.push(`${m.nome}: comprovante "outro" exige descrição`);
    if (d.length > 80 || temNumeroDePessoa(d)) p.push(`${m.nome}: descrição do comprovante inválida`);
    if (m.tipo === 'inquilino' && m.comprovante.tipo !== 'contrato_locacao') p.push(`${m.nome}: inquilino com comprovante ${m.comprovante.tipo}`);
    if (!moradoresDa.has(m.unidade)) moradoresDa.set(m.unidade, new Set());
    moradoresDa.get(m.unidade)!.add(m.nome);
    if (!m.menor && m.regularizar) {
      if (!adultoValido.has(m.unidade)) adultoValido.set(m.unidade, new Set());
      adultoValido.get(m.unidade)!.add(m.nome);
    }
  }
  for (const u of c.unidades) {
    const ocupada = moradoresDa.has(u.codigo);
    if ((u.situacao === 'vazia') === ocupada) p.push(`${u.codigo}: situação ${u.situacao} não bate com os moradores`);
    if (ocupada && ![...moradoresDa.get(u.codigo)!].some((n) => c.moradores.find((m) => m.nome === n && !m.menor))) {
      p.push(`${u.codigo}: unidade ocupada sem adulto`);
    }
  }

  const placas = new Set<string>();
  for (const v of c.veiculos) {
    if (normalizarPlaca(v.placa) !== v.placa) p.push(`${v.placa}: placa fora do padrão antigo ou Mercosul`);
    if (placas.has(v.placa)) p.push(`${v.placa}: placa repetida`);
    placas.add(v.placa);
    if (!moradoresDa.get(v.unidade)?.has(v.dono)) p.push(`${v.placa}: dono não mora na ${v.unidade}`);
    if (!v.modelo.trim() || !v.cor.trim() || v.modelo.length > 60 || v.cor.length > 30) p.push(`${v.placa}: modelo ou cor inválidos`);
  }

  for (const f of c.funcionarios) {
    marcar(f.nome);
    cpf(f.nome, f.cpf, true);
    telefone(f.nome, f.telefone);
    const e = validarEscala(f.escala);
    if (e) p.push(`${f.nome}: ${e}`);
    if (!f.funcao.trim()) p.push(`${f.nome}: sem função`);
  }
  const porteiros = c.funcionarios.filter((f) => f.porteiro);
  for (let dow = 0; dow < 7; dow++) {
    for (let m = 0; m < 24 * 60; m++) {
      if (!porteiros.some((f) => escalaVigenteNoMinuto(f.escala, dow, m))) {
        p.push(`nenhum porteiro em escala no dia ${dow} às ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        dow = 7;
        break;
      }
    }
  }

  const externo = new Map(c.externos.map((e) => [e.nome, e]));
  for (const e of c.externos) {
    marcar(e.nome);
    cpf(e.nome, e.cpf, true);
    telefone(e.nome, e.telefone);
    if (e.categoria === 'prestador' && !e.empresa?.trim()) p.push(`${e.nome}: prestador exige empresa (RF-36)`);
  }

  for (const [n, k] of nomes) if (k > 1) p.push(`nome repetido: ${n}`);
  for (const [, k] of cpfs) if (k > 1) { p.push('CPF repetido'); break; }

  const ehMoradorValido = (nome: string | undefined, unidade: string | undefined) => !!nome && !!unidade && !!adultoValido.get(unidade)?.has(nome);
  const autorizacoes = new Map(c.autorizacoes.map((a) => [a.chave, a]));
  for (const a of c.autorizacoes) {
    const x = externo.get(a.pessoa);
    if (!x) p.push(`${a.chave}: pessoa não cadastrada`);
    if ((a.unidade === undefined) === (a.area === undefined)) p.push(`${a.chave}: informe a unidade OU a área comum`);
    if (a.unidade !== undefined && !codigos.has(a.unidade)) p.push(`${a.chave}: unidade inexistente`);
    if (a.area !== undefined) {
      if (!areas.has(a.area)) p.push(`${a.chave}: área comum inexistente`);
      if (x?.categoria !== 'prestador') p.push(`${a.chave}: área comum só para prestador`);
      if (a.solicitante) p.push(`${a.chave}: área comum não tem morador solicitante`);
    } else if (a.solicitante ? !ehMoradorValido(a.solicitante, a.unidade) : !justificativaValida(a.justificativa)) {
      p.push(`${a.chave}: solicitante com vínculo na unidade ou justificativa de ${MIN_JUSTIFICATIVA}+ caracteres`);
    }
    if (!(a.validaAteDias >= 0)) p.push(`${a.chave}: validade no passado`);
    if ((a.horaInicio === undefined) !== (a.horaFim === undefined)) p.push(`${a.chave}: janela incompleta`);
    if (a.horaInicio !== undefined && (!HHMM.test(a.horaInicio) || !HHMM.test(a.horaFim!) || a.horaFim! <= a.horaInicio)) p.push(`${a.chave}: janela inválida`);
    if (a.diasSemana && (a.diasSemana.length < 1 || a.diasSemana.length > 6 || new Set(a.diasSemana).size !== a.diasSemana.length
      || a.diasSemana.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) p.push(`${a.chave}: dias da semana inválidos`);
  }

  const restritos = new Map<string, Set<string>>();
  for (const r of c.restricoes) {
    if (!externo.has(r.pessoa)) p.push(`${r.chave}: pessoa não cadastrada`);
    if (!r.motivo.trim() || r.motivo.length > 300) p.push(`${r.chave}: motivo inválido`);
    if (!(r.validaAteDias >= 0)) p.push(`${r.chave}: validade no passado`);
    if (r.condominio) {
      if (r.unidade || r.solicitante) p.push(`${r.chave}: restrição de condomínio sem unidade nem solicitante`);
    } else if (!r.unidade || !codigos.has(r.unidade) || !ehMoradorValido(r.solicitante, r.unidade)) {
      p.push(`${r.chave}: restrição de unidade exige a unidade e o morador que pediu`);
    }
    if (!restritos.has(r.pessoa)) restritos.set(r.pessoa, new Set());
    restritos.get(r.pessoa)!.add(r.condominio ? '*' : r.unidade!);
  }
  const bloqueado = (pessoa: string, unidade?: string) => {
    const s = restritos.get(pessoa);
    return !!s && (s.has('*') || (!!unidade && s.has(unidade)));
  };

  const entrou = new Set<string>();
  const chaves = new Set<string>();
  for (const e of c.eventos) {
    if (chaves.has(e.chave)) p.push(`${e.chave}: chave repetida`);
    chaves.add(e.chave);
    if (e.tipo === 'negado') {
      if (!bloqueado(e.pessoa, e.unidade)) p.push(`${e.chave}: negado sem restrição vigente`);
      if (!ehMoradorValido(e.autorizador, e.unidade)) p.push(`${e.chave}: autorizador sem vínculo`);
      continue;
    }
    if (e.tipo === 'recusado') {
      if (!externo.has(e.pessoa) || !ehMoradorValido(e.morador, e.unidade)) p.push(`${e.chave}: recusa exige visitante cadastrado e morador com vínculo`);
      if (bloqueado(e.pessoa, e.unidade)) p.push(`${e.chave}: pessoa restrita`);
      continue;
    }
    if (e.unidade !== undefined && !codigos.has(e.unidade)) p.push(`${e.chave}: unidade inexistente`);
    if (e.area !== undefined && !areas.has(e.area)) p.push(`${e.chave}: área comum inexistente`);
    if (e.unidade !== undefined && e.area !== undefined) p.push(`${e.chave}: destino duplo`);
    if (e.veiculo && normalizarPlaca(e.veiculo.placa) !== e.veiculo.placa) p.push(`${e.chave}: placa inválida`);
    if (e.pessoa === null) {
      if (e.meio !== 'escala' || e.unidade || e.area) p.push(`${e.chave}: funcionário em escala entra por "escala", sem destino`);
      continue;
    }
    if (entrou.has(e.pessoa)) p.push(`${e.chave}: ${e.pessoa} entraria duas vezes sem sair`);
    entrou.add(e.pessoa);
    if (bloqueado(e.pessoa, e.unidade)) p.push(`${e.chave}: pessoa com restrição vigente no destino`);
    const x = externo.get(e.pessoa);
    if (!x) {
      if (!e.unidade || !moradoresDa.get(e.unidade)?.has(e.pessoa) || !ehMoradorValido(e.pessoa, e.unidade)) p.push(`${e.chave}: morador sem vínculo válido na unidade`);
      if (e.meio) p.push(`${e.chave}: morador entra sem meio de autorização`);
      continue;
    }
    if (e.area !== undefined && x.categoria !== 'prestador') p.push(`${e.chave}: área comum só para prestador`);
    if (e.unidade === undefined && e.area === undefined) p.push(`${e.chave}: informe o destino`);
    const aceitos = e.area !== undefined ? ['autorizacao_previa', 'excecao_porteiro'] : ['interfone', 'celular', 'morador_presente', 'autorizacao_previa', 'excecao_porteiro'];
    if (!e.meio || !aceitos.includes(e.meio)) p.push(`${e.chave}: meio ${e.meio ?? '(nenhum)'} não vale para ${x.categoria}`);
    if (e.meio === 'interfone' || e.meio === 'celular' || e.meio === 'morador_presente') {
      if (!ehMoradorValido(e.autorizador, e.unidade)) p.push(`${e.chave}: autorizador sem vínculo válido na unidade`);
    }
    if (e.meio === 'excecao_porteiro' && !justificativaValida(e.justificativa)) p.push(`${e.chave}: exceção exige justificativa`);
    if (e.meio === 'autorizacao_previa') {
      const a = e.autorizacao ? autorizacoes.get(e.autorizacao) : undefined;
      if (!a || a.pessoa !== e.pessoa || a.unidade !== e.unidade || a.area !== e.area) p.push(`${e.chave}: autorização prévia não é desta pessoa e destino`);
      else if (a.diasSemana || a.horaInicio) p.push(`${e.chave}: autorização com janela pode não valer na hora da carga`);
    }
  }
  const entradas = c.eventos.filter((e) => e.tipo === 'entrada').map((e) => e.chave);
  if (new Set(c.saidas).size !== c.saidas.length || c.saidas.length !== entradas.length || c.saidas.some((s) => !entradas.includes(s))) {
    p.push('cada entrada precisa de exatamente uma saída');
  }

  const rastreios = new Set<string>();
  for (const e of c.encomendas) {
    if (rastreios.has(e.rastreio)) p.push(`${e.rastreio}: rastreio repetido`);
    rastreios.add(e.rastreio);
    if (!codigos.has(e.unidade) || !e.destinatario.trim()) p.push(`${e.rastreio}: unidade ou destinatário inválidos`);
    if (e.entregarPara && !ehMoradorValido(e.entregarPara, e.unidade)) p.push(`${e.rastreio}: quem retira precisa de vínculo na unidade`);
  }
  const descricoes = new Set<string>();
  for (const o of c.ocorrencias) {
    if (!o.descricao.trim() || descricoes.has(o.descricao) || temNumeroDePessoa(o.descricao)) p.push(`ocorrência com descrição vazia, repetida ou com número pessoal`);
    descricoes.add(o.descricao);
    if (o.unidade !== undefined && !codigos.has(o.unidade)) p.push('ocorrência em unidade inexistente');
    if (o.vincularNegado && !c.eventos.some((e) => e.tipo === 'negado' && e.chave === o.vincularNegado)) p.push('ocorrência ligada a evento inexistente');
  }
  for (const t of [...c.eventos.map((e) => ('justificativa' in e ? e.justificativa ?? '' : '')), ...c.autorizacoes.map((a) => a.justificativa ?? ''), ...c.restricoes.map((r) => r.motivo)]) {
    if (temNumeroDePessoa(t)) p.push('texto livre com número que parece CPF ou telefone');
  }

  const k = contar(c);
  if (k.unidades !== 165) p.push(`${k.unidades} unidades (esperado 165)`);
  if (k.moradores < 500 || k.moradores > 600) p.push(`${k.moradores} moradores (esperado de 500 a 600)`);
  if (k.veiculos < 160 || k.veiculos > 190) p.push(`${k.veiculos} veículos (esperado cerca de 175)`);
  return { problemas: p, contagens: k };
}
