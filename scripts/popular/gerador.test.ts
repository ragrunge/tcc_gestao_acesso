// Gerador e validador do conjunto fictício, sem rede e sem Docker. As regras locais do validador são
// conferidas contra as de src/domain/rules.ts (que o Node puro não importa) para não divergirem.
import { cpfValido, escalaVigente, justificativaValida as justificativaDomain, temNumeroDePessoa as numeroDomain, validarEscala as escalaDomain } from '@domain/rules';
import { normalizarPlaca } from '@domain/cpf';
import { brt, partes } from '@domain/time';
import { codigoUnidade, gerarUnidades } from '@domain/units';
import { criarAleatorio } from './aleatorio';
import { contar, cpfComDigitoValido, formatarCpf, formatarTelefone, gerarConjunto, semAcento, SEMENTE_PADRAO, type Conjunto } from './gerador';
import { escalaVigenteNoMinuto, justificativaValida, temNumeroDePessoa, validarConjunto, validarEscala } from './validar';

const c = gerarConjunto();
const copia = (x: Conjunto): Conjunto => structuredClone(x);
const pessoasComCpf = () => [...c.moradores.filter((m) => m.cpf), ...c.funcionarios, ...c.externos].map((p) => p.cpf!);

describe('gerador', () => {
  it('é determinístico: a mesma semente gera o mesmo conjunto, outra semente gera outro', () => {
    expect(gerarConjunto(SEMENTE_PADRAO)).toEqual(c);
    expect(JSON.stringify(gerarConjunto(SEMENTE_PADRAO))).toBe(JSON.stringify(c));
    expect(gerarConjunto(SEMENTE_PADRAO + 1).moradores.map((m) => m.nome)).not.toEqual(c.moradores.map((m) => m.nome));
  });

  it('contagens declaradas da semente padrão', () => {
    expect(contar(c)).toEqual({
      unidades: 165, unidadesOcupadas: 157, unidadesVazias: 8, unidadesAlugadas: 44,
      moradores: 543, adultos: 406, menores: 137, vinculosLegadoFinal: 44, vinculosAprovadosFinal: 499,
      porTipo: { proprietario: 164, inquilino: 63, dependente: 316 }, veiculos: 175, funcionarios: 6, visitantes: 18, prestadores: 6,
      autorizacoes: 8, restricoes: 3, eventos: { entradas: 18, saidas: 18, negados: 1, recusas: 1, total: 38 },
      encomendas: { recebidas: 8, entregues: 5 }, ocorrencias: 4, mudancasDeStatus: 3,
    });
  });

  it('165 unidades, iguais às do domain: 6 blocos com 18 e G, H e I com 19', () => {
    expect(c.unidades.map((u) => u.codigo)).toEqual(gerarUnidades().map(codigoUnidade));
    const porBloco = c.unidades.reduce<Record<string, number>>((s, u) => ({ ...s, [u.bloco]: (s[u.bloco] ?? 0) + 1 }), {});
    expect(porBloco).toEqual({ A: 18, B: 18, C: 18, D: 18, E: 18, F: 18, G: 19, H: 19, I: 19 });
  });

  it('500 a 600 moradores, distribuídos de forma desigual, com apartamentos vazios', () => {
    const k = contar(c);
    expect(k.moradores).toBeGreaterThanOrEqual(500);
    expect(k.moradores).toBeLessThanOrEqual(600);
    const porUnidade = c.unidades.map((u) => c.moradores.filter((m) => m.unidade === u.codigo).length);
    expect(new Set(porUnidade).size).toBeGreaterThanOrEqual(5);
    expect(porUnidade.filter((n) => n === 0)).toHaveLength(8);
    expect(Math.max(...porUnidade)).toBeLessThanOrEqual(6);
  });

  it('CPF com dígito válido (regra do domain) e sem repetição; menor sem CPF e sem telefone', () => {
    const cpfs = pessoasComCpf();
    expect(cpfs.length).toBe(406 + 6 + 24);
    expect(cpfs.every((d) => cpfValido(d))).toBe(true);
    expect(new Set(cpfs).size).toBe(cpfs.length);
    expect(c.moradores.filter((m) => m.menor).every((m) => m.cpf === null && m.telefone === null && m.tipo === 'dependente')).toBe(true);
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });

  it('telefones no padrão (11) 9xxxx-xxxx', () => {
    const tels = [...c.moradores.filter((m) => !m.menor).map((m) => m.telefone!), ...c.funcionarios.map((f) => f.telefone), ...c.externos.map((e) => e.telefone)];
    expect(tels.map(formatarTelefone).every((t) => /^\(11\) 9\d{4}-\d{4}$/.test(t))).toBe(true);
    expect(new Set(tels).size).toBe(tels.length);
  });

  it('175 veículos, placas válidas (antiga e Mercosul) e únicas, de moradores da própria unidade', () => {
    expect(c.veiculos.length).toBe(175);
    const porUnidade = c.unidades.filter((u) => u.situacao !== 'vazia').map((u) => c.veiculos.filter((v) => v.unidade === u.codigo).length);
    expect(porUnidade.filter((n) => n === 0).length).toBe(25);
    expect(Math.max(...porUnidade)).toBe(2);
    expect(c.veiculos.every((v) => normalizarPlaca(v.placa) === v.placa)).toBe(true);
    expect(new Set(c.veiculos.map((v) => v.placa)).size).toBe(c.veiculos.length);
    expect(c.veiculos.some((v) => /^[A-Z]{3}\d{4}$/.test(v.placa))).toBe(true);
    expect(c.veiculos.some((v) => /^[A-Z]{3}\d[A-Z]\d{2}$/.test(v.placa))).toBe(true);
    expect(c.veiculos.every((v) => c.moradores.some((m) => m.nome === v.dono && m.unidade === v.unidade && !m.menor))).toBe(true);
  });

  it('nomes únicos (sem acento) e famílias com o sobrenome do titular', () => {
    const todos = [...c.moradores, ...c.funcionarios, ...c.externos].map((p) => semAcento(p.nome));
    expect(new Set(todos).size).toBe(todos.length);
    const ocupadas = c.unidades.filter((u) => u.situacao !== 'vazia');
    const compartilham = ocupadas.filter((u) => {
      const casa = c.moradores.filter((m) => m.unidade === u.codigo);
      const familia = casa[0]!.nome.split(' ').at(-1);
      return casa.length > 1 && casa.filter((m) => m.nome.endsWith(` ${familia}`)).length >= casa.length - 1;
    });
    expect(compartilham.length).toBeGreaterThan(ocupadas.filter((u) => c.moradores.filter((m) => m.unidade === u.codigo).length > 1).length * 0.9);
  });

  it('tipos de vínculo coerentes: inquilino só em unidade alugada, com comprovante de locação e fim de vigência quando regularizado', () => {
    const situacao = new Map(c.unidades.map((u) => [u.codigo, u.situacao]));
    for (const m of c.moradores) {
      if (m.tipo === 'inquilino') {
        expect(situacao.get(m.unidade)).toBe('alugada');
        expect(m.comprovante.tipo).toBe('contrato_locacao');
        if (m.regularizar) expect(m.vigenciaFimDias).toBeGreaterThan(0);
      }
      if (m.tipo === 'proprietario') expect(situacao.get(m.unidade)).toBe('propria');
    }
  });

  it('funcionários com escala válida e porteiros cobrindo as 24 horas dos 7 dias (regra do domain)', () => {
    for (const f of c.funcionarios) expect(escalaDomain(f.escala)).toBeNull();
    const porteiros = c.funcionarios.filter((f) => f.porteiro).map((f) => ({ pessoaId: f.nome, funcao: f.funcao, escala: f.escala, ativo: true }));
    const domingo = brt(2026, 11, 1);
    expect(partes(domingo).dow).toBe(0);
    for (let m = 0; m < 7 * 24 * 60; m++) {
      const t = domingo + m * 60_000;
      if (!porteiros.some((f) => escalaVigente(f, t))) throw new Error(`sem porteiro em ${new Date(t).toISOString()}`);
    }
  });
});

