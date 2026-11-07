import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApi, type ResultadoAnonimizacao } from '@/api'
import { useCan } from '@/auth/AuthContext'
import { Alert } from '@/componentes/Alert'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { useToast } from '@/componentes/Toast'
import { mensagemErro } from '@/app/useAsync'
import {
  APOS_DESATIVACAO,
  APOS_LGPD,
  APOS_PESSOA,
  APOS_VINCULO,
  CHAVES,
  useInvalidar,
} from '@/app/consultas'
import {
  mensagemSucesso,
  NovoVinculoModalLazy,
  precarregarNovoVinculo,
} from '@/paginas/vinculos/NovoVinculoLazy'
import { baixarArquivo } from '@/paginas/historico/download'
import { ErroCarregar } from '@/componentes/Carregando'
import { AlertaRetido, ConfirmarAnonimizacao } from './ficha/Anonimizacao'
import { CabecalhoFicha } from './ficha/CabecalhoFicha'
import { DesativarCadastroModal } from './ficha/DesativarCadastroModal'
import { EditarCadastro } from './ficha/EditarCadastro'
import { SecaoAcessos } from './ficha/SecaoAcessos'
import { SecaoVinculos, type VinculoFeito } from './ficha/SecaoVinculos'

/**
 * Ficha da pessoa. Para síndico e administração: correção do cadastro (LGPD art. 18 e RN-09), exportação dos dados do
 * titular (spec 9.3) e desativar/reativar o cadastro (RF-02: não exclui; a API recusa com a pessoa dentro, com vínculo
 * válido ou funcionário ativo, e revoga junto as autorizações prévias vigentes). Para o síndico: anonimização a pedido
 * (art. 18, VI). Para quem pode criar vínculo (vinculo.criar: síndico e administração; RN-03, o porteiro não): "Vincular a
 * uma unidade", o mesmo fluxo de "Incluir morador" da tela da unidade, partindo da pessoa (nasce pendente). A API decide;
 * a UI só oculta.
 */
