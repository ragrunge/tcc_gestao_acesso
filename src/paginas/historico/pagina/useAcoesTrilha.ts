import { useState } from 'react'
import { useApi, type FiltroEventos } from '@/api'
import type { ResultadoIntegridade } from '@/domain/hashChain'
import { useToast } from '@/componentes/Toast'
import { mensagemErro } from '@/app/useAsync'
import { CHAVES, useInvalidar } from '@/app/consultas'
import { baixarArquivo } from '../download'

export function useAcoesTrilha(filtro: FiltroEventos) {
  const api = useApi()
  const { avisar } = useToast()
  const invalidar = useInvalidar()
  const [integ, setInteg] = useState<ResultadoIntegridade | null>(null)
  const [verificando, setVerificando] = useState(false)

  async function verificar() {
    setVerificando(true)
    try {
      const r = await api.auditoria.verificarIntegridade()
      setInteg(r)
      void invalidar([CHAVES.integridade, CHAVES.selos])
      if (r.valido)
        avisar({
          titulo: 'Trilha íntegra',
          texto: `${r.verificados} registros verificados; a cadeia de hashes está consistente.`,
        })
      else
        avisar({
          tom: 'vermelho',
          titulo: 'Adulteração detectada',
          texto: `Primeiro registro divergente: seq ${r.primeiroSeqInvalido}.`,
        })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    } finally {
      setVerificando(false)
    }
  }

  async function exportar() {
    try {
      const p = await api.auditoria.exportar(filtro)
      baixarArquivo(p.nomeArquivo, p.conteudo)
      avisar({
        titulo: 'Trilha exportada',
        texto: `${p.quantidade} eventos com hashes em ${p.nomeArquivo}. O arquivo traz as instruções de verificação.`,
      })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  return { integ, verificando, verificar, exportar }
}
