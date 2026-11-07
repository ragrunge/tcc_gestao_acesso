import { Link } from 'react-router-dom'
import { Alert } from '@/componentes/Alert'
import { mensagemErro } from '@/app/useAsync'
import { useFichaUnidade } from './useFichaUnidade'
import { CabecalhoUnidade } from './CabecalhoUnidade'
import { ModaisUnidade } from './ModaisUnidade'
import { SecaoMoradores } from './SecaoMoradores'
import { SecaoVeiculos } from './SecaoVeiculos'
import { SecaoPrevias } from './SecaoPrevias'
import { SecaoRestricoes } from './SecaoRestricoes'
import { SecaoEncomendas } from './SecaoEncomendas'
import { SecaoHistorico } from './SecaoHistorico'

/** Detalhe da unidade (coluna direita do mestre-detalhe de Unidades). `id`: uuid ou código "D-32". */
export function UnidadeDetalhe({ id }: { id: string }) {
  const f = useFichaUnidade(id)
  const { d, ativa, pode } = f

  if (f.erro)
    return (
      <Alert tom="vermelho" role="alert">
        {mensagemErro(f.erro)}{' '}
        <Link className="underline" to="/unidades">
          Voltar às unidades
        </Link>
      </Alert>
    )

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoUnidade f={f} />

      {d && (
        <>
          <SecaoMoradores
            vinculos={d.vinculos}
            podeIncluir={pode.vinculo && ativa}
            podeEncerrar={pode.encerrar}
            onIncluir={() => {
              f.setPendenteAviso(false)
              f.setModo('morador')
            }}
            onEncerrar={f.setEncerrando}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SecaoVeiculos
              veiculos={d.veiculos}
              podeEditar={pode.veiculo}
              onNovo={() => f.setModo('veiculo')}
              onEditar={f.setVeiculoEditado}
            />
            <SecaoPrevias
              autorizacoes={d.autorizacoes}
              podeRevogar={pode.previa}
              onRevogar={f.setRevogando}
            />
            <SecaoRestricoes
              restricoes={d.restricoes}
              podeRevogar={pode.revogar}
              onRevogar={(r) => void f.revogarRestricao(r)}
            />
          </div>

          {d.encomendas && <SecaoEncomendas unidade={d.unidade} encomendas={d.encomendas} />}

          <SecaoHistorico eventos={d.eventos} onAbrir={f.setEvento} />
        </>
      )}

      <ModaisUnidade f={f} />
    </div>
  )
}