describe('validador', () => {
  it('o conjunto padrão passa', () => {
    expect(validarConjunto(c).problemas).toEqual([]);
  });

  it('acusa CPF repetido ou inválido, placa inválida ou repetida, unidade inexistente e nome repetido', () => {
    const x = copia(c);
    const adultos = x.moradores.filter((m) => !m.menor);
    adultos[1]!.cpf = adultos[0]!.cpf;
    adultos[2]!.cpf = `${adultos[2]!.cpf!.slice(0, 10)}${(Number(adultos[2]!.cpf![10]) + 1) % 10}`;
    x.veiculos[0]!.placa = 'AB12345';
    x.veiculos[2]!.placa = x.veiculos[1]!.placa;
    adultos[3]!.unidade = 'Z-99';
    x.externos[1]!.nome = x.externos[0]!.nome;
    const p = validarConjunto(x).problemas.join('\n');
    expect(p).toMatch(/CPF repetido/);
    expect(p).toMatch(/CPF com dígito inválido/);
    expect(p).toMatch(/AB12345: placa fora do padrão/);
    expect(p).toMatch(/placa repetida/);
    expect(p).toMatch(/unidade Z-99 não existe/);
    expect(p).toMatch(/nome repetido/);
  });

  it('acusa evento que o banco recusaria: autorizador sem vínculo, exceção sem justificativa, entrada dupla e restrito entrando', () => {
    const x = copia(c);
    const entradas = x.eventos.filter((e) => e.tipo === 'entrada');
    const interfone = entradas.find((e) => e.meio === 'interfone')!;
    interfone.autorizador = x.externos[0]!.nome;
    entradas.find((e) => e.meio === 'excecao_porteiro')!.justificativa = 'curta';
    entradas[1]!.pessoa = entradas[2]!.pessoa;
    entradas[3]!.pessoa = x.restricoes[0]!.pessoa;
    entradas[3]!.unidade = x.restricoes[0]!.unidade;
    const p = validarConjunto(x).problemas.join('\n');
    expect(p).toMatch(/autorizador sem vínculo válido/);
    expect(p).toMatch(/exceção exige justificativa/);
    expect(p).toMatch(/entraria duas vezes/);
    expect(p).toMatch(/restrição vigente no destino/);
  });

  it('acusa autorização sem solicitante nem justificativa, área comum para visitante e dado pessoal em texto livre', () => {
    const x = copia(c);
    const comSolicitante = x.autorizacoes.find((a) => a.solicitante)!;
    delete comSolicitante.solicitante;
    x.autorizacoes.find((a) => a.area)!.pessoa = x.externos.find((e) => e.categoria === 'visitante')!.nome;
    x.ocorrencias[0]!.descricao = 'Contato do morador: 11987654321';
    const p = validarConjunto(x).problemas.join('\n');
    expect(p).toMatch(/solicitante com vínculo na unidade ou justificativa/);
    expect(p).toMatch(/área comum só para prestador/);
    expect(p).toMatch(/número pessoal/);
  });

  it('acusa total de moradores fora de 500 a 600', () => {
    const x = copia(c);
    const ficar = new Set(x.unidades.slice(0, 100).map((u) => u.codigo));
    x.moradores = x.moradores.filter((m) => ficar.has(m.unidade));
    expect(validarConjunto(x).problemas.join('\n')).toMatch(/moradores \(esperado de 500 a 600\)/);
  });

  it('regras locais iguais às do domain (paridade)', () => {
    const r = criarAleatorio(7);
    for (let i = 0; i < 5000; i++) {
      const d = r.digitos(11);
      expect(cpfComDigitoValido(d)).toBe(cpfValido(d));
    }
    for (const d of pessoasComCpf()) {
      const errado = `${d.slice(0, 10)}${(Number(d[10]) + 1) % 10}`;
      expect([cpfComDigitoValido(d), cpfComDigitoValido(errado)]).toEqual([cpfValido(d), cpfValido(errado)]);
    }
    for (const d of ['00000000000', '11111111111', '52998224725', '5299822472', '529982247250']) expect(cpfComDigitoValido(d)).toBe(cpfValido(d));
    for (const t of ['', 'curta', '               x', ' quinze letras! ', 'Interfone da unidade em manutenção', 'cpf 123.456.789-09', 'tel 11 98765-4321', '12345678']) {
      expect(justificativaValida(t)).toBe(justificativaDomain(t));
      expect(temNumeroDePessoa(t)).toBe(numeroDomain(t));
    }
    const escalas = [...c.funcionarios.map((f) => f.escala), { diasSemana: [1, 1], horaInicio: '08:00', horaFim: '09:00' },
      { diasSemana: [], horaInicio: '08:00', horaFim: '09:00' }, { diasSemana: [7], horaInicio: '08:00', horaFim: '09:00' },
      { diasSemana: [1], horaInicio: '8:00', horaFim: '09:00' }, { diasSemana: [1], horaInicio: '09:00', horaFim: '09:00' }];
    for (const e of escalas) expect(validarEscala(e)).toBe(escalaDomain(e));
    const domingo = brt(2026, 11, 1);
    for (const e of c.funcionarios.map((f) => f.escala)) {
      for (let m = 0; m < 7 * 24 * 60; m += 7) {
        const t = domingo + m * 60_000;
        const p = partes(t);
        expect(escalaVigenteNoMinuto(e, p.dow, p.hh * 60 + p.mm)).toBe(escalaVigente({ pessoaId: 'x', funcao: 'x', escala: e, ativo: true }, t));
      }
    }
  });
});
