// Solicitação de vínculo com unidade (RF-03/RF-04), compartilhada pelos dois pontos de entrada:
// - tela da unidade ("Incluir morador" / "Solicitar vínculo"): a unidade é fixa e a pessoa vem do PessoaCombobox;
// - ficha da pessoa ("Vincular a uma unidade"): a pessoa é fixa e a unidade vem de Bloco/Torre -> Apartamento.
// Os dois chamam a MESMA rota (POST /vinculos, `api.vinculos.criar`) com os mesmos campos: pessoa, unidade, tipo e
// vigência. O vínculo nasce PENDENTE; a conferência do comprovante (RF-05, sem guardar arquivo) e a aprovação são
// passos separados, na tela de Vínculos, por síndico/administração (RN-03). A categoria só vira "morador" na aprovação.
// A validação daqui espelha a da API (vinculos.service `criar` + índice vinculo_ativo_uq) só para avisar antes; quem
// decide é a API, e o erro dela (409/422) aparece pelo `mensagemErro`.
import type { ReactNode } from 'react'
import type { Pessoa, Unidade, VinculoUnidade } from '@/domain/types'
import { codigoUnidade } from '@/domain/units'
import type { PessoaBusca, VinculoView } from '@/api'
import { Modal } from '@/componentes/Modal'
import { Button } from '@/componentes/ui/button'
import { FormNovoVinculo } from './FormNovoVinculo'
import { RevisaoNovoVinculo } from './RevisaoNovoVinculo'
import { useNovoVinculo } from './useNovoVinculo'

export {
  STATUS_QUE_BLOQUEIAM,
  vinculoQueBloqueia,
  motivoConflito,
  validarNovoVinculo,
  type RascunhoVinculo,
  type ErrosVinculo,
} from './regras'
export { UnidadeSeletor } from './UnidadeSeletor'

export interface NovoVinculoProps {
  /** "Incluir morador", "Solicitar vínculo" ou "Vincular a uma unidade". */
  titulo: string
  /** Ficha: a pessoa já está escolhida. */
  pessoaFixa?: Pessoa
  /** Tela da unidade: a unidade já está escolhida (a do detalhe, mesmo que o catálogo ainda não a tenha). */
  unidadeFixa?: Pick<Unidade, 'id' | 'bloco' | 'numero' | 'ativo'>
  /** Vínculos já conhecidos da tela (os da unidade ou os da pessoa): marcam o que duplicaria. */
  vinculosConhecidos?: readonly VinculoView[] | null
  /** Oferece "Cadastrar nova pessoa" no seletor: devolve o formulário de cadastro que fica no lugar deste. */
  cadastro?: (a: {
    texto: string
    onEscolhida: (p: PessoaBusca) => void
    onVoltar: () => void
  }) => ReactNode
  onClose: () => void
  onFeito: (v: VinculoUnidade, resumo: string) => void
}

/** Formulário -> revisão -> envio. Um modal só (dois empilhados quebrariam o foco); o cadastro de pessoa entra no lugar. */
export function NovoVinculoModal({
  titulo,
  pessoaFixa,
  unidadeFixa,
  vinculosConhecidos,
  cadastro,
  onClose,
  onFeito,
}: NovoVinculoProps) {
  const s = useNovoVinculo({ pessoaFixa, unidadeFixa, vinculosConhecidos, onFeito })

  if (s.cadastrando !== null && cadastro) {
    return (
      <>
        {cadastro({
          texto: s.cadastrando,
          onVoltar: () => s.setCadastrando(null),
          onEscolhida: (p) => {
            s.setPessoaBusca(p)
            s.setCadastrando(null)
            s.setErros({})
          },
        })}
      </>
    )
  }

  const rodape =
    s.passo === 'form' ? (
      <>
        <Button type="submit" form="f-novo-vinculo" variant="default" size="lg" className="flex-1">
          Revisar vínculo
        </Button>
        <Button size="lg" onClick={onClose}>
          Cancelar
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="default"
          size="lg"
          className="flex-1"
          loading={s.enviando}
          onClick={() => void s.confirmar()}
        >
          Confirmar vínculo
        </Button>
        <Button
          size="lg"
          disabled={s.enviando}
          onClick={() => {
            s.setPasso('form')
            s.setErroApi('')
          }}
        >
          Voltar e corrigir
        </Button>
      </>
    )

  return (
    <Modal titulo={titulo} onClose={onClose} rodape={rodape}>
      {unidadeFixa && (
        <div className="font-mono text-[22px] font-semibold text-[#0B3F49]">
          {codigoUnidade(unidadeFixa)}
        </div>
      )}
      {s.passo === 'form' ? (
        <FormNovoVinculo
          s={s}
          pessoaFixa={pessoaFixa}
          unidadeFixa={unidadeFixa}
          vinculosConhecidos={vinculosConhecidos}
          podeCadastrar={!!cadastro}
        />
      ) : (
        <RevisaoNovoVinculo s={s} />
      )}
    </Modal>
  )
}
