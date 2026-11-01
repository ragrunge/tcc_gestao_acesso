// Gerador determinístico do conjunto fictício da demonstração: moradores (adultos pela planilha, menores pelo cadastro),
// veículos, funcionários, visitantes, prestadores, autorizações, restrições e um histórico curto de operação.
// Sem rede e sem relógio: datas são deslocamentos em dias a partir do dia da carga (o carregador converte).
import { codigoUnidade, gerarUnidades, type EstruturaUnidade } from '../../src/domain/units.ts';
import { criarAleatorio, type Aleatorio } from './aleatorio.ts';
import { CORES, MODELOS, NOMES_FEMININOS, NOMES_MASCULINOS, SOBRENOMES, TRANSPORTADORAS } from './dados.ts';

export const SEMENTE_PADRAO = 20261031;

export type TipoVinculo = 'proprietario' | 'inquilino' | 'dependente';
export type TipoComprovante = 'escritura' | 'contrato_compra_venda' | 'contrato_locacao' | 'outro';
export type Meio = 'interfone' | 'celular' | 'morador_presente' | 'autorizacao_previa' | 'excecao_porteiro' | 'escala';
export type TipoVisita = 'visita' | 'entrega' | 'transporte_app' | 'servico';

export interface UnidadeGerada { codigo: string; bloco: string; numero: string; situacao: 'propria' | 'alugada' | 'vazia'; legado: boolean }

export interface MoradorGerado {
  nome: string;
  unidade: string;
  tipo: TipoVinculo;
  menor: boolean;
  /** 11 dígitos; null só para menor (cadastrado sem CPF, LGPD art. 14). */
  cpf: string | null;
  telefone: string | null;
  /** Adulto: vínculo legado da planilha regularizado (aprovado). Menor: sempre aprovado pelo cadastro individual. */
  regularizar: boolean;
  comprovante: { tipo: TipoComprovante; descricao?: string };
  /** Inquilino regularizado: fim do contrato, em dias a partir da carga. */
  vigenciaFimDias: number | null;
}

export interface VeiculoGerado { unidade: string; placa: string; modelo: string; cor: string; dono: string }

export interface Escala { diasSemana: number[]; horaInicio: string; horaFim: string }
export interface FuncionarioGerado { nome: string; cpf: string; telefone: string; funcao: string; escala: Escala; porteiro: boolean }

export interface ExternoGerado {
  nome: string; categoria: 'visitante' | 'prestador'; cpf: string; telefone: string; empresa?: string; servico?: string;
}

export interface AutorizacaoGerada {
  chave: string; pessoa: string; unidade?: string; area?: string; solicitante?: string; justificativa?: string;
  validaAteDias: number; diasSemana?: number[]; horaInicio?: string; horaFim?: string;
}

export interface RestricaoGerada {
  chave: string; pessoa: string; unidade?: string; solicitante?: string; motivo: string; validaAteDias: number; condominio: boolean;
}

export interface EntradaPlanejada {
  tipo: 'entrada'; chave: string;
  /** Nome da pessoa; null = o porteiro (funcionário) que estiver em escala no momento da carga. */
  pessoa: string | null;
  unidade?: string; area?: string; meio?: Meio; autorizador?: string; autorizacao?: string; justificativa?: string;
  tipoVisita?: TipoVisita; veiculo?: { placa: string; modelo: string; cor: string };
}
export interface NegadoPlanejado { tipo: 'negado'; chave: string; pessoa: string; unidade: string; meio: 'interfone'; autorizador: string }
export interface RecusaPlanejada { tipo: 'recusado'; chave: string; pessoa: string; unidade: string; meio: 'interfone'; morador: string }
export type EventoPlanejado = EntradaPlanejada | NegadoPlanejado | RecusaPlanejada;

export interface EncomendaGerada { rastreio: string; transportadora: string; unidade: string; destinatario: string; entregarPara?: string }

export interface OcorrenciaGerada {
  descricao: string; tipo: 'conflito' | 'tentativa_acesso_indevido' | 'dano' | 'encomenda' | 'outro';
  unidade?: string; status: 'aberta' | 'em_andamento' | 'encerrada'; vincularNegado?: string;
}

