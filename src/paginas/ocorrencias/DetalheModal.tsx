import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Paperclip } from 'lucide-react'
import { useApi, type OcorrenciaView } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { Alert } from '@/componentes/Alert'
import { SeloOcorrencia } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { useToast } from '@/componentes/Toast'
import { ROTULO_STATUS_OCORRENCIA, ROTULO_TIPO_OCORRENCIA } from '@/domain/types'
import { ANEXO_MAX_POR_OCORRENCIA } from '@/domain/rules'
import { agora as agoraSim, fmtDataHora } from '@/domain/time'
import { useCatalogo } from '@/app/catalogo'
import { mensagemErro } from '@/app/useAsync'
import { APOS_OCORRENCIA, CHAVES, useInvalidar } from '@/app/consultas'
import { chipDoEvento, quandoCurto, textoAutorizacao } from '@/paginas/common/evento'
import { baixarBlob } from '@/paginas/historico/download'
import { CarregandoLinha } from '@/componentes/Carregando'
import { ACEITOS } from './anexo'
import { MB } from './anexo'
import { problemaDoArquivo } from './anexo'
import { tamanho } from './anexo'
import { SeletorEventos } from './SeletorEventos'

export function DetalheModal({
  id,
  inicial,
  onClose,
  podeOperarDe,
}: {
  id: string
  inicial?: OcorrenciaView
  onClose: () => void
  podeOperarDe: (o: OcorrenciaView) => boolean
}) {
  const api = useApi()
  const { avisar } = useToast()
  const { codigo } = useCatalogo()
  const invalidar = useInvalidar()
  const podeBaixar = useCan('documento.ver')
  const podeVincular = useCan('ocorrencia.operar')
  const [enviando, setEnviando] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [selecionados, setSelecionados] = useState<string[]>([])
  // O detalhe é relido da API depois de cada escrita (status, anexo, eventos): a view volta com os nomes resolvidos
  const q = useQuery({
    queryKey: CHAVES.ocorrencia(id),
    queryFn: () => api.ocorrencias.obter(id),
    placeholderData: inicial,
    staleTime: 0,
  })
  const o = q.data
  const eventos = useQuery({
    queryKey: ['eventos', 'ocorrencia', id, o?.eventoIds.join(',') ?? ''],
    queryFn: () => Promise.all((o?.eventoIds ?? []).map((eid) => api.eventos.obter(eid))),
    enabled: !!o && o.eventoIds.length > 0,
  })
  const rot = 'text-[13px] text-[#56616B]'

  async function escrever(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      avisar({ texto: ok })
      await invalidar(APOS_OCORRENCIA)
      return true
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
      return false
    }
  }
  if (!o) {
    return (
      <Modal
        titulo="Ocorrência"
        tamanho="g"
        onClose={onClose}
        rodape={
          <Button grande className="ml-auto" data-autofocus onClick={onClose}>
            Fechar
          </Button>
        }
      >
        {q.error ? (
          <Alert tom="vermelho" role="alert">
            {mensagemErro(q.error)}
          </Alert>
        ) : (
          <CarregandoLinha>Abrindo a ocorrência…</CarregandoLinha>
        )}
      </Modal>
    )
  }
  const podeOperar = podeOperarDe(o)
  const aberta = o.status !== 'encerrada'
  const docs = o.documentos ?? []
  const nAnexos = Math.max(docs.length, o.anexos.length)
  // Migração por fases (desenho §6): sem o backend de anexos (F4), o envio some; a lista de anexos já gravados continua.
  const podeAnexar =
    api.suporta?.('anexos') !== false && podeOperar && aberta && nAnexos < ANEXO_MAX_POR_OCORRENCIA

  async function anexar(f: File | undefined) {
    if (!f) return
    const p = problemaDoArquivo(f)
    if (p) {
      avisar({ tom: 'vermelho', texto: p })
      return
    }
    setEnviando(true)
    await escrever(() => api.ocorrencias.anexar(o!.id, f), `Anexo adicionado à ${o!.codigo}.`)
    setEnviando(false)
  }
  async function baixar(docId: string) {
    try {
      const a = await api.ocorrencias.baixarAnexo(o!.id, docId)
      baixarBlob(a.nome, a.conteudo)
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  return (
    <Modal
      titulo={`${ROTULO_TIPO_OCORRENCIA[o.tipo]} · ${o.unidadeId ? codigo(o.unidadeId) : 'Área comum'}`}
      tamanho="g"
      onClose={onClose}
      rodape={
        <>
          {/* Fluxo único: aberta, em andamento, encerrada. Encerrada é final; porteiro só mexe nas que abriu. */}
          {podeOperar && o.status === 'aberta' && (
            <Button
              grande
              onClick={() =>
                void escrever(
                  () => api.ocorrencias.alterarStatus(o.id, 'em_andamento'),
                  `${o.codigo} agora está “Em andamento”.`,
                )
              }
            >
              Marcar em andamento
            </Button>
          )}
          {podeOperar && o.status === 'em_andamento' && (
            <Button
              grande
              onClick={() =>
                void escrever(
                  () => api.ocorrencias.alterarStatus(o.id, 'encerrada'),
                  `${o.codigo} agora está “Encerrada”.`,
                )
              }
            >
              Encerrar ocorrência
            </Button>
          )}
          <Button grande className="ml-auto" data-autofocus onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="font-mono text-[13px] text-[#56616B]">
        {o.codigo} · {fmtDataHora(o.abertaEm)}
      </div>
      <p>{o.descricao}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col">
          <span className={rot}>Envolvidos</span>
          <span>{o.envolvidos || '—'}</span>
        </div>
        <div className="flex flex-col">
          <span className={rot}>Registrado por</span>
          <span>{o.abertaPorNome}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className={rot}>Status</span>
          <SeloOcorrencia status={o.status} />
        </div>
      </div>
      {o.historicoStatus.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={rot}>Mudanças de status</span>
          {o.historicoStatus.map((h, i) => (
            <span key={i} className="text-[14px]">
              {fmtDataHora(h.em)} · {ROTULO_STATUS_OCORRENCIA[h.de]} para{' '}
              {ROTULO_STATUS_OCORRENCIA[h.para]} · {h.porNome}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={rot}>Anexos</span>
        {docs.length > 0 ? (
          <ul className="flex flex-col gap-1" aria-label="Anexos da ocorrência">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-[#E1E6EA] bg-white px-3 py-1.5 text-[14px]"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-[#56616B]" aria-hidden />
                <span className="font-mono">{d.nome}</span>
                <span className="text-[#56616B]">
                  {tamanho(d.tamanhoBytes)} · {d.enviadoPorNome} · {fmtDataHora(d.enviadoEm)}
                </span>
                {podeBaixar && (
                  <Button
                    pequeno
                    className="ml-auto"
                    icone={Download}
                    aria-label={`Baixar ${d.nome}`}
                    onClick={() => void baixar(d.id)}
                  >
                    Baixar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span>{o.anexos.length > 0 ? o.anexos.join(', ') : 'Nenhum anexo'}</span>
        )}
        {docs.length > 0 && !podeBaixar && (
          <span className="text-[13px] text-[#56616B]">
            O conteúdo dos anexos é aberto pela administração ou pelo síndico.
          </span>
        )}
        {podeAnexar && (
          <label className="flex items-center gap-2 text-[14px]">
            <span className="font-medium">Adicionar anexo</span>
            <input
              type="file"
              accept={ACEITOS}
              disabled={enviando}
              className="text-[14px]"
              aria-label="Adicionar anexo"
              onChange={(e) => {
                void anexar(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <span className="text-[13px] text-[#56616B]">JPEG, PNG ou PDF até {MB} MB</span>
          </label>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={rot}>Eventos de acesso vinculados</span>
        {o.eventoIds.length === 0 && <span>Nenhum evento vinculado</span>}
        {(eventos.data ?? []).map((e) => (
          <div
            key={e.id}
            className="flex min-h-11 items-center gap-[10px] rounded-lg border border-[#E1E6EA] bg-white px-3 py-1.5 text-[14px]"
          >
            <span className="font-mono">{e.codigo}</span>
            <span>
              {quandoCurto(e.ocorridoEm, agoraSim())} · {e.pessoaNome} ·{' '}
              {e.unidadeRotulo ?? 'Condomínio'} · {chipDoEvento(e).texto} · {textoAutorizacao(e)}
            </span>
          </div>
        ))}
        {podeVincular &&
          aberta &&
          (vinculando ? (
            <div className="flex flex-col gap-2">
              <SeletorEventos
                selecionados={selecionados}
                onChange={setSelecionados}
                ocultar={o.eventoIds}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variante="primario"
                  pequeno
                  disabled={selecionados.length === 0}
                  onClick={async () => {
                    if (
                      await escrever(
                        () => api.ocorrencias.vincularEventos(o.id, selecionados),
                        `${selecionados.length} evento(s) vinculado(s) à ${o.codigo}.`,
                      )
                    ) {
                      setSelecionados([])
                      setVinculando(false)
                    }
                  }}
                >
                  Vincular selecionados
                </Button>
                <Button
                  pequeno
                  onClick={() => {
                    setVinculando(false)
                    setSelecionados([])
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button pequeno className="self-start" onClick={() => setVinculando(true)}>
              Vincular eventos
            </Button>
          ))}
      </div>
    </Modal>
  )
}