export function FichaPessoaModal({ id, onClose }: { id: string; onClose: () => void }) {
  const api = useApi()
  const { avisar } = useToast()
  const podeEditar = useCan('pessoa.editar')
  const podeExportar = useCan('lgpd.exportar')
  const podeAnonimizar = useCan('lgpd.anonimizar')
  const podeDesativar = useCan('pessoa.desativar')
  const podeVincular = useCan('vinculo.criar')
  const [vinculando, setVinculando] = useState(false)
  const [vinculado, setVinculado] = useState<VinculoFeito | null>(null)
  useEffect(() => {
    if (podeVincular) precarregarNovoVinculo()
  }, [podeVincular])
  const [desativando, setDesativando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const invalidar = useInvalidar()
  const ficha = useQuery({
    queryKey: CHAVES.ficha(id),
    queryFn: () => api.pessoas.ficha(id),
    staleTime: 0,
  })
  const [editando, setEditando] = useState(false)
  const [anonimizando, setAnonimizando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoAnonimizacao | null>(null)
  const [erro, setErro] = useState('')
  const f = ficha.data
  const anonimizada = !!f?.pessoa.anonimizadaEm
  const desativada = !!f?.pessoa.desativadaEm

  async function exportar() {
    try {
      const p = await api.lgpd.exportarPessoa(id)
      baixarArquivo(p.nomeArquivo, p.conteudo, 'application/json')
      avisar({
        titulo: 'Dados exportados',
        texto: `Arquivo ${p.nomeArquivo} gerado. A exportação fica registrada na trilha.`,
      })
      void invalidar([['auditoria', 'alteracoes']]) // a exportação entra na trilha (lgpd.exportar)
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }
  async function anonimizar() {
    setErro('')
    try {
      const r = await api.lgpd.anonimizar(id)
      setResultado(r)
      setAnonimizando(false)
      avisar({
        tom: 'ambar',
        titulo: 'Pessoa anonimizada',
        texto: `Dados pessoais removidos; ${r.registrosRedigidos} registro(s) da trilha redigido(s).`,
      })
      void invalidar(APOS_LGPD)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }

  async function desativar() {
    const r = await api.pessoas.desativar(id, motivo)
    setDesativando(false)
    setMotivo('')
    avisar({
      tom: 'ambar',
      titulo: 'Cadastro desativado',
      texto: `${r.nome} não aparece mais nas buscas e não pode entrar.${r.autorizacoesRevogadas ? ` ${r.autorizacoesRevogadas} autorização(ões) prévia(s) revogada(s).` : ''} O histórico continua.`,
    })
    void invalidar(APOS_DESATIVACAO)
  }
  async function reativar() {
    try {
      const r = await api.pessoas.reativar(id)
      avisar({
        titulo: 'Cadastro reativado',
        texto: `${r.nome} volta a aparecer nas buscas. Autorizações revogadas não voltam.`,
      })
      void invalidar(APOS_DESATIVACAO)
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }

  // Vínculo no lugar da ficha (um modal só, como a desativação abaixo); Cancelar ou Esc voltam para a ficha.
  if (vinculando && f) {
    return (
      <NovoVinculoModalLazy
        titulo="Vincular a uma unidade"
        pessoaFixa={f.pessoa}
        vinculosConhecidos={f.vinculos}
        onClose={() => setVinculando(false)}
        onFeito={(v, resumo) => {
          setVinculando(false)
          setVinculado({ v, resumo })
          avisar({ texto: mensagemSucesso(v) })
          void invalidar(APOS_VINCULO) // ficha, unidade (moradores), fila e badge de pendentes, buscas
        }}
      />
    )
  }

  // Confirmação no lugar da ficha (um modal só: dois empilhados quebrariam o foco); Cancelar volta para a ficha.
  if (desativando && f) {
    return (
      <DesativarCadastroModal
        nome={f.pessoa.nome}
        motivo={motivo}
        setMotivo={setMotivo}
        onConfirmar={desativar}
        onClose={() => {
          setDesativando(false)
          setMotivo('')
        }}
      />
    )
  }

  return (
    <Modal
      titulo="Ficha da pessoa"
      tamanho="g"
      onClose={onClose}
      rodape={
        <>
          {f && !anonimizada && podeEditar && !editando && (
            <Button grande variante="contorno" onClick={() => setEditando(true)}>
              Editar cadastro
            </Button>
          )}
          {f && podeExportar && (
            <Button grande variante="contorno" onClick={() => void exportar()}>
              Exportar dados (LGPD)
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-[10px]">
            {f && !anonimizada && podeDesativar && !desativada && (
              <Button grande variante="perigoContorno" onClick={() => setDesativando(true)}>
                Desativar cadastro
              </Button>
            )}
            {f && !anonimizada && podeDesativar && desativada && (
              <Button grande onClick={() => void reativar()}>
                Reativar cadastro
              </Button>
            )}
            {f && !anonimizada && podeAnonimizar && !anonimizando && (
              <Button
                grande
                variante="perigoContorno"
                onClick={() => {
                  setAnonimizando(true)
                  setErro('')
                }}
              >
                Anonimizar…
              </Button>
            )}
          </div>
        </>
      }
    >
      {ficha.error && (
        <ErroCarregar mensagem={mensagemErro(ficha.error)} onTentar={() => ficha.refetch()} />
      )}
      {f && (
        <div className="flex flex-col gap-5">
          <CabecalhoFicha pessoa={f.pessoa} desativada={desativada} anonimizada={anonimizada} />
          {resultado && <AlertaRetido resultado={resultado} />}
          {anonimizando && (
            <ConfirmarAnonimizacao
              nome={f.pessoa.nome}
              erro={erro}
              onConfirmar={() => void anonimizar()}
              onCancelar={() => setAnonimizando(false)}
            />
          )}
          {editando && (
            <EditarCadastro
              pessoa={f.pessoa}
              onCancelar={() => setEditando(false)}
              onSalvo={() => {
                setEditando(false)
                avisar({
                  texto: 'Cadastro atualizado. Antes e depois ficam na trilha de alterações.',
                })
                void invalidar(APOS_PESSOA)
              }}
            />
          )}
          {f.funcionario && (
            <Alert tom="petroleo">
              Funcionário do condomínio: {f.funcionario.funcao}. Escala{' '}
              {f.funcionario.escala.horaInicio}–{f.funcionario.escala.horaFim}.
            </Alert>
          )}
          <SecaoVinculos
            vinculos={f.vinculos}
            podeVincular={podeVincular}
            anonimizada={anonimizada}
            desativada={desativada}
            vinculado={vinculado}
            onVincular={() => {
              setVinculado(null)
              setVinculando(true)
            }}
            onClose={onClose}
          />
          <SecaoAcessos eventos={f.eventos} />
        </div>
      )}
    </Modal>
  )
}