export interface Conjunto {
  semente: number;
  unidades: UnidadeGerada[];
  moradores: MoradorGerado[];
  veiculos: VeiculoGerado[];
  funcionarios: FuncionarioGerado[];
  externos: ExternoGerado[];
  autorizacoes: AutorizacaoGerada[];
  restricoes: RestricaoGerada[];
  /** Entradas, negado e recusa, na ordem de registro. Toda entrada recebe saída (`saidas`). */
  eventos: EventoPlanejado[];
  /** Chaves das entradas, na ordem em que as saídas são registradas. */
  saidas: string[];
  encomendas: EncomendaGerada[];
  ocorrencias: OcorrenciaGerada[];
}

const VAZIAS = 8;
const ALUGADAS = 44;
const UNIDADES_LEGADO = 16;
/** Pessoas por apartamento ocupado: 1 a 6. */
const PESOS_TAMANHO = [6, 18, 24, 26, 17, 9];
const TOTAL_VEICULOS = 175;
const SEM_VEICULO = 25;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Os dois dígitos verificadores dos 9 primeiros. */
export function digitosVerificadoresCpf(nove: string): string {
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(nove);
  return `${d1}${dv(nove + d1)}`;
}

export const cpfComDigitoValido = (d: string) =>
  /^[0-9]{11}$/.test(d) && !/^(\d)\1{10}$/.test(d) && digitosVerificadoresCpf(d.slice(0, 9)) === d.slice(9);

