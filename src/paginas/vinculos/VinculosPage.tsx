import { useRef, useState } from 'react'
import { Info } from 'lucide-react'
import type { VinculoView } from '@/api'
import { PageHeader } from '@/componentes/PageHeader'
import { mensagemErro } from '@/app/useAsync'
import { APOS_VINCULO, useContagemPendentes, useInvalidar } from '@/app/consultas'
import { useCan } from '@/auth/AuthContext'
import { FichaPessoaModal } from '@/paginas/cadastro/FichaPessoaModal'
import { ErroCarregar } from '@/componentes/Carregando'
import { lerOpcao, naUrl, useFiltrosUrl } from '@/componentes/Filtros'
import { Totais } from '@/componentes/Paginacao'
import { useFilaVinculos, useResumoVinculos } from './consultas'
import type { Aba } from './regras'
import { useDecisaoVinculo } from './useDecisaoVinculo'
import { FilaVinculos } from './FilaVinculos'
import { DetalheVinculo } from './DetalheVinculo'

export function VinculosPage() {
  const invalidar = useInvalidar()
  const podeDecidir = useCan('vinculo.decidir')
  const { params, gravar } = useFiltrosUrl()
  const aba = lerOpcao<Aba>(params.get('aba'), ['pendentes', 'legados', 'decididos'], 'pendentes')
  const [ficha, setFicha] = useState<string | null>(null)
  const fila = useFilaVinculos(aba)
  const nPend = useContagemPendentes(true).data
  const resumo = useResumoVinculos().data
  const nLeg = resumo?.porStatus.legado
  const [sel, setSel] = useState<string | null>(null)

  const lista = fila.itens
  const nVencidos = resumo?.legadosVencidos
  const atual: VinculoView | undefined = lista.find((v) => v.id === sel) ?? lista[0]
  const recarregar = () => invalidar(APOS_VINCULO)
  const decisao = useDecisaoVinculo(atual, recarregar, () => setSel(null))
  // Abaixo de xl o detalhe fica embaixo da fila inteira: ao escolher um item, leva a pessoa até ele (e o foco, para o teclado)
  const titulo = useRef<HTMLHeadingElement>(null)
  function escolher(id: string) {
    setSel(id)
    if (window.matchMedia?.('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        titulo.current?.scrollIntoView({ block: 'start' })
        titulo.current?.focus({ preventScroll: true })
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Vínculos pendentes"
        descricao={
          nPend === undefined
            ? 'Solicitações aguardando decisão da administração.'
            : `${nPend} ${nPend === 1 ? 'solicitação aguardando' : 'solicitações aguardando'} decisão da administração.`
        }
      />
      <div className="flex items-center gap-[10px] rounded-lg border border-[#A9D2D8] bg-[#E3F0F2] px-4 py-3 font-medium text-[#0B4450]">
        <Info className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        Vínculo pendente não dá acesso de morador. Documento apresentado na portaria não substitui
        esta aprovação.
      </div>
      <Totais
        rotulo="Totais de vínculos"
        itens={[
          { rotulo: 'Legados a regularizar', valor: nLeg, destaque: 'ambar' },
          { rotulo: 'Legados vencidos', valor: nVencidos, destaque: 'vermelho' },
          { rotulo: 'Moradores com vínculo válido', valor: resumo?.pessoasComVinculoValido },
          { rotulo: 'Proprietários', valor: resumo?.validosPorTipo.proprietario },
          { rotulo: 'Inquilinos', valor: resumo?.validosPorTipo.inquilino },
          { rotulo: 'Dependentes', valor: resumo?.validosPorTipo.dependente },
        ]}
      />
      {fila.consulta.error && (
        <ErroCarregar
          mensagem={mensagemErro(fila.consulta.error)}
          onTentar={() => fila.consulta.refetch()}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <FilaVinculos
          aba={aba}
          onTrocarAba={(a) => {
            gravar({ aba: naUrl(a, 'pendentes') })
            setSel(null)
          }}
          fila={fila}
          atualId={atual?.id}
          onEscolher={escolher}
          onIrPagina={(n) => {
            fila.irPara(n)
            setSel(null)
          }}
          nPend={nPend}
          nLeg={nLeg}
          nVencidos={nVencidos}
        />
        {atual && (
          <DetalheVinculo
            atual={atual}
            d={decisao}
            podeDecidir={podeDecidir}
            titulo={titulo}
            recarregar={recarregar}
            onAbrirFicha={setFicha}
          />
        )}
      </div>
      {ficha && (
        <FichaPessoaModal
          id={ficha}
          onClose={() => {
            setFicha(null)
            void recarregar()
          }}
        />
      )}
    </div>
  )
}
