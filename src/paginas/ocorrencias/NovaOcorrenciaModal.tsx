import { useEffect, useState, type FormEvent } from 'react'
import { Check, Paperclip, X } from 'lucide-react'
import { useApi, type Autorizador } from '@/api'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Field } from '@/componentes/Field'
import { Modal } from '@/componentes/Modal'
import { TowerUnitPicker } from '@/componentes/TowerUnitPicker'
import {
  ROTULO_VINCULO,
  ROTULO_TIPO_OCORRENCIA,
  type Ocorrencia,
  type TipoOcorrencia,
} from '@/domain/types'
import { ANEXO_MAX_POR_OCORRENCIA } from '@/domain/rules'
import { useCatalogo } from '@/app/catalogo'
import { oAgrupamento } from '@/domain/units'
import { mensagemErro } from '@/app/useAsync'
import { ACEITOS } from './anexo'
import { MB } from './anexo'
import { problemaDoArquivo } from './anexo'
import { tamanho } from './anexo'
import { SeletorEventos } from './SeletorEventos'

export const TIPOS = Object.keys(ROTULO_TIPO_OCORRENCIA) as TipoOcorrencia[]

export function NovaOcorrenciaModal({
  inicial,
  onClose,
  onFeito,
}: {
  inicial: Record<string, string>
  onClose: () => void
  onFeito: (o: Ocorrencia, falhas: string[]) => void
}) {
  const api = useApi()
  // Sem o backend de anexos (F4, desenho §6): o campo some e nada é enviado depois de criar.
  const anexosDisponiveis = api.suporta?.('anexos') !== false
  const catalogo = useCatalogo()
  // O tipo começa vazio (o porteiro escolhe; tudo virar "Outro" estraga o relatório), exceto quando o link já traz um
  const [tipo, setTipo] = useState<TipoOcorrencia | null>(
    (TIPOS as string[]).includes(inicial.tipo ?? '') ? (inicial.tipo as TipoOcorrencia) : null,
  )
  const [descricao, setDescricao] = useState('')
  // Local: unidade pelo mesmo seletor de bloco e apartamento da encomenda, ou área comum (escolha explícita)
  const daUnidadeInicial = inicial.unidade ? catalogo.porTexto(inicial.unidade, true) : undefined
  const [local, setLocal] = useState<'unidade' | 'comum'>('unidade')
  const [bloco, setBloco] = useState<string | null>(daUnidadeInicial?.bloco ?? null)
  const [numero, setNumero] = useState<string | null>(daUnidadeInicial?.numero ?? null)
  const [envolvidos, setEnvolvidos] = useState(inicial.envolvidos ?? '')
  const [moradores, setMoradores] = useState<Autorizador[]>([])
  const [arquivos, setArquivos] = useState<File[]>([])
  const [vinc, setVinc] = useState<string[]>(inicial.evento ? [inicial.evento] : [])
  const [mostrarEventos, setMostrarEventos] = useState(!!inicial.evento)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const unidadeId =
    local === 'unidade' && bloco && numero
      ? (catalogo.porBlocoNumero(bloco, numero)?.id ?? null)
      : null
  const problemas = [
    ...arquivos.map(problemaDoArquivo).filter((x): x is string => !!x),
    ...(arquivos.length > ANEXO_MAX_POR_OCORRENCIA
      ? [`No máximo ${ANEXO_MAX_POR_OCORRENCIA} anexos.`]
      : []),
  ]

  // Envolvidos sugeridos: moradores com vínculo válido na unidade (o campo continua livre)
  useEffect(() => {
    if (!unidadeId) {
      setMoradores([])
      return
    }
    let vivo = true
    api.vinculos
      .autorizadores(unidadeId)
      .then((r) => vivo && setMoradores(r))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [unidadeId, api])

  // Erro de validação some assim que o porteiro corrige
  useEffect(() => {
    setErro('')
  }, [tipo, local, unidadeId, descricao, arquivos])

  const nomesEnvolvidos = envolvidos
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  function alternarEnvolvido(nome: string) {
    const ja = nomesEnvolvidos.includes(nome)
    setEnvolvidos(
      (ja ? nomesEnvolvidos.filter((n) => n !== nome) : [...nomesEnvolvidos, nome]).join(', '),
    )
  }
  function adicionarArquivos(lista: FileList | null) {
    const novos = Array.from(lista ?? []).filter(
      (f) => !arquivos.some((a) => a.name === f.name && a.size === f.size),
    )
    setArquivos([...arquivos, ...novos])
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!tipo) {
      setErro('Escolha o tipo da ocorrência.')
      return
    }
    if (local === 'unidade' && !unidadeId) {
      setErro(
        `Escolha ${oAgrupamento(catalogo.agrupamento).toLowerCase()} e a unidade, ou marque Área comum.`,
      )
      return
    }
    if (!descricao.trim()) {
      setErro('Descreva o que aconteceu.')
      return
    }
    if (problemas.length) {
      setErro(problemas.join(' '))
      return
    }
    setSalvando(true)
    setErro('')
    let o: Ocorrencia
    try {
      o = await api.ocorrencias.criar({ tipo, descricao, unidadeId, envolvidos, eventoIds: vinc })
    } catch (err) {
      setErro(mensagemErro(err))
      setSalvando(false)
      return
    }
    // Anexos depois de criada, um por vez (cada um é cifrado e auditado na API). A ocorrência fica registrada mesmo se um falhar.
    const falhas: string[] = []
    for (const f of anexosDisponiveis ? arquivos : []) {
      try {
        await api.ocorrencias.anexar(o.id, f)
      } catch (err) {
        falhas.push(`${f.name}: ${mensagemErro(err)}`)
      }
    }
    onFeito(o, falhas)
  }

  const chip = (on: boolean) =>
    `h-[44px] rounded-full border px-[14px] text-[14px] lg:mouse:h-10 ${on ? 'border-[#0B5563] bg-[#0B5563] text-white' : 'border-[#B9C3CA] bg-white text-ink hover:bg-[#EEF2F4]'}`
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
  const resumo = [
    tipo ? ROTULO_TIPO_OCORRENCIA[tipo] : 'Tipo não escolhido',
    local === 'comum'
      ? 'Área comum'
      : unidadeId
        ? catalogo.codigo(unidadeId)
        : 'Unidade não escolhida',
    plural(vinc.length, 'evento vinculado', 'eventos vinculados'),
    plural(arquivos.length, 'anexo', 'anexos'),
  ]

  return (
    <Modal
      titulo="Nova ocorrência"
      tamanho="g"
      onClose={onClose}
      rodape={
        <>
          <Button
            type="submit"
            form="form-ocorrencia"
            variante="primario"
            grande
            className="flex-1"
            carregando={salvando}
          >
            Registrar ocorrência
          </Button>
          <Button grande atalho="Esc" onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      <form id="form-ocorrencia" onSubmit={salvar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="rot-tipo-oc" className="text-[14px] font-medium">
            Tipo
          </span>
          <div role="radiogroup" aria-labelledby="rot-tipo-oc" className="flex flex-wrap gap-1.5">
            {TIPOS.map((t, i) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                {...((tipo ? tipo === t : i === 0) ? { 'data-autofocus': true } : {})}
                onClick={() => setTipo(t)}
                className={chip(tipo === t)}
              >
                {ROTULO_TIPO_OCORRENCIA[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-[10px]">
          <div className="flex flex-wrap items-center gap-2">
            <span id="rot-local-oc" className="w-14 shrink-0 text-[14px] font-medium">
              Local
            </span>
            <div
              role="radiogroup"
              aria-labelledby="rot-local-oc"
              className="flex flex-wrap gap-1.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={local === 'unidade'}
                onClick={() => setLocal('unidade')}
                className={chip(local === 'unidade')}
              >
                Unidade
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={local === 'comum'}
                onClick={() => setLocal('comum')}
                className={chip(local === 'comum')}
              >
                Área comum
              </button>
            </div>
          </div>
          {local === 'unidade' && (
            <TowerUnitPicker
              variante="modal"
              bloco={bloco}
              numero={numero}
              onChange={(b, n) => {
                setBloco(b)
                setNumero(n)
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Field label="Envolvidos">
            <input
              className="input"
              value={envolvidos}
              onChange={(e) => setEnvolvidos(e.target.value)}
              placeholder="Nomes das pessoas envolvidas, separados por vírgula"
            />
          </Field>
          {moradores.length > 0 && (
            <div
              role="group"
              aria-label="Moradores da unidade"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[13px] text-[#56616B]">Moradores da unidade:</span>
              {moradores.map((m) => {
                const on = nomesEnvolvidos.includes(m.pessoa.nome)
                return (
                  <button
                    key={m.pessoa.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => alternarEnvolvido(m.pessoa.nome)}
                    className={`flex h-[44px] items-center gap-2 rounded-lg border-2 px-[12px] lg:mouse:h-10 ${on ? 'border-[#0B5563] bg-[#F0F8F9]' : 'border-[#DCE1E5] bg-white hover:border-[#9AA7B0]'}`}
                  >
                    {on && (
                      <Check className="h-4 w-4 text-[#0B5563]" strokeWidth={2.6} aria-hidden />
                    )}
                    <span className="font-medium">{m.pessoa.nome}</span>
                    <span className="text-[13px] text-[#56616B]">
                      {ROTULO_VINCULO[m.vinculo.tipo]}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <Field label="Descrição">
          <textarea
            className="input"
            rows={4}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que aconteceu, onde e quando"
          />
        </Field>

        {anexosDisponiveis && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[14px] font-medium">Anexos</span>
              <label
                htmlFor="anexos-oc"
                className="flex h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-[#B9C3CA] bg-white px-[14px] text-[14px] font-medium focus-within:outline focus-within:outline-2 focus-within:outline-[#0B5563] hover:bg-[#EEF2F4] lg:mouse:h-10"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Adicionar foto ou PDF
                <input
                  id="anexos-oc"
                  type="file"
                  multiple
                  accept={ACEITOS}
                  aria-label="Anexos"
                  className="sr-only"
                  onChange={(e) => {
                    adicionarArquivos(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
              <span className="text-[13px] text-[#56616B]">
                JPEG, PNG ou PDF, até {MB} MB cada, no máximo {ANEXO_MAX_POR_OCORRENCIA}
              </span>
            </div>
            {arquivos.length > 0 && (
              <ul aria-label="Arquivos escolhidos" className="flex flex-col gap-1">
                {arquivos.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-[#E1E6EA] bg-white px-3 py-1 text-[14px]"
                  >
                    <span className="min-w-0 truncate">
                      {f.name} <span className="text-[#56616B]">· {tamanho(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${f.name}`}
                      onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#56616B] hover:bg-[#EEF2F4] hover:text-ink"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {problemas.length > 0 && <Alert tom="ambar">{problemas.join(' ')}</Alert>}
          </div>
        )}

        <div className="rounded-[10px] border border-[#DCE1E5]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-[14px] py-[10px]">
            <span className="text-[14px] font-medium">
              Eventos de acesso vinculados{vinc.length > 0 ? ` (${vinc.length})` : ''}
            </span>
            <button
              type="button"
              aria-expanded={mostrarEventos}
              onClick={() => setMostrarEventos((v) => !v)}
              className="h-[44px] shrink-0 rounded-lg border border-[#0B5563] bg-white px-[14px] text-[14px] font-semibold text-[#0B5563] lg:mouse:h-10"
            >
              {mostrarEventos ? 'Ocultar' : 'Vincular eventos'}
            </button>
          </div>
          {mostrarEventos && (
            <SeletorEventos
              selecionados={vinc}
              onChange={setVinc}
              unidadePrimeiro={unidadeId ? catalogo.codigo(unidadeId) : null}
            />
          )}
        </div>

        <p
          aria-live="polite"
          className="rounded-lg bg-[#F3F5F6] px-[14px] py-[10px] text-[14px] text-[#33424B]"
        >
          <span className="text-[#56616B]">Vai registrar: </span>
          {resumo.map((r, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <span className={i < 2 ? 'font-semibold text-ink' : ''}>{r}</span>
            </span>
          ))}
        </p>
        {erro && (
          <Alert tom="vermelho" role="alert">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  )
}
