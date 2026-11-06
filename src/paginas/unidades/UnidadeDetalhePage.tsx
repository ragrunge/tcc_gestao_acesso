import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ban, Check, Info } from 'lucide-react'
import { useApi, type AutorizacaoView, type RestricaoView, type VinculoView } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { Alert } from '@/componentes/Alert'
import { Badge, SeloVinculo } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'
import { PageHeader } from '@/componentes/PageHeader'
import { ConfirmarModal } from '@/componentes/ConfirmarModal'
import { useToast } from '@/componentes/Toast'
import { ROTULO_VINCULO, type EventoView, type Veiculo } from '@/domain/types'
import { descreverJanela } from '@/domain/rules'
import { fmtData, agora } from '@/domain/time'
import { acharUnidadePorTexto, codigoUnidade } from '@/domain/units'
import { mensagemErro } from '@/app/useAsync'
import { NovoVinculoModalLazy, mensagemSucesso } from '@/paginas/vinculos/NovoVinculoLazy'
import { useCatalogo } from '@/app/catalogo'
import { APOS_AUTORIZACAO, APOS_VEICULO, useInvalidar } from '@/app/consultas'
import { useAcoesUnidade, useUnidadeDetalhe } from './useUnidades'
import { chipDoEvento, quandoCurto, textoAutorizacao } from '@/paginas/common/evento'
import { EventoGaveta } from '@/paginas/historico/EventoGaveta'
import { EditarUnidadeModal } from './EditarUnidadeModal'
import { CadastroNoSeletor } from './CadastroNoSeletor'
import { PreviaModal } from './PreviaModal'
import { RestricaoModal } from './RestricaoModal'
import { VeiculoModal } from './VeiculoModal'
import { EncerrarVinculoModal } from './EncerrarVinculoModal'

type Modo = null | 'vinculo' | 'morador' | 'previa' | 'restricao' | 'veiculo' | 'editar'

