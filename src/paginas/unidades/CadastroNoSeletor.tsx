import { useApi, type PessoaBusca } from '@/api'
import type { CategoriaPessoa } from '@/domain/types'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { NovaPessoaForm, ID_FORM_PESSOA, prefillDoTermo } from '@/paginas/cadastro/NovaPessoaForm'
import { UnidadeTitulo } from './EditarUnidadeModal'
import { paraSeletor } from './formUtils'

export /**
 * Cadastro de pessoa no lugar do formulário de quem tem um seletor (mesma janela: dois modais empilhados quebrariam o
 * foco). CPF já cadastrado: "Usar o cadastro existente" (ou "Reativar e usar…") escolhe essa pessoa no seletor.
 */
function CadastroNoSeletor({
  unidade,
  texto,
  aviso,
  categoriaInicial,
  onEscolhida,
  onVoltar,
}: {
  unidade: string
  texto: string
  aviso: string
  categoriaInicial?: CategoriaPessoa
  onEscolhida: (p: PessoaBusca) => void
  onVoltar: () => void
}) {
  const api = useApi()
  return (
    <Modal
      titulo="Nova pessoa"
      onClose={onVoltar}
      rodape={
        <>
          <Button type="submit" form={ID_FORM_PESSOA} variante="primario" grande className="flex-1">
            Cadastrar e escolher
          </Button>
          <Button grande onClick={onVoltar}>
            Voltar
          </Button>
        </>
      }
    >
      <UnidadeTitulo unidade={unidade} />
      <NovaPessoaForm
        nomeInicial={prefillDoTermo(texto).nome}
        documentoInicial={prefillDoTermo(texto).documento}
        aviso={aviso}
        categoriaInicial={categoriaInicial}
        onFeito={(p) => onEscolhida(paraSeletor(p))}
        onExistente={async (id) => onEscolhida(paraSeletor((await api.pessoas.ficha(id)).pessoa))}
      />
    </Modal>
  )
}