export const formatarCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
export const formatarTelefone = (d: string) => `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;

function fabrica(r: Aleatorio) {
  const nomes = new Set<string>();
  const cpfs = new Set<string>();
  const telefones = new Set<string>();
  const placas = new Set<string>();
  return {
    nome(genero: 'F' | 'M', final: string, meio?: string): string {
      const primeiros = genero === 'F' ? NOMES_FEMININOS : NOMES_MASCULINOS;
      for (let t = 0; t < 500; t++) {
        const m = meio && t < 50 ? meio : r.escolher(SOBRENOMES.filter((s) => s !== final));
        const n = `${r.escolher(primeiros)} ${m} ${final}`;
        if (!nomes.has(semAcento(n))) { nomes.add(semAcento(n)); return n; }
      }
      throw new Error('gerador: nomes esgotados');
    },
    cpf(): string {
      for (;;) {
        const nove = r.digitos(9);
        if (/^(\d)\1{8}$/.test(nove)) continue;
        const c = nove + digitosVerificadoresCpf(nove);
        if (!cpfs.has(c)) { cpfs.add(c); return c; }
      }
    },
    telefone(): string {
      for (;;) {
        const t = `119${r.inteiro(1, 9)}${r.digitos(7)}`;
        if (!telefones.has(t)) { telefones.add(t); return t; }
      }
    },
    placa(): string {
      for (;;) {
        const l = () => r.escolher([...LETRAS]);
        const p = r.chance(0.6) ? `${l()}${l()}${l()}${r.digitos(1)}${l()}${r.digitos(2)}` : `${l()}${l()}${l()}${r.digitos(4)}`;
        if (!placas.has(p)) { placas.add(p); return p; }
      }
    },
  };
}

const outroGenero = (g: 'F' | 'M') => (g === 'F' ? 'M' : 'F');

export function gerarConjunto(semente = SEMENTE_PADRAO, estrutura: readonly EstruturaUnidade[] = gerarUnidades()): Conjunto {
  const r = criarAleatorio(semente);
  const f = fabrica(r);

  const ordem = r.embaralhar(estrutura.map((_, i) => i));
  const vazias = new Set(ordem.slice(0, VAZIAS));
  const alugadas = new Set(ordem.slice(VAZIAS, VAZIAS + ALUGADAS));
  const ocupadas = estrutura.map((_, i) => i).filter((i) => !vazias.has(i));
  const legado = new Set(r.embaralhar(ocupadas).slice(0, UNIDADES_LEGADO));

  const unidades: UnidadeGerada[] = estrutura.map((u, i) => ({
    codigo: codigoUnidade(u), bloco: u.bloco, numero: u.numero,
    situacao: vazias.has(i) ? 'vazia' : alugadas.has(i) ? 'alugada' : 'propria', legado: legado.has(i),
  }));

  const moradores: MoradorGerado[] = [];
  const adultosDa = new Map<string, MoradorGerado[]>();
  for (const u of unidades) {
    if (u.situacao === 'vazia') continue;
    const alugada = u.situacao === 'alugada';
    const titularTipo: TipoVinculo = alugada ? 'inquilino' : 'proprietario';
    const tamanho = 1 + r.ponderado(PESOS_TAMANHO);
    const familia = r.escolher(SOBRENOMES);
    const gTitular: 'F' | 'M' = r.chance(0.5) ? 'F' : 'M';
    const fimDoContrato = alugada && !u.legado ? 180 + 30 * r.inteiro(0, 24) : null;

    const adulto = (nome: string, tipo: TipoVinculo, comprovante: MoradorGerado['comprovante']): MoradorGerado => ({
      nome, unidade: u.codigo, tipo, menor: false, cpf: f.cpf(), telefone: f.telefone(), regularizar: !u.legado, comprovante,
      vigenciaFimDias: tipo === 'inquilino' ? fimDoContrato : null,
    });
    const comprovanteTitular = (): MoradorGerado['comprovante'] =>
      alugada ? { tipo: 'contrato_locacao' } : { tipo: r.chance(0.7) ? 'escritura' : 'contrato_compra_venda' };

    const casa: MoradorGerado[] = [adulto(f.nome(gTitular, familia), titularTipo, comprovanteTitular())];
    let adultos = 1;
    if (tamanho >= 2) {
      if (r.chance(0.8)) {
        const final = r.chance(0.7) ? familia : r.escolher(SOBRENOMES);
        const coTitular = r.chance(alugada ? 0.5 : 0.6);
        casa.push(adulto(f.nome(outroGenero(gTitular), final), coTitular ? titularTipo : 'dependente',
          coTitular ? comprovanteTitular() : { tipo: 'outro', descricao: 'Certidão de casamento' }));
      } else {
        casa.push(adulto(f.nome(r.chance(0.5) ? 'F' : 'M', familia), 'dependente', { tipo: 'outro', descricao: 'Declaração do titular da unidade' }));
      }
      adultos = 2;
    }
    const meioDosFilhos = casa[0]!.nome.split(' ')[1];
    for (let k = adultos; k < tamanho; k++) {
      const nome = f.nome(r.chance(0.5) ? 'F' : 'M', familia, meioDosFilhos);
      if (r.chance(0.55)) {
        casa.push({ nome, unidade: u.codigo, tipo: 'dependente', menor: true, cpf: null, telefone: null, regularizar: true,
          comprovante: { tipo: 'outro', descricao: 'Certidão de nascimento' }, vigenciaFimDias: null });
      } else {
        casa.push(adulto(nome, 'dependente', { tipo: 'outro', descricao: 'RG e certidão de nascimento' }));
      }
    }
    moradores.push(...casa);
    adultosDa.set(u.codigo, casa.filter((m) => !m.menor));
  }

  // Total fixo: das ocupadas, SEM_VEICULO ficam sem carro, as primeiras do sorteio têm 2 e o resto 1.
  const sorteio = r.embaralhar([...adultosDa.keys()]);
  const motorizadas = sorteio.length - SEM_VEICULO;
  const comDois = TOTAL_VEICULOS - motorizadas;
  if (comDois < 0 || comDois > motorizadas) throw new Error('gerador: total de veículos incompatível com as unidades ocupadas');
  const carros = new Map(sorteio.map((codigo, i) => [codigo, i < SEM_VEICULO ? 0 : i < SEM_VEICULO + comDois ? 2 : 1]));
  const veiculos: VeiculoGerado[] = [];
  for (const u of unidades) {
    const adultos = adultosDa.get(u.codigo);
    if (!adultos) continue;
    const n = carros.get(u.codigo)!;
    for (let k = 0; k < n; k++) {
      veiculos.push({ unidade: u.codigo, placa: f.placa(), modelo: r.escolher(MODELOS), cor: r.escolher(CORES), dono: adultos[k % adultos.length]!.nome });
    }
  }

  const pessoa = (genero?: 'F' | 'M') => f.nome(genero ?? (r.chance(0.5) ? 'F' : 'M'), r.escolher(SOBRENOMES));
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const funcionarios: FuncionarioGerado[] = [
    { funcao: 'Porteiro', escala: { diasSemana: todos, horaInicio: '06:00', horaFim: '14:10' }, porteiro: true },
    { funcao: 'Porteiro', escala: { diasSemana: todos, horaInicio: '14:00', horaFim: '22:10' }, porteiro: true },
    { funcao: 'Porteiro', escala: { diasSemana: todos, horaInicio: '22:00', horaFim: '06:10' }, porteiro: true },
    { funcao: 'Zelador', escala: { diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFim: '17:00' }, porteiro: false },
    { funcao: 'Auxiliar de limpeza', escala: { diasSemana: [1, 2, 3, 4, 5, 6], horaInicio: '07:00', horaFim: '16:00' }, porteiro: false },
    { funcao: 'Jardineiro', escala: { diasSemana: [2, 4], horaInicio: '07:00', horaFim: '12:00' }, porteiro: false },
  ].map((x) => ({ ...x, nome: pessoa(), cpf: f.cpf(), telefone: f.telefone() }));

  const visitante = (): ExternoGerado => ({ nome: pessoa(), categoria: 'visitante', cpf: f.cpf(), telefone: f.telefone() });
  const V = Array.from({ length: 18 }, visitante);
  const prestador = (empresa: string, servico: string): ExternoGerado =>
    ({ nome: pessoa(), categoria: 'prestador', cpf: f.cpf(), telefone: f.telefone(), empresa, servico });
  const P = [
    prestador('Água Clara Piscinas', 'Manutenção da piscina'),
    prestador('Eletro Vila Serviços', 'Reparo elétrico'),
    prestador('Bom Lar Reformas', 'Reforma de banheiro'),
    prestador('Autônomo', 'Personal trainer'),
    prestador('Dedetiza Paulista', 'Controle de pragas'),
    prestador('Antenas Rápidas', 'Instalação de antena'),
  ];
  const externos = [...V, ...P];

  // Cenários só em unidades ocupadas com vínculo regularizado (o autorizador vale enquanto o vínculo durar).
  const boas = r.embaralhar(unidades.filter((u) => u.situacao !== 'vazia' && !u.legado).map((u) => u.codigo));
  let cursor = 0;
  const proxima = () => boas[cursor++]!;
  const titular = (codigo: string) => adultosDa.get(codigo)![0]!.nome;

  const uA1 = proxima(), uA2 = proxima();
  const autorizacoes: AutorizacaoGerada[] = [
    { chave: 'A1', pessoa: V[9]!.nome, unidade: uA1, solicitante: titular(uA1), validaAteDias: 7 },
    { chave: 'A2', pessoa: V[10]!.nome, unidade: uA2, solicitante: titular(uA2), validaAteDias: 30 },
    { chave: 'A3', pessoa: P[0]!.nome, area: 'Piscina', validaAteDias: 60 },
  ];
  const uA4 = proxima(), uA5 = proxima(), uA6 = proxima(), uA7 = proxima();
  autorizacoes.push(
    { chave: 'A4', pessoa: V[14]!.nome, unidade: uA4, solicitante: titular(uA4), validaAteDias: 90, diasSemana: [2, 5], horaInicio: '08:00', horaFim: '17:00' },
    { chave: 'A5', pessoa: V[15]!.nome, unidade: uA5, solicitante: titular(uA5), validaAteDias: 60, diasSemana: [1, 2, 3, 4, 5, 6], horaInicio: '07:00', horaFim: '19:00' },
    { chave: 'A6', pessoa: V[16]!.nome, unidade: uA6, validaAteDias: 5,
      justificativa: 'Pedido do titular feito na administração, que confirmou o cadastro da visita.' },
    { chave: 'A7', pessoa: P[2]!.nome, unidade: uA7, solicitante: titular(uA7), validaAteDias: 30, diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFim: '17:00' },
    { chave: 'A8', pessoa: P[3]!.nome, area: 'Academia', validaAteDias: 90, diasSemana: [2, 4], horaInicio: '06:00', horaFim: '09:00' },
  );

  const uR1 = proxima(), uR2 = proxima();
  const restricoes: RestricaoGerada[] = [
    { chave: 'R1', pessoa: V[12]!.nome, unidade: uR1, solicitante: titular(uR1), motivo: 'Pedido do morador: não autorizar visitas desta pessoa', validaAteDias: 180, condominio: false },
    { chave: 'R2', pessoa: V[17]!.nome, unidade: uR2, solicitante: titular(uR2), motivo: 'Pedido do morador após desentendimento familiar', validaAteDias: 90, condominio: false },
    { chave: 'R3', pessoa: P[5]!.nome, motivo: 'Dano a área comum em serviço anterior, aprovado pelo síndico', validaAteDias: 365, condominio: true },
  ];

  const eventos: EventoPlanejado[] = [];
  const entrada = (e: Omit<EntradaPlanejada, 'tipo' | 'chave'>) => eventos.push({ tipo: 'entrada', chave: `E${eventos.length + 1}`, ...e });
  for (let k = 0; k < 6; k++) {
    const u = proxima();
    entrada({ pessoa: V[k]!.nome, unidade: u, meio: 'interfone', autorizador: titular(u), tipoVisita: 'visita' });
  }
  const u7 = proxima(), u8 = proxima(), u9 = proxima();
  entrada({ pessoa: V[6]!.nome, unidade: u7, meio: 'celular', autorizador: titular(u7), tipoVisita: 'entrega' });
  entrada({ pessoa: V[7]!.nome, unidade: u8, meio: 'celular', autorizador: titular(u8), tipoVisita: 'visita' });
  entrada({ pessoa: V[8]!.nome, unidade: u9, meio: 'morador_presente', autorizador: titular(u9), tipoVisita: 'visita' });
  entrada({ pessoa: V[9]!.nome, unidade: uA1, meio: 'autorizacao_previa', autorizacao: 'A1', tipoVisita: 'visita' });
  entrada({ pessoa: V[10]!.nome, unidade: uA2, meio: 'autorizacao_previa', autorizacao: 'A2', tipoVisita: 'visita' });
  entrada({ pessoa: V[11]!.nome, unidade: proxima(), meio: 'excecao_porteiro', tipoVisita: 'visita',
    justificativa: 'Interfone da unidade em manutenção; o morador avisou a portaria pessoalmente pela manhã.' });
  entrada({ pessoa: P[0]!.nome, area: 'Piscina', meio: 'autorizacao_previa', autorizacao: 'A3' });
  const u14 = proxima();
  entrada({ pessoa: P[1]!.nome, unidade: u14, meio: 'interfone', autorizador: titular(u14), tipoVisita: 'servico' });
  entrada({ pessoa: null, meio: 'escala' });
  const comCarro = boas.slice(cursor).find((c) => veiculos.some((v) => v.unidade === c))!;
  cursor = boas.indexOf(comCarro) + 1;
  const carro = veiculos.find((v) => v.unidade === comCarro)!;
  entrada({ pessoa: carro.dono, unidade: comCarro, veiculo: { placa: carro.placa, modelo: carro.modelo, cor: carro.cor } });
  for (let k = 0; k < 2; k++) {
    const u = proxima();
    entrada({ pessoa: titular(u), unidade: u });
  }
  eventos.push({ tipo: 'negado', chave: 'N1', pessoa: V[12]!.nome, unidade: uR1, meio: 'interfone', autorizador: titular(uR1) });
  const uRec = proxima();
  eventos.push({ tipo: 'recusado', chave: 'X1', pessoa: V[13]!.nome, unidade: uRec, meio: 'interfone', morador: titular(uRec) });
  const saidas = r.embaralhar(eventos.filter((e) => e.tipo === 'entrada').map((e) => e.chave));

  const encomendas: EncomendaGerada[] = [];
  for (let k = 0; k < 8; k++) {
    const u = proxima();
    const adultos = adultosDa.get(u)!;
    encomendas.push({
      rastreio: `ZQ${String(r.inteiro(10_000_000, 99_999_999))}${k}BR`, transportadora: r.escolher(TRANSPORTADORAS), unidade: u,
      destinatario: adultos[0]!.nome, ...(k < 5 ? { entregarPara: adultos[k % adultos.length]!.nome } : {}),
    });
  }

  const ocorrencias: OcorrenciaGerada[] = [
    { tipo: 'outro', status: 'encerrada', descricao: 'Lâmpada queimada no hall do bloco C; zeladoria acionada e troca feita no mesmo dia.' },
    { tipo: 'dano', status: 'em_andamento', descricao: 'Portão da garagem não fecha por completo; empresa de manutenção acionada.' },
    { tipo: 'encomenda', status: 'aberta', unidade: encomendas[6]!.unidade,
      descricao: `Caixa recebida para a ${encomendas[6]!.unidade} com a embalagem rasgada; morador avisado pelo interfone.` },
    { tipo: 'tentativa_acesso_indevido', status: 'aberta', unidade: uR1, vincularNegado: 'N1',
      descricao: `Pessoa com restrição tentou entrar na ${uR1}; a entrada foi negada pelo sistema e o morador foi avisado.` },
  ];

  return { semente, unidades, moradores, veiculos, funcionarios, externos, autorizacoes, restricoes, eventos, saidas, encomendas, ocorrencias };
}

export interface Contagens {
  unidades: number; unidadesOcupadas: number; unidadesVazias: number; unidadesAlugadas: number;
  moradores: number; adultos: number; menores: number; vinculosLegadoFinal: number; vinculosAprovadosFinal: number;
  porTipo: Record<TipoVinculo, number>; veiculos: number; funcionarios: number; visitantes: number; prestadores: number;
  autorizacoes: number; restricoes: number;
  eventos: { entradas: number; saidas: number; negados: number; recusas: number; total: number };
  encomendas: { recebidas: number; entregues: number }; ocorrencias: number; mudancasDeStatus: number;
}

const PASSOS_STATUS = { aberta: 0, em_andamento: 1, encerrada: 2 } as const;

export function contar(c: Conjunto): Contagens {
  const n = (p: (m: MoradorGerado) => boolean) => c.moradores.filter(p).length;
  const entradas = c.eventos.filter((e) => e.tipo === 'entrada').length;
  const negados = c.eventos.filter((e) => e.tipo === 'negado').length;
  const recusas = c.eventos.filter((e) => e.tipo === 'recusado').length;
  return {
    unidades: c.unidades.length,
    unidadesOcupadas: c.unidades.filter((u) => u.situacao !== 'vazia').length,
    unidadesVazias: c.unidades.filter((u) => u.situacao === 'vazia').length,
    unidadesAlugadas: c.unidades.filter((u) => u.situacao === 'alugada').length,
    moradores: c.moradores.length, adultos: n((m) => !m.menor), menores: n((m) => m.menor),
    vinculosLegadoFinal: n((m) => !m.regularizar), vinculosAprovadosFinal: n((m) => m.regularizar),
    porTipo: { proprietario: n((m) => m.tipo === 'proprietario'), inquilino: n((m) => m.tipo === 'inquilino'), dependente: n((m) => m.tipo === 'dependente') },
    veiculos: c.veiculos.length, funcionarios: c.funcionarios.length,
    visitantes: c.externos.filter((e) => e.categoria === 'visitante').length,
    prestadores: c.externos.filter((e) => e.categoria === 'prestador').length,
    autorizacoes: c.autorizacoes.length, restricoes: c.restricoes.length,
    eventos: { entradas, saidas: c.saidas.length, negados, recusas, total: entradas + c.saidas.length + negados + recusas },
    encomendas: { recebidas: c.encomendas.length, entregues: c.encomendas.filter((e) => e.entregarPara).length },
    ocorrencias: c.ocorrencias.length,
    mudancasDeStatus: c.ocorrencias.reduce((s, o) => s + PASSOS_STATUS[o.status], 0),
  };
}

