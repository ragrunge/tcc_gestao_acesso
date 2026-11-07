import { Link } from 'react-router-dom'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import type { FichaUnidade } from './useFichaUnidade'

/** Título, ações da unidade e avisos de unidade desativada e de vínculo pendente. */
export function CabecalhoUnidade({ f }: { f: FichaUnidade }) {
  const { d, ativa, pode, setModo, setPendenteAviso } = f
  return (
    <>
      {/* Primária por último, à direita (regra do PageHeader); desativar em vermelho por ser a ação de risco */}
      <PageHeader
        titulo={
          <>
            {f.catalogo.agrupamento} {d?.unidade.bloco} · Apartamento {d?.unidade.numero}
          </>
        }
        acoes={
          d && (
            <>
              {pode.editarUnidade && (
                <Button
                  variante={ativa ? 'perigoContorno' : 'contorno'}
                  carregando={f.alternando}
                  onClick={() => void f.alternarAtivo()}
                >
                  {ativa ? 'Desativar unidade' : 'Reativar unidade'}
                </Button>
              )}
              {pode.editarUnidade && (
                <Button variante="contorno" onClick={() => setModo('editar')}>
                  Editar número
                </Button>
              )}
              {ativa && pode.vinculo && (
                <Button
                  variante="contorno"
                  onClick={() => {
                    setPendenteAviso(false)
                    setModo('vinculo')
                  }}
                >
                  Solicitar vínculo
                </Button>
              )}
              {ativa && pode.restricao && (
                <Button variante="contorno" onClick={() => setModo('restricao')}>
                  Nova restrição
                </Button>
              )}
              {ativa && pode.previa && (
                <Button variante="primario" onClick={() => setModo('previa')}>
                  Nova autorização prévia
                </Button>
              )}
            </>
          )
        }
      />
      {d && !ativa && (
        <Alert tom="ambar" role="status">
          Unidade desativada: reative para incluir moradores ou autorizações.{' '}
          {pode.editarUnidade
            ? 'Use o botão “Reativar unidade”, no alto da página.'
            : 'Peça à administração ou ao síndico para reativá-la.'}{' '}
          Ela não aparece para nova entrada, encomenda ou vínculo; o histórico continua disponível.
        </Alert>
      )}
      {f.pendenteAviso && (
        <Alert tom="neutro" role="status">
          Vínculo solicitado: fica <strong>pendente</strong> até a aprovação em{' '}
          <Link className="font-semibold underline" to="/vinculos">
            Vínculos
          </Link>
          . Enquanto pendente, não dá acesso de morador.
        </Alert>
      )}
    </>
  )
}
