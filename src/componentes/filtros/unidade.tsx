import { useState } from 'react'
import { useCatalogo } from '@/app/catalogo'
import { CampoFiltro } from './campos'
import { CONTROLE } from './controle'
import { useFiltrosUrl } from './url'

/**
 * Unidade digitada ("D-32"), resolvida pelo catálogo. Na URL vai só o código da unidade resolvida (`chave`, padrão
 * `un`); texto que não resolve não filtra e não vai para a URL.
 */
export function useFiltroUnidade(chave = 'un') {
  const catalogo = useCatalogo()
  const { params, gravar } = useFiltrosUrl()
  const [texto, setTexto] = useState(() => params.get(chave) ?? '')
  const un = texto.trim() ? catalogo.porTexto(texto) : undefined
  const pendente = !!texto.trim() && !catalogo.pronto
  const alterar = (t: string) => {
    setTexto(t)
    const u = t.trim() ? catalogo.porTexto(t) : undefined
    gravar({ [chave]: u ? catalogo.codigo(u.id) : undefined })
  }
  return {
    texto,
    unidadeId: un?.id as string | undefined,
    alterar,
    /** Digitou algo que não é unidade (só depois de o catálogo carregar). */
    invalida: !!texto.trim() && catalogo.pronto && !un,
    /** Veio texto da URL e o catálogo ainda não resolveu: a consulta espera. */
    pendente,
    limpar: () => {
      setTexto('')
      gravar({ [chave]: undefined })
    },
  }
}

export function FiltroUnidade({
  f,
  largura = 'md:w-36',
}: {
  f: ReturnType<typeof useFiltroUnidade>
  largura?: string
}) {
  return (
    <CampoFiltro rotulo="Unidade" largura={largura}>
      <input
        className={`${CONTROLE} font-sans`}
        placeholder="Ex.: D-32"
        value={f.texto}
        onChange={(e) => f.alterar(e.target.value)}
        aria-invalid={f.invalida}
      />
      {f.invalida && <span className="text-[12px] font-normal text-[#B42318]">Use D-32.</span>}
    </CampoFiltro>
  )
}
