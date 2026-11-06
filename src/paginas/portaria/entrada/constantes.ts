import {
  ROTULO_CATEGORIA,
  type CategoriaPessoa,
  type MeioAutorizacao,
  type TipoVisita,
} from '@/domain/types'
import type { PessoaBusca } from '@/api'

export const SUGESTOES_EXCECAO = [
  'Morador não atende o interfone',
  'Emergência médica',
  'Serviço público (luz, água, gás)',
]

export const NP_VAZIA = {
  nome: '',
  documento: '',
  telefone: '',
  semCpf: false,
  categoria: 'visitante' as CategoriaPessoa,
  empresa: '',
  servico: '',
  tipoVisita: 'visita' as TipoVisita,
}

export const TIPOS_CADASTRO_RAPIDO: {
  valor: TipoVisita
  rotulo: string
  categoria: CategoriaPessoa
}[] = [
  { valor: 'visita', rotulo: 'Visitante', categoria: 'visitante' },
  { valor: 'entrega', rotulo: 'Entregador', categoria: 'visitante' },
  { valor: 'transporte_app', rotulo: 'Motorista de app', categoria: 'visitante' },
  { valor: 'servico', rotulo: 'Prestador de serviço', categoria: 'prestador' },
]

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const LIMITE_SUGESTOES = 8

export const MEIOS_VISIVEIS: MeioAutorizacao[] = [
  'interfone',
  'celular',
  'morador_presente',
  'autorizacao_previa',
  'excecao_porteiro',
  'escala',
]

export const fmtPrazo = (min: number) => (min >= 60 ? `${min / 60} h` : `${min} min`)

/** Quem tem vínculo válido aparece na busca com o rótulo "Morador da D-32" (pode visitar outra unidade). */
export const rotuloPessoa = (p: PessoaBusca) =>
  p.unidadesVinculadasCodigos.length > 0
    ? `Morador da ${p.unidadesVinculadasCodigos[0]}${p.unidadesVinculadasCodigos.length > 1 ? ` +${p.unidadesVinculadasCodigos.length - 1}` : ''}`
    : ROTULO_CATEGORIA[p.categoria]

export function rotulosMeio(emArea: boolean): Record<MeioAutorizacao, [string, string]> {
  return {
    interfone: ['Interfone', 'Morador confirma pelo interfone'],
    celular: ['Celular', 'Morador confirma por WhatsApp ou ligação'],
    morador_presente: ['Morador presente', 'Morador está na portaria'],
    autorizacao_previa: [
      'Autorização prévia',
      emArea ? 'Cadastrada pela administração' : 'Cadastrada antes pelo morador',
    ],
    excecao_porteiro: ['Exceção do porteiro', 'Sem morador; exige justificativa'],
    escala: ['Escala', 'Funcionário em horário de escala'],
  }
}
