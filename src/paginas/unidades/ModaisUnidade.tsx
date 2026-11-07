import { ConfirmarModal } from '@/componentes/ConfirmarModal'
import { APOS_VEICULO } from '@/app/consultas'
import { NovoVinculoModalLazy, mensagemSucesso } from '@/paginas/vinculos/NovoVinculoLazy'
import { EventoGaveta } from '@/paginas/historico/EventoGaveta'
import { EditarUnidadeModal } from './EditarUnidadeModal'
import { CadastroNoSeletor } from './CadastroNoSeletor'
import { PreviaModal } from './PreviaModal'
import { RestricaoModal } from './RestricaoModal'
import { VeiculoModal } from './VeiculoModal'
import { EncerrarVinculoModal } from './EncerrarVinculoModal'
import type { FichaUnidade } from './useFichaUnidade'

/** Gaveta e modais da ficha; gaveta, revogação e encerramento não dependem do detalhe carregado. */
export function ModaisUnidade({ f }: { f: FichaUnidade }) {
  const { d, uid, modo, setModo, feito, avisar, invalidar, evento, revogando, encerrando } = f
  return (
    <>
      {evento && <EventoGaveta ev={evento} onClose={() => f.setEvento(null)} />}
      {d && (modo === 'vinculo' || modo === 'morador') && (
        <NovoVinculoModalLazy
          titulo={modo === 'morador' ? 'Incluir morador' : 'Solicitar vínculo'}
          unidadeFixa={d.unidade}
          vinculosConhecidos={d.vinculos}
          onClose={() => setModo(null)}
          onFeito={(v) => {
            feito(mensagemSucesso(v))
            f.setPendenteAviso(v.status === 'pendente')
          }}
          cadastro={
            f.pode.cadastrarMorador
              ? ({ texto, onEscolhida, onVoltar }) => (
                  <CadastroNoSeletor
                    unidade={uid}
                    texto={texto}
                    onVoltar={onVoltar}
                    onEscolhida={onEscolhida}
                    aviso="Depois de cadastrada, a pessoa já fica escolhida no vínculo. O vínculo continua pendente até a aprovação em Vínculos."
                  />
                )
              : undefined
          }
        />
      )}
      {revogando && (
        <ConfirmarModal
          titulo="Revogar autorização prévia"
          rotulo="Revogar autorização"
          onClose={() => f.setRevogando(null)}
          onConfirmar={() => f.revogarPrevia(revogando)}
        >
          <p>
            Revogar a autorização prévia de <strong>{revogando.pessoaNome}</strong>? Ela deixa de
            valer na portaria; o histórico é mantido.
          </p>
        </ConfirmarModal>
      )}
      {encerrando && (
        <EncerrarVinculoModal
          vinculo={encerrando}
          onClose={() => f.setEncerrando(null)}
          onConfirmar={(motivo) => f.encerrarVinculo(encerrando, motivo)}
        />
      )}
      {d && modo === 'previa' && (
        <PreviaModal
          unidade={uid}
          podeCadastrar={f.pode.cadastrarExterno}
          onClose={() => setModo(null)}
          onFeito={() => feito('Autorização prévia cadastrada.')}
        />
      )}
      {d && modo === 'restricao' && (
        <RestricaoModal
          unidade={uid}
          onClose={() => setModo(null)}
          onFeito={(todo) =>
            feito(
              todo
                ? 'Pedido de restrição para todo o condomínio registrado. Aguarda aprovação do síndico.'
                : 'Restrição cadastrada.',
            )
          }
        />
      )}
      {d && modo === 'veiculo' && (
        <VeiculoModal
          unidade={uid}
          onClose={() => setModo(null)}
          onFeito={() => {
            setModo(null)
            avisar({ texto: 'Veículo cadastrado.' })
            void invalidar(APOS_VEICULO)
          }}
        />
      )}
      {d && f.veiculoEditado && (
        <VeiculoModal
          unidade={uid}
          atual={f.veiculoEditado}
          onClose={() => f.setVeiculoEditado(null)}
          onFeito={(texto) => {
            f.setVeiculoEditado(null)
            avisar({ texto })
            void invalidar(APOS_VEICULO)
          }}
        />
      )}
      {d && modo === 'editar' && (
        <EditarUnidadeModal
          id={uid}
          bloco={d.unidade.bloco}
          numero={d.unidade.numero}
          onClose={() => setModo(null)}
          onFeito={(cod, novoId) => {
            feito(`Unidade alterada para ${cod}.`)
            f.nav(`/unidades/${novoId}`, { replace: true })
          }}
        />
      )}
    </>
  )
}
