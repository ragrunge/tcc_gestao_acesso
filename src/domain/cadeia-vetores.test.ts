// Vetores de ouro da cadeia de hash (desenho §3.4, item 5): eventos serializados pelo hashChain.ts (o verificador
// independente) com canônico e hash fixados em cadeia-vetores.json. Os valores vieram do banco (evento_acesso_canonico
// + sha256, migrações 0001/0013) quando o pgTAP ainda rodava; hoje guardam o formato contra mudança acidental no TS.
// Mudança DELIBERADA da serialização exige nova migração e: ATUALIZAR_VETORES=1 npx vitest run src/domain/cadeia-vetores.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calcularHash, jsonCanonico, paraExportado } from '@/domain/hashChain'
import type { EventoAcesso } from '@/domain/types'

const ARQUIVO = resolve(__dirname, 'cadeia-vetores.json')
const H0 = 'a'.repeat(64)

const base: EventoAcesso = {
  id: '11111111-1111-4111-8111-111111111111',
  seq: 1,
  formatoHash: 1,
  tipo: 'entrada',
  categoriaPessoa: 'visitante',
  pessoaId: '22222222-2222-4222-8222-222222222222',
  unidadeDestinoId: '33333333-3333-4333-8333-333333333333',
  areaComumId: null,
  pontoAcessoId: '44444444-4444-4444-8444-444444444444',
  autorizadoPorTipo: 'interfone',
  autorizadoPorPessoaId: '55555555-5555-4555-8555-555555555555',
  autorizacaoPreviaId: null,
  justificativa: null,
  restricaoId: null,
  operadorId: '66666666-6666-4666-8666-666666666666',
  operadorPapel: 'porteiro',
  ocorridoEm: Date.UTC(2026, 9, 31, 13, 4, 5, 7),
  registradoEm: Date.UTC(2026, 9, 31, 13, 4, 5, 7),
  retroativo: false,
  refereEventoId: null,
  corrigeEventoId: null,
  observacao: null,
  formularioContingencia: null,
  correcaoValores: null,
  empresa: null,
  servico: null,
  veiculoPlaca: null,
  veiculoModelo: null,
  veiculoCor: null,
  hashAnterior: H0,
  hash: '',
}

/** Casos que cobrem cada ramo da serialização: v1, v2, texto com escapes e Unicode, correção (ordem das chaves), saída retroativa, negado. */
export const VETORES: { nome: string; e: EventoAcesso }[] = [
  { nome: 'entrada v1 por interfone', e: base },
  {
    nome: 'entrada v2 com veículo (placa, modelo e cor no fim)',
    e: {
      ...base,
      seq: 2,
      id: '11111111-1111-4111-8111-111111111112',
      formatoHash: 2,
      veiculoPlaca: 'ABC1D23',
      veiculoModelo: 'Onix',
      veiculoCor: null,
    },
  },
  {
    nome: 'v2 de prestador com empresa e serviço',
    e: {
      ...base,
      seq: 3,
      id: '11111111-1111-4111-8111-111111111113',
      formatoHash: 2,
      categoriaPessoa: 'prestador',
      empresa: 'Eletro "Serviços" Ltda',
      servico: 'Eletricista',
      veiculoPlaca: 'QWE1234',
      veiculoModelo: 'Strada',
      veiculoCor: 'Branca',
    },
  },
  {
    nome: 'exceção com justificativa, aspas, barra, quebra de linha, tab e acento',
    e: {
      ...base,
      seq: 4,
      id: '11111111-1111-4111-8111-111111111114',
      autorizadoPorTipo: 'excecao_porteiro',
      autorizadoPorPessoaId: null,
      justificativa: 'Morador "ausente" \\ ligou\nde novo\tà tarde — ok',
      observacao: 'Ünicode: ção, ñ, 日本',
    },
  },
  {
    nome: 'saída retroativa com formulário',
    e: {
      ...base,
      seq: 5,
      id: '11111111-1111-4111-8111-111111111115',
      tipo: 'saida',
      autorizadoPorTipo: null,
      autorizadoPorPessoaId: null,
      retroativo: true,
      formularioContingencia: 'F-0042',
      ocorridoEm: Date.UTC(2026, 9, 30, 22, 0, 0, 0),
      registradoEm: Date.UTC(2026, 9, 31, 13, 4, 5, 999),
      refereEventoId: '11111111-1111-4111-8111-111111111111',
    },
  },
  {
    nome: 'correção com valores (ordem canônica das chaves)',
    e: {
      ...base,
      seq: 6,
      id: '11111111-1111-4111-8111-111111111116',
      tipo: 'correcao',
      autorizadoPorTipo: null,
      autorizadoPorPessoaId: null,
      justificativa: 'Unidade registrada errada no dia',
      corrigeEventoId: '11111111-1111-4111-8111-111111111111',
      correcaoValores: {
        autorizadoPorPessoaId: null,
        pessoaId: '77777777-7777-4777-8777-777777777777',
        ocorridoEm: Date.UTC(2026, 9, 31, 12, 0, 0, 1),
        unidadeDestinoId: '88888888-8888-4888-8888-888888888888',
      },
    },
  },
  {
    nome: 'negado por restrição',
    e: {
      ...base,
      seq: 7,
      id: '11111111-1111-4111-8111-111111111117',
      tipo: 'negado',
      autorizadoPorTipo: null,
      autorizadoPorPessoaId: null,
      restricaoId: '99999999-9999-4999-8999-999999999999',
      operadorPapel: 'sindico',
    },
  },
]

/** Linha do banco (snake_case) para jsonb_populate_record: só os campos de evento_acesso. */
async function calculados() {
  const saida: Record<string, { canonico: string; hash: string }> = {}
  for (const { nome, e } of VETORES)
    saida[nome] = { canonico: jsonCanonico(paraExportado(e)), hash: await calcularHash(e) }
  return saida
}

describe('cadeia de hash: vetores de ouro TS == SQL', () => {
  it('canônico e hash de cada vetor batem com o arquivo de referência', async () => {
    const atual = await calculados()
    if (process.env.ATUALIZAR_VETORES === '1')
      writeFileSync(ARQUIVO, JSON.stringify(atual, null, 2) + '\n')
    expect(JSON.parse(readFileSync(ARQUIVO, 'utf8'))).toEqual(atual)
  })

  it('os vetores cobrem v1, v2, correção, saída retroativa e negado', () => {
    const tipos = new Set(VETORES.map((v) => `${v.e.tipo}/${v.e.formatoHash}`))
    for (const t of ['entrada/1', 'entrada/2', 'saida/1', 'correcao/1', 'negado/1'])
      expect(tipos.has(t)).toBe(true)
  })
})