/** Seção cujo módulo a API real ainda não tem: o resto da tela funciona normalmente. */
function SecaoEmBreve({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 text-[14px] text-[#56616B]"
      role="note"
      aria-label={`${titulo}: disponível em breve`}
    >
      <Info className="mt-[2px] h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span>{children ?? 'Disponível em breve na API real.'}</span>
    </div>
  )
}

/** Detalhe da unidade (coluna direita do mestre-detalhe de Unidades). `id`: uuid ou código "D-32". */
export function UnidadeDetalhe({ id }: { id: string }) {
  const api = useApi()
  const nav = useNavigate()
  const invalidar = useInvalidar()
  const { avisar } = useToast()
  const catalogo = useCatalogo()
  const acoes = useAcoesUnidade()
  const [modo, setModo] = useState<Modo>(null)
  const [evento, setEvento] = useState<EventoView | null>(null)
  const [veiculoEditado, setVeiculoEditado] = useState<Veiculo | null>(null)
  const [revogando, setRevogando] = useState<AutorizacaoView | null>(null)
  const [encerrando, setEncerrando] = useState<VinculoView | null>(null)
  const [pendenteAviso, setPendenteAviso] = useState(false)
  const podeVinculo = useCan('vinculo.criar')
  const podeEncerrar = useCan('vinculo.decidir')
  const podeCadastrarMorador = useCan('pessoa.cadastrar_morador')
  const podePrevia = useCan('autorizacao.criar')
  const podeCadastrarExterno = useCan('pessoa.cadastrar_externo')
  const podeRestricao = useCan('restricao.criar')
  const podeRevogar = useCan('unidade.editar')
  const podeVeiculo = useCan('veiculo.cadastrar')
  const podeEditarUnidade = useCan('unidade.editar')
  const det = useUnidadeDetalhe(id)
  /** Vínculo, autorização ou restrição novos mudam o detalhe, o resumo do bloco, a fila de vínculos, a pessoa e o turno. */
  const recarregar = () => invalidar(APOS_AUTORIZACAO)

  if (det.error)
    return (
      <Alert tom="vermelho" role="alert">
        {mensagemErro(det.error)}{' '}
        <Link className="underline" to="/unidades">
          Voltar às unidades
        </Link>
      </Alert>
    )
  // Dado anterior (placeholder) só vale se for a MESMA unidade (troca de "D-32" para o uuid). De outra unidade, não:
  // os botões agiriam sobre a unidade anterior enquanto a nova carrega.
  const bruto = det.data
  const mesma = !!bruto && (bruto.unidade.id === id || !!acharUnidadePorTexto([bruto.unidade], id))
  const d = det.isPlaceholderData && !mesma ? undefined : bruto
  const uid = d?.unidade.id ?? ''
  const ativa = !!d?.unidade.ativo
  const feito = (texto: string) => {
    setModo(null)
    avisar({ texto })
    void recarregar()
  }

  // RF-01: desativar/reativar (nunca excluir); a mutation invalida o catálogo, para o seletor de unidades refletir
  async function alternarAtivo() {
    if (!d) return
    const codigo = catalogo.codigo(uid)
    try {
      await acoes.alternarAtivo.mutateAsync({ id: uid, ativo: ativa })
      avisar({
        texto: ativa
          ? `Unidade ${codigo} desativada. O histórico continua disponível.`
          : `Unidade ${codigo} reativada.`,
      })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  async function revogarPrevia(a: AutorizacaoView) {
    await api.autorizacoes.revogar(a.id)
    setRevogando(null)
    avisar({ texto: 'Autorização prévia revogada.' })
    void recarregar()
  }
  async function encerrarVinculo(v: VinculoView, motivo: string) {
    await api.vinculos.encerrar(v.id, { motivo })
    setEncerrando(null)
    avisar({
      tom: 'ambar',
      texto: `Vínculo de ${v.pessoaNome} encerrado. Deixa de valer para acesso; o histórico é mantido.`,
    })
    void recarregar()
  }
  async function revogarRestricao(r: RestricaoView) {
    try {
      await api.restricoes.revogar(r.id)
      avisar({ texto: 'Restrição revogada.' })
      void recarregar()
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  const cartao =
    'flex flex-col gap-[10px] rounded-[10px] border border-[#DCE1E5] bg-white px-[18px] py-[14px]'
  const vazio = 'text-[14px] text-[#56616B]'
  const link =
    'inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold lg:mouse:min-h-0 text-[#0B5563] hover:underline'
  return (
    <div className="flex flex-col gap-4">
      {/* Primária por último, à direita (regra do PageHeader); desativar em vermelho por ser a ação de risco */}
      <PageHeader
        titulo={
          <>
            {catalogo.agrupamento} {d?.unidade.bloco} · Apartamento {d?.unidade.numero}
          </>
        }
        acoes={
          d && (
            <>
              {podeEditarUnidade && (
                <Button
                  variante={ativa ? 'perigoContorno' : 'contorno'}
                  carregando={acoes.alternarAtivo.isPending}
                  onClick={() => void alternarAtivo()}
                >
                  {ativa ? 'Desativar unidade' : 'Reativar unidade'}
                </Button>
              )}
              {podeEditarUnidade && (
                <Button variante="contorno" onClick={() => setModo('editar')}>
                  Editar número
                </Button>
              )}
              {ativa && podeVinculo && (
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
              {ativa && podeRestricao && (
                <Button variante="contorno" onClick={() => setModo('restricao')}>
                  Nova restrição
                </Button>
              )}
              {ativa && podePrevia && (
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
          {podeEditarUnidade
            ? 'Use o botão “Reativar unidade”, no alto da página.'
            : 'Peça à administração ou ao síndico para reativá-la.'}{' '}
          Ela não aparece para nova entrada, encomenda ou vínculo; o histórico continua disponível.
        </Alert>
      )}
      {pendenteAviso && (
        <Alert tom="neutro" role="status">
          Vínculo solicitado: fica <strong>pendente</strong> até a aprovação em{' '}
          <Link className="font-semibold underline" to="/vinculos">
            Vínculos
          </Link>
          . Enquanto pendente, não dá acesso de morador.
        </Alert>
      )}

      {d && (
        <>
          <section className="rounded-[10px] border border-[#DCE1E5] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#E6EAED] px-5 py-[10px]">
              <h2 className="text-[16px] font-semibold">Moradores</h2>
              {podeVinculo && ativa && (
                <Button
                  pequeno
                  onClick={() => {
                    setPendenteAviso(false)
                    setModo('morador')
                  }}
                >
                  Incluir morador
                </Button>
              )}
            </div>
            {d.vinculos === null && (
              <div className="px-5 py-4">
                <SecaoEmBreve titulo="Moradores">
                  Vínculos da unidade: disponível em breve na API real.
                </SecaoEmBreve>
              </div>
            )}
            {d.vinculos?.map((v) => (
              <div
                key={v.id}
                className="grid min-h-[52px] grid-cols-1 gap-1 border-b border-[#EEF1F3] px-5 py-[10px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_220px_120px_auto] sm:items-center sm:gap-3"
              >
                <span className="truncate font-medium">{v.pessoaNome}</span>
                <span className="truncate text-[14px]">
                  {ROTULO_VINCULO[v.tipo]}
                  {v.status === 'legado' && v.prazoRegularizacao ? (
                    <span className="text-[#56616B]">
                      {' '}
                      · regularizar até {fmtData(v.prazoRegularizacao)}
                    </span>
                  ) : v.vigenciaFim ? (
                    <span className="text-[#56616B]"> · até {fmtData(v.vigenciaFim)}</span>
                  ) : null}
                </span>
                <SeloVinculo status={v.status} />
                <span>
                  {podeEncerrar && (v.status === 'aprovado' || v.status === 'legado') && (
                    <button
                      type="button"
                      className={link}
                      aria-label={`Encerrar vínculo de ${v.pessoaNome}`}
                      onClick={() => setEncerrando(v)}
                    >
                      Encerrar vínculo
                    </button>
                  )}
                </span>
              </div>
            ))}
            {d.vinculos?.length === 0 && (
              <div className="px-5 py-4 text-[#56616B]">Nenhum vínculo cadastrado.</div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <section className={cartao}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[16px] font-semibold">Veículos</h2>
                {podeVeiculo && (
                  <button type="button" className={link} onClick={() => setModo('veiculo')}>
                    + Novo
                  </button>
                )}
              </div>
              {d.veiculos.map((v) => (
                <div key={v.id} className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-mono text-[17px] font-semibold">{v.placa}</span>
                    <span className="text-[14px] text-[#56616B]">
                      {v.modelo} · {v.cor}
                    </span>
                  </div>
                  {podeVeiculo && (
                    <button
                      type="button"
                      className={link}
                      aria-label={`Editar veículo ${v.placa}`}
                      onClick={() => setVeiculoEditado(v)}
                    >
                      Editar
                    </button>
                  )}
                </div>
              ))}
              {d.veiculos.length === 0 && <span className={vazio}>Nenhum veículo cadastrado.</span>}
            </section>

            <section className={cartao}>
              <h2 className="text-[16px] font-semibold">Autorizações prévias ativas</h2>
              {d.autorizacoes === null && <SecaoEmBreve titulo="Autorizações prévias" />}
              {d.autorizacoes?.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <Check
                    className="mt-[3px] h-4 w-4 shrink-0 text-[#05603A]"
                    strokeWidth={2.6}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{a.pessoaNome}</span>
                    <span className="text-[13px] text-[#56616B]">
                      Até {fmtData(a.validaAte)} · {descreverJanela(a)}
                      {a.semSolicitante
                        ? ` · cadastrada por ${a.cadastradaPorNome}`
                        : ` · por ${a.solicitadaPorNome}`}
                    </span>
                    {a.semSolicitante && (
                      <span className="mt-0.5 self-start">
                        <Badge tom="ambar" tamanho="xs">
                          Sem solicitante
                        </Badge>
                      </span>
                    )}
                    {a.semSolicitante && a.justificativa && (
                      <span className="text-[13px] text-[#7A2E0E]">
                        Justificativa: {a.justificativa}
                      </span>
                    )}
                    {a.estado !== 'valida' && (
                      <span className="mt-0.5 self-start">
                        <Badge tom="ambar" tamanho="xs">
                          Fora da janela agora
                        </Badge>
                      </span>
                    )}
                  </div>
                  {podePrevia && (
                    <button
                      type="button"
                      className={link}
                      aria-label={`Revogar autorização de ${a.pessoaNome}`}
                      onClick={() => setRevogando(a)}
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))}
              {d.autorizacoes?.length === 0 && (
                <span className={vazio}>Nenhuma autorização ativa.</span>
              )}
            </section>

            <section className={cartao}>
              <h2 className="text-[16px] font-semibold">Restrições</h2>
              {d.restricoes === null && <SecaoEmBreve titulo="Restrições" />}
              {d.restricoes?.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-[#B42318]">
                  <Ban className="mt-[3px] h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{r.pessoaNome}</span>
                    <span className="text-[13px] text-[#912018]">“{r.motivo}”</span>
                    <span className="text-[13px] text-[#56616B]">
                      Solicitada por {r.solicitadaPorNome ?? 'administração'} ·{' '}
                      {fmtData(r.cadastradaEm)}
                    </span>
                    {(r.pendente || r.escopo === 'condominio') && (
                      <span className="mt-0.5 self-start">
                        {r.pendente ? (
                          <Badge tom="ambar" tamanho="xs">
                            Aguardando aprovação do síndico
                          </Badge>
                        ) : (
                          <Badge tom="vermelho" tamanho="xs">
                            Todo o condomínio
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                  {podeRevogar && (
                    <button
                      type="button"
                      className={link}
                      aria-label={`Revogar restrição de ${r.pessoaNome}`}
                      onClick={() => void revogarRestricao(r)}
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))}
              {d.restricoes?.length === 0 && <span className={vazio}>Nenhuma restrição.</span>}
            </section>
          </div>

          {d.encomendas && (
            <section
              className="rounded-[10px] border border-[#DCE1E5] bg-white"
              aria-labelledby="enc-unidade"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E6EAED] px-5 py-[10px]">
                <h2 id="enc-unidade" className="text-[16px] font-semibold">
                  Encomendas aguardando retirada ({d.encomendas.aguardando})
                </h2>
                <div className="flex items-center gap-3">
                  {d.encomendas.atrasadas > 0 && (
                    <Badge tom="ambar" tamanho="xs">
                      {d.encomendas.atrasadas} há mais de 7 dias
                    </Badge>
                  )}
                  <Link className={link} to={`/encomendas?un=${codigoUnidade(d.unidade)}`}>
                    Ver todas da unidade
                  </Link>
                </div>
              </div>
              {d.encomendas.itens.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[#E6EAED] px-5 py-[10px] last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{e.destinatario}</span>
                    <span className="text-[13px] text-[#56616B]">
                      {e.codigo}
                      {e.transportadora ? ` · ${e.transportadora}` : ''}
                      {e.codigoRastreio ? ` · ${e.codigoRastreio}` : ''}
                    </span>
                  </div>
                  <span className="text-[13px] text-[#56616B]">
                    Recebida em {fmtData(e.recebidaEm)}
                  </span>
                </div>
              ))}
              {d.encomendas.aguardando === 0 && (
                <div className={`px-5 py-4 ${vazio}`}>Nenhuma encomenda aguardando.</div>
              )}
              {d.encomendas.aguardando > d.encomendas.itens.length && (
                <div className={`px-5 py-3 ${vazio}`}>
                  Mostrando as {d.encomendas.itens.length} mais antigas.
                </div>
              )}
            </section>
          )}

          <section className="rounded-[10px] border border-[#DCE1E5] bg-white">
            <h2 className="border-b border-[#E6EAED] px-5 py-[14px] text-[16px] font-semibold">
              Histórico recente de acessos
            </h2>
            {d.eventos === null && (
              <div className="px-5 py-4">
                <SecaoEmBreve titulo="Histórico recente de acessos" />
              </div>
            )}
            {d.eventos?.map((e) => {
              const c = chipDoEvento(e)
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEvento(e)}
                  className="grid min-h-12 w-full grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-[#EEF1F3] bg-white px-5 py-[9px] text-left hover:bg-[#F5F8F9] md:grid-cols-[110px_minmax(0,1fr)_170px_minmax(0,1fr)_130px]"
                >
                  <span className="font-mono text-[14px]">
                    {quandoCurto(e.ocorridoEm, agora())}
                  </span>
                  <span className="truncate font-medium">{e.pessoaNome}</span>
                  <span>
                    <Badge tom={c.tom}>{c.texto}</Badge>
                  </span>
                  <span className="truncate text-[14px]">{textoAutorizacao(e)}</span>
                  <span className="truncate text-[14px] text-[#33424B]">{e.operadorNome}</span>
                </button>
              )
            })}
            {d.eventos?.length === 0 && (
              <div className="px-5 py-4 text-[#56616B]">Sem acessos recentes.</div>
            )}
          </section>
        </>
      )}

      {evento && <EventoGaveta ev={evento} onClose={() => setEvento(null)} />}
      {d && (modo === 'vinculo' || modo === 'morador') && (
        <NovoVinculoModalLazy
          titulo={modo === 'morador' ? 'Incluir morador' : 'Solicitar vínculo'}
          unidadeFixa={d.unidade}
          vinculosConhecidos={d.vinculos}
          onClose={() => setModo(null)}
          onFeito={(v) => {
            feito(mensagemSucesso(v))
            setPendenteAviso(v.status === 'pendente')
          }}
          cadastro={
            podeCadastrarMorador
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
          onClose={() => setRevogando(null)}
          onConfirmar={() => revogarPrevia(revogando)}
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
          onClose={() => setEncerrando(null)}
          onConfirmar={(motivo) => encerrarVinculo(encerrando, motivo)}
        />
      )}
      {d && modo === 'previa' && (
        <PreviaModal
          unidade={uid}
          podeCadastrar={podeCadastrarExterno}
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
      {d && veiculoEditado && (
        <VeiculoModal
          unidade={uid}
          atual={veiculoEditado}
          onClose={() => setVeiculoEditado(null)}
          onFeito={(texto) => {
            setVeiculoEditado(null)
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
            nav(`/unidades/${novoId}`, { replace: true })
          }}
        />
      )}
    </div>
  )
}
