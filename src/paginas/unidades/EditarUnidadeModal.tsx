import { useState, type FormEvent } from 'react'
import { Alert } from '@/componentes/Alert'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { codigoUnidade } from '@/domain/units'
import { mensagemErro } from '@/app/useAsync'
import { useCatalogo } from '@/app/catalogo'
import { useAcoesUnidade } from './useUnidades'
import { rodapeForm } from './formUtils'

export const UnidadeTitulo = ({ unidade }: { unidade: string }) => {
  const { codigo } = useCatalogo()
  return <div className="font-mono text-[22px] font-semibold text-[#0B3F49]">{codigo(unidade)}</div>
}

export /**
 * RF-01: cadastra unidade (exceção à estrutura inicial) ou corrige bloco/número de unidade ainda sem registros (a API
 * recusa a referenciada com 422). Bloco em maiúsculas (letras e dígitos); a API normaliza o número ("3" -> "03").
 */
function EditarUnidadeModal({
  id,
  bloco,
  numero,
  onClose,
  onFeito,
}: {
  id: string | null
  bloco?: string
  numero?: string
  onClose: () => void
  onFeito: (codigo: string, id: string) => void | Promise<void>
}) {
  const acoes = useAcoesUnidade()
  const { agrupamento } = useCatalogo()
  const [b, setB] = useState(bloco ?? '')
  const [n, setN] = useState(numero ?? '')
  const [erro, setErro] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault()
    try {
      // mutateAsync resolve depois da invalidação (onSuccess): o catálogo já conhece a unidade quando a tela navega
      const u = id
        ? await acoes.editar.mutateAsync({ id, bloco: b, numero: n.trim() })
        : await acoes.criar.mutateAsync({ bloco: b, numero: n.trim() })
      await onFeito(codigoUnidade(u), u.id)
    } catch (err) {
      setErro(mensagemErro(err))
    }
  }
  return (
    <Modal
      titulo={id ? 'Editar número da unidade' : 'Nova unidade'}
      onClose={onClose}
      tamanho="p"
      rodape={rodapeForm(onClose, 'f-un', id ? 'Salvar' : 'Cadastrar unidade')}
    >
      <form id="f-un" onSubmit={salvar} className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={agrupamento}>
            <input
              data-autofocus
              className="input font-mono uppercase"
              autoComplete="off"
              value={b}
              onChange={(e) =>
                setB(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 3),
                )
              }
            />
          </Field>
          <Field label="Apartamento">
            <input
              className="input font-mono"
              inputMode="numeric"
              value={n}
              onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
        </div>
        {id && (
          <Alert tom="neutro">
            Só é possível alterar o número de unidade sem vínculos, acessos ou encomendas. Com
            histórico, desative-a e cadastre a correta.
          </Alert>
        )}
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
