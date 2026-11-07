import { describe, expect, it } from 'vitest'
import { DICA_BUSCA_CPF, dicaBuscaCpf } from './cpf'

describe('dicaBuscaCpf', () => {
  it('não aparece até 5 dígitos (a busca casa pelo começo do CPF)', () => {
    expect(dicaBuscaCpf('86837')).toBeNull()
    expect(dicaBuscaCpf('868.37')).toBeNull()
    expect(dicaBuscaCpf('')).toBeNull()
  })

  it('aparece de 6 a 10 dígitos', () => {
    expect(dicaBuscaCpf('868373')).toBe(DICA_BUSCA_CPF)
    expect(dicaBuscaCpf('86837345')).toBe(DICA_BUSCA_CPF)
    expect(dicaBuscaCpf('8683734509')).toBe(DICA_BUSCA_CPF)
  })

  it('não aparece com os 11 dígitos (a busca vai pelo HMAC)', () => {
    expect(dicaBuscaCpf('86837345091')).toBeNull()
    expect(dicaBuscaCpf('868.373.450-91')).toBeNull()
  })

  it('ignora ponto, hífen e espaço ao contar (CPF formatado pela metade)', () => {
    expect(dicaBuscaCpf('868.373.45')).toBe(DICA_BUSCA_CPF)
    expect(dicaBuscaCpf(' 868 373 4 ')).toBe(DICA_BUSCA_CPF)
    expect(dicaBuscaCpf('868.373-')).toBe(DICA_BUSCA_CPF)
  })

  it('não aparece em texto misto, nome com número ou placa', () => {
    expect(dicaBuscaCpf('Maria 2')).toBeNull()
    expect(dicaBuscaCpf('João 868373')).toBeNull()
    expect(dicaBuscaCpf('abc1234567')).toBeNull()
    expect(dicaBuscaCpf('ABC-1234')).toBeNull()
    expect(dicaBuscaCpf('D-32')).toBeNull()
  })

  it('fica no limite de 80% de dígitos', () => {
    expect(dicaBuscaCpf('a12345678')).toBe(DICA_BUSCA_CPF) // 8 de 9
    expect(dicaBuscaCpf('ab123456')).toBeNull() // 6 de 8
  })

  it('não aparece na máscara colada (asterisco não conta como dígito)', () => {
    expect(dicaBuscaCpf('***.456.789-**')).toBeNull()
    expect(dicaBuscaCpf('123.45*.***-**')).toBeNull()
  })
})
