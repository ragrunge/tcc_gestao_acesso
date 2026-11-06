import type { CSSProperties, RefObject } from 'react'
import { Check } from 'lucide-react'
import type { Autorizador, AutorizacaoView, PessoaBusca } from '@/api'
import { Alert } from '@/componentes/Alert'
import { descreverHorario, descreverJanela, meioComMorador } from '@/domain/rules'
import type { Funcionario, MeioAutorizacao } from '@/domain/types'
import { fmtData } from '@/domain/time'
import { AlertaEscala } from './AlertaEscala'
import { ExcecaoPorteiro } from './ExcecaoPorteiro'
import { MEIOS_VISIVEIS, rotulosMeio } from './constantes'
import { SeletorMorador } from './SeletorMorador'

type Props = {
  pessoa: PessoaBusca | null
  bloqueado: boolean
  carregandoUnidade: boolean
  emArea: boolean
  semCpf: boolean
  previaValida: AutorizacaoView | undefined
  previaFora: AutorizacaoView | undefined
  grupoMeioRef: RefObject<HTMLFieldSetElement>
  motivoMeioBloqueado: (m: MeioAutorizacao) => string | null
  meio: MeioAutorizacao | null
  escolherMeio: (m: MeioAutorizacao) => void
  residenteId: string | null
  setResidenteId: (id: string) => void
  autorizadores: Autorizador[]
  codUnidade: string | null
  podeRecusar: boolean
  recusando: boolean
  registrarRecusa: () => Promise<void>
  nomeUsuario: string
  justificativa: string
  setJustificativa: (v: string) => void
  funcionario: Funcionario | null
  instante: number
  erro: string
}

export function PassoAutorizacao(p: Props) {
  const {
    pessoa,
    carregandoUnidade,
    emArea,
    semCpf,
    previaValida,
    previaFora,
    grupoMeioRef,
    motivoMeioBloqueado,
    meio,
    escolherMeio,
    residenteId,
    setResidenteId,
    autorizadores,
    codUnidade,
    podeRecusar,
    recusando,
    registrarRecusa,
    nomeUsuario,
    justificativa,
    setJustificativa,
    funcionario,
    instante,
    erro,
  } = p
  const meiosVisiveis = MEIOS_VISIVEIS
  const LABEL_MEIO = rotulosMeio(emArea)
  return p.bloqueado ? (
    <div className="flex flex-col gap-2">
      <div
        aria-label="Meios de autorização, ainda bloqueados"
        role="group"
        className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
        style={{ '--n': meiosVisiveis.length } as CSSProperties}
      >
        {meiosVisiveis.map((m) => (
          <div
            key={m}
            aria-disabled="true"
            className="flex min-h-[76px] flex-col gap-1 rounded-[10px] border-2 border-[#DCE1E5] bg-white p-3 opacity-60"
          >
            <span className="font-semibold">{LABEL_MEIO[m][0]}</span>
            <span className="text-[13px] text-[#56616B]">
              {motivoMeioBloqueado(m) ??
                (carregandoUnidade
                  ? 'Verificando a unidade…'
                  : !pessoa
                    ? 'Escolha a pessoa primeiro'
                    : 'Escolha a unidade primeiro')}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-[#56616B]">
        {carregandoUnidade
          ? 'Verificando restrições e autorizações…'
          : 'O sistema confere restrições e autorizações prévias da unidade antes de liberar esta etapa.'}
      </p>
    </div>
  ) : (
    <div className="flex flex-col gap-[14px]">
      {previaValida && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[10px] border border-[#75E0A7] bg-[#DCFAE6] p-4 text-[#05603A]"
        >
          <Check className="h-[22px] w-[22px] shrink-0" strokeWidth={2.4} aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-[16px] font-semibold">
              Autorização prévia{' '}
              {previaValida.areaComumId
                ? 'da administração'
                : previaValida.semSolicitante
                  ? 'sem solicitante'
                  : `de ${previaValida.solicitadaPorNome}`}{' '}
              ({previaValida.unidadeRotulo}), válida até {fmtData(previaValida.validaAte)},{' '}
              {descreverJanela(previaValida)}.
            </span>
            <span className="text-[14px]">
              Autorizador preenchido automaticamente. Sem restrições para esta unidade.
            </span>
          </div>
        </div>
      )}
      {previaFora && (
        <Alert
          tom="ambar"
          titulo={`Autorização prévia fora do horário (${descreverHorario(previaFora)})`}
          role="status"
        >
          Válida até {fmtData(previaFora.validaAte)}, {descreverJanela(previaFora)}. Neste momento
          ela não vale: escolha outro meio de autorização.
        </Alert>
      )}

      {semCpf && (
        <Alert tom="ambar" titulo="Pessoa cadastrada sem CPF">
          Só pode entrar por exceção do porteiro, com justificativa. Interfone, celular, morador
          presente e autorização prévia ficam desabilitados.
        </Alert>
      )}

      <fieldset
        ref={grupoMeioRef}
        className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
        style={{ '--n': Math.max(meiosVisiveis.length, 1) } as CSSProperties}
      >
        <legend className="sr-only">Meio de autorização</legend>
        {meiosVisiveis.map((m) => {
          const bloqueioSemCpf = semCpf && m !== 'excecao_porteiro'
          const naoVale = motivoMeioBloqueado(m)
          const desabilitado =
            !!naoVale || (m === 'autorizacao_previa' && !previaValida) || bloqueioSemCpf
          const [titulo, desc] = LABEL_MEIO[m]
          return (
            <label
              key={m}
              className={`flex min-h-[76px] flex-col gap-1 rounded-[10px] border-2 p-3 text-left [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-[3px] [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-[#0B5563] ${
                meio === m ? 'border-[#0B5563] bg-[#F0F8F9]' : 'border-[#DCE1E5] bg-white'
              } ${desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[#9AA7B0]'}`}
            >
              <input
                type="radio"
                name="meio"
                className="sr-only"
                disabled={desabilitado}
                checked={meio === m}
                onChange={() => escolherMeio(m)}
              />
              <span className="font-semibold">{titulo}</span>
              <span className="text-[13px] text-[#56616B]">
                {desabilitado
                  ? (naoVale ??
                    (bloqueioSemCpf
                      ? 'Pessoa sem CPF'
                      : previaFora
                        ? 'Fora da janela de horário'
                        : 'Sem autorização válida'))
                  : desc}
              </span>
            </label>
          )
        })}
      </fieldset>

      {meioComMorador(meio) && (
        <SeletorMorador
          autorizadores={autorizadores}
          codUnidade={codUnidade}
          residenteId={residenteId}
          setResidenteId={setResidenteId}
          podeRecusar={podeRecusar}
          recusando={recusando}
          registrarRecusa={registrarRecusa}
        />
      )}

      {meio === 'excecao_porteiro' && (
        <ExcecaoPorteiro
          nomeUsuario={nomeUsuario}
          justificativa={justificativa}
          setJustificativa={setJustificativa}
        />
      )}

      {meio === 'escala' && <AlertaEscala funcionario={funcionario} instante={instante} />}

      {erro && (
        <Alert tom="vermelho" role="alert">
          {erro}
        </Alert>
      )}
    </div>
  )
}
