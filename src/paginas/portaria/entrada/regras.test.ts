import { describe, expect, it } from 'vitest'
import type { AutorizacaoView, PessoaBusca } from '@/api'
import { MIN_JUSTIFICATIVA } from '@/domain/rules'
import { listarFaltas, textoAutorizadoPor } from './regras'

const pessoa = { id: 'p1', nome: 'Ana', categoria: 'visitante' } as PessoaBusca

const base = {
  pessoa,
  propriaUnidade: false,
  emArea: false,
  areaAtual: null,
  unidadeAtual: 'u1',
  carregandoUnidade: false,
  meio: null,
  residenteId: null,
  justificativa: '',
  retroativo: false,
  horaReal: '',
  retroValido: true,
  formulario: '',
  veiculoOk: true,
  pronto: false,
  enviando: false,
  restricao: null,
} satisfies Parameters<typeof listarFaltas>[0]

describe('listarFaltas', () => {
  it('sem pessoa, só falta a pessoa', () => {
    expect(listarFaltas({ ...base, pessoa: null })).toEqual(['pessoa'])
  })

  it('pessoa e unidade escolhidas, falta quem autorizou', () => {
    expect(listarFaltas(base)).toEqual(['quem autorizou'])
  })

  it('morador na própria unidade pede outra unidade', () => {
    expect(listarFaltas({ ...base, propriaUnidade: true, meio: 'interfone' })).toContain(
      'outra unidade de destino (morador não registra entrada na própria)',
    )
  })

  it('meio com morador sem morador escolhido', () => {
    expect(listarFaltas({ ...base, meio: 'interfone' })).toEqual(['morador que autorizou'])
  })

  it('exceção do porteiro: justificativa no limite (valor limite)', () => {
    const curta = 'x'.repeat(MIN_JUSTIFICATIVA - 1)
    const certa = 'x'.repeat(MIN_JUSTIFICATIVA)
    const e = { ...base, meio: 'excecao_porteiro' as const, pronto: true }
    expect(listarFaltas({ ...e, justificativa: curta })).toEqual([
      `justificativa (mín. ${MIN_JUSTIFICATIVA} caracteres)`,
    ])
    expect(listarFaltas({ ...e, justificativa: certa })).toEqual([])
  })

  it('retroativo exige hora real, hora anterior a agora e número do formulário', () => {
    const r = {
      ...base,
      meio: 'excecao_porteiro' as const,
      justificativa: 'x'.repeat(20),
      retroativo: true,
    }
    expect(listarFaltas(r)).toEqual(['hora real do acesso', 'nº do formulário de papel'])
    expect(listarFaltas({ ...r, horaReal: '10:00', retroValido: false, formulario: '1' })).toEqual([
      'hora real anterior ao momento atual',
    ])
  })

  it('veículo sem placa válida', () => {
    expect(
      listarFaltas({
        ...base,
        meio: 'excecao_porteiro',
        justificativa: 'x'.repeat(20),
        veiculoOk: false,
      }),
    ).toEqual(['placa do veículo (padrão antigo ou Mercosul), ou marque “A pé”'])
  })

  it('tudo certo mas não pronto: regra de autorização não passou', () => {
    const e = { ...base, meio: 'escala' as const }
    expect(listarFaltas(e)).toEqual(['autorização válida para este momento'])
    expect(listarFaltas({ ...e, pronto: true })).toEqual([])
  })
})

describe('textoAutorizadoPor', () => {
  const previa = (extra: Partial<AutorizacaoView>) =>
    ({ cadastradaPorNome: 'Adm', solicitadaPorNome: 'Moradora', ...extra }) as AutorizacaoView
  const args = { nomeUsuario: 'Paulo', previaValida: undefined, residente: undefined }

  it('sem meio, traço', () => {
    expect(textoAutorizadoPor({ ...args, meio: null })).toBe('—')
  })

  it('exceção e escala', () => {
    expect(textoAutorizadoPor({ ...args, meio: 'excecao_porteiro' })).toBe(
      'Paulo (exceção do porteiro)',
    )
    expect(textoAutorizadoPor({ ...args, meio: 'escala' })).toBe('Escala do condomínio')
  })

  it('meio com morador usa o nome do morador', () => {
    expect(textoAutorizadoPor({ ...args, meio: 'celular', residente: 'Marta' })).toBe('Marta')
    expect(textoAutorizadoPor({ ...args, meio: 'celular' })).toBe('—')
  })

  it('autorização prévia: solicitante, sem solicitante e área comum', () => {
    const t = (p: AutorizacaoView) =>
      textoAutorizadoPor({ ...args, meio: 'autorizacao_previa', previaValida: p })
    expect(t(previa({}))).toBe('Moradora')
    expect(t(previa({ semSolicitante: true }))).toBe('Sem solicitante — cadastrada por Adm')
    expect(t(previa({ areaComumId: 'a1' }))).toBe('Área comum — cadastrada por Adm')
    expect(textoAutorizadoPor({ ...args, meio: 'autorizacao_previa' })).toBe('—')
  })
})
