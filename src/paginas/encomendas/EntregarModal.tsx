import { useAcoesEncomenda, useEncomendaAtual } from './consultas'
import { useEffect, useState } from 'react'
import { Ban, Check } from 'lucide-react'
import { useApi, type EncomendaView, type PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { UnitTag } from '@/componentes/UnitTag'
import { dicaBuscaCpf } from '@/domain/cpf'
import { type Encomenda } from '@/domain/types'
import { mensagemErro } from '@/app/useAsync'

export function EntregarModal({
  encomenda,
  onClose,
  onFeito,
}: {
  encomenda: EncomendaView
  onClose: () => void
  onFeito: (e: Encomenda, nome: string) => void
}) {
  const api = useApi()
  const acoes = useAcoesEncomenda()
  const [q, setQ] = useState('')
  const [achados, setAchados] = useState<PessoaBusca[]>([])
  const [escolhida, setEscolhida] = useState<PessoaBusca | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setAchados([])
      return
    }
    let vivo = true
    const t = setTimeout(() => {
      api.pessoas
        .buscar(q)
        .then((r) => vivo && setAchados(r))
        .catch(() => undefined)
    }, 150)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [q, api])

  // RN-08: vínculo válido (aprovado ou legado no prazo, a mesma regra do interfone) ou autorização de retirada; o servidor valida de novo.
  // As autorizações são relidas aqui: a linha da lista pode ser anterior a uma autorização recém-registrada.
  const atual = useEncomendaAtual(encomenda.id)
  const autorizacoes = (atual.data ?? encomenda).autorizacoes
  const autorizacao = escolhida
    ? autorizacoes.find((a) => a.pessoaAutorizadaId === escolhida.id)
    : undefined
  const vinculoOk = !!escolhida && escolhida.unidadesVinculadas.includes(encomenda.unidadeId)
  const temVinculo = vinculoOk || !!autorizacao

  async function confirmar() {
    if (!escolhida) return
    setSalvando(true)
    try {
      onFeito(await acoes.entregar({ id: encomenda.id, pessoaId: escolhida.id }), escolhida.nome)
    } catch (e) {
      setErro(mensagemErro(e))
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={`Entregar encomenda ${encomenda.codigo}`}
      onClose={onClose}
      rodape={
        !escolhida ? (
          <Button grande className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
        ) : temVinculo ? (
          <>
            <Button
              variante="primario"
              grande
              className="flex-1"
              atalho="Enter"
              data-autofocus
              carregando={salvando}
              onClick={() => void confirmar()}
            >
              Confirmar entrega
            </Button>
            <Button grande onClick={() => setEscolhida(null)}>
              Trocar pessoa
            </Button>
          </>
        ) : (
          <>
            <Button grande className="flex-1" data-autofocus onClick={() => setEscolhida(null)}>
              Buscar outra pessoa
            </Button>
            <Button grande onClick={onClose}>
              Fechar
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col">
        <UnitTag id={encomenda.unidadeId} tamanho="lg" className="!text-[30px]" />
        <span className="text-[#33424B]">Destinatário: {encomenda.destinatario}</span>
        <span className="text-[14px] text-[#56616B]">
          {encomenda.transportadora} · <span className="font-mono">{encomenda.codigoRastreio}</span>
        </span>
      </div>
      {!escolhida ? (
        <>
          <label className="flex flex-col gap-1.5 text-[14px] font-medium">
            Quem está retirando?
            <input
              data-autofocus
              className="h-12 rounded-lg border border-[#9AA7B0] bg-white px-[14px] text-[16px] font-normal"
              placeholder="Nome da pessoa"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              aria-describedby="retirada-busca-dica"
            />
          </label>
          <p
            id="retirada-busca-dica"
            role="status"
            className={dicaBuscaCpf(q) ? '-mt-2 text-[13px] text-[#56616B]' : 'sr-only'}
          >
            {dicaBuscaCpf(q) ?? ''}
          </p>
          <div className="flex flex-col gap-1">
            {achados.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-[#E1E6EA] bg-white px-3 py-1.5 text-left hover:bg-[#EEF5F6]"
                onClick={() => {
                  setEscolhida(p)
                  setErro('')
                }}
              >
                <span className="font-medium">{p.nome}</span>
                <span className="text-[13px] text-[#56616B]">
                  {p.unidadesVinculadasCodigos.length > 0
                    ? `Mora em ${p.unidadesVinculadasCodigos.join(', ')}`
                    : p.documentoMascarado}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {temVinculo ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-[10px] border border-[#75E0A7] bg-[#DCFAE6] px-4 py-[14px] text-[#05603A]"
            >
              <Check className="h-[22px] w-[22px] shrink-0" strokeWidth={2.4} aria-hidden />
              <div className="flex flex-col">
                <span className="text-[16px] font-semibold">{escolhida.nome}</span>
                <span className="text-[14px]">
                  {vinculoOk
                    ? `Vínculo válido com a ${encomenda.unidadeCodigo}.`
                    : `Autorizado(a) a retirar por ${autorizacao?.solicitanteNome}.`}{' '}
                  A retirada fica registrada com o seu nome.
                </span>
              </div>
            </div>
          ) : (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[10px] border-2 border-[#B42318] bg-[#FEE4E2] p-4 text-[#912018]"
            >
              <Ban className="h-7 w-7 shrink-0" strokeWidth={2.2} aria-hidden />
              <div className="flex flex-col gap-1">
                <span className="text-[17px] font-bold">
                  Esta pessoa não tem vínculo com a {encomenda.unidadeCodigo} nem autorização de
                  retirada. Contate a unidade.
                </span>
                <span className="text-[14px]">
                  {escolhida.nome} · {escolhida.documentoMascarado}
                </span>
              </div>
            </div>
          )}
          {erro && (
            <Alert tom="vermelho" role="alert">
              {erro}
            </Alert>
          )}
        </>
      )}
    </Modal>
  )
}
