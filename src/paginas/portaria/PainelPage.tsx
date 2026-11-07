import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '@/api'
import { useAuth, useCan } from '@/auth/AuthContext'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { useToast } from '@/componentes/Toast'
import { ROTULO_PAPEL, type EventoView } from '@/domain/types'
import { partes } from '@/domain/time'
import { mensagemErro, useAgora } from '@/app/useAsync'
import { CHAVES, useInvalidar } from '@/app/consultas'
import { EventoGaveta } from '@/paginas/historico/EventoGaveta'
import { ErroCarregar } from '@/componentes/Carregando'
import { AcoesRapidas } from './painel/AcoesRapidas'
import { CartoesResumo } from './painel/CartoesResumo'
import { usePainelConsultas } from './painel/consultas'
import { PassarTurnoModal } from './painel/PassarTurnoModal'
import { PendenciasSindico } from './painel/PendenciasSindico'
import { PreviasModal } from './painel/PreviasModal'
import { PrevistosSecao } from './painel/PrevistosSecao'
import { UltimasMovimentacoes } from './painel/UltimasMovimentacoes'

export function PainelPage() {
  const api = useApi()
  const nav = useNavigate()
  const { usuario, sair } = useAuth()
  const { avisar } = useToast()
  const agora = useAgora(30000)
  const podeRegistrar = useCan('evento.registrar')
  const podeRetro = useCan('evento.retroativo')
  const podeAprovar = useCan('restricao.aprovar')
  const [turno, setTurno] = useState(false)
  const [passando, setPassando] = useState(false)
  // Só dá o turno por passado se a sessão foi encerrada no servidor; se falhar, o modal fica aberto para tentar de novo.
  async function passarTurno() {
    setPassando(true)
    const ok = await sair()
    setPassando(false)
    if (!ok) return
    avisar({
      tom: 'neutro',
      texto: 'Turno passado. O próximo operador deve entrar com o próprio login (RN-05).',
    })
    nav('/login')
  }
  const [previasAbertas, setPreviasAbertas] = useState(false)
  const [evento, setEvento] = useState<EventoView | null>(null)

  const invalidar = useInvalidar()
  const { resumo, eventos, previas, previstos, encs, pendentes } = usePainelConsultas()

  async function aprovar(id: string) {
    try {
      await api.restricoes.aprovar(id)
      avisar({ texto: 'Restrição para todo o condomínio aprovada.' })
      void invalidar([CHAVES.restricoes, CHAVES.turno, CHAVES.unidades])
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  const hh = partes(agora).hh
  const turnoTxt =
    hh >= 6 && hh < 18 ? 'Turno diurno · 06:00 às 18:00' : 'Turno noturno · 18:00 às 06:00'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Painel da portaria"
        descricao={`${turnoTxt} · ${ROTULO_PAPEL[usuario!.papel]} ${usuario!.nome}`}
        acoes={
          <>
            {podeRetro && (
              <Button
                variante="contorno"
                onClick={() => nav('/entrada?retroativo=1')}
                title="Para acessos anotados no papel durante uma queda do sistema"
              >
                Lançar registro retroativo
              </Button>
            )}
            {podeRegistrar && (
              <Button variante="primario" onClick={() => setTurno(true)}>
                Passar turno
              </Button>
            )}
          </>
        }
      />

      {podeRegistrar && <AcoesRapidas />}

      {podeAprovar && (pendentes.data?.length ?? 0) > 0 && (
        <PendenciasSindico pendentes={pendentes.data!} onAprovar={(id) => void aprovar(id)} />
      )}

      {resumo.error && (
        <ErroCarregar
          mensagem="Não foi possível carregar os números do painel. As ações F2, F8, F3 e F4 continuam funcionando."
          onTentar={() => resumo.refetch()}
        />
      )}
      <CartoesResumo
        resumo={resumo}
        encs={encs}
        previas={previas}
        onAbrirPrevias={() => setPreviasAbertas(true)}
      />

      <PrevistosSecao previstos={previstos} agora={agora} podeRegistrar={podeRegistrar} />

      <UltimasMovimentacoes eventos={eventos} agora={agora} onAbrir={setEvento} />

      {evento && <EventoGaveta ev={evento} onClose={() => setEvento(null)} />}

      {previasAbertas && (
        <PreviasModal previas={previas} onClose={() => setPreviasAbertas(false)} />
      )}

      {turno && (
        <PassarTurnoModal
          nome={usuario!.nome}
          agora={agora}
          resumo={resumo.data}
          passando={passando}
          onConfirmar={() => void passarTurno()}
          onClose={() => setTurno(false)}
        />
      )}
    </div>
  )
}
