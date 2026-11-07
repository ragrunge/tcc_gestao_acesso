import { useState } from 'react'
import { Clock, KeyRound, Pencil, TriangleAlert, UserCheck, UserX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { type SituacaoUsuario } from '@/api'
import { useAuth, useCan } from '@/auth/AuthContext'
import { Badge } from '@/componentes/Badge'
import { Button } from '@/componentes/Button'
import { Modal } from '@/componentes/Modal'
import { PageHeader } from '@/componentes/PageHeader'
import { Cel, Lista, ListaCab, ListaLinha, Vazio } from '@/componentes/Table'
import { useToast } from '@/componentes/Toast'
import {
  BarraFiltros,
  CampoFiltro,
  CONTROLE,
  ContagemResultado,
  FiltroBusca,
  lerOpcao,
  naUrl,
  useFiltrosUrl,
} from '@/componentes/Filtros'
import { Paginacao, Totais } from '@/componentes/Paginacao'
import { ROTULO_PAPEL, type Papel, type UsuarioSistema } from '@/domain/types'
import { fmtDataHora } from '@/domain/time'
import { mensagemErro, useAgora } from '@/app/useAsync'
import { ErroCarregar } from '@/componentes/Carregando'
import { avisoSenhaTemporaria } from './senhaTemporaria'
import { acoesDaLinha, papeisCriaveis } from './regras'
import {
  useAcoesUsuario,
  useListaUsuarios,
  useResumoUsuarios,
  useValorAtrasado,
} from './useUsuarios'
import { SenhaExibida } from './tipos'
import { NovoUsuarioModal } from './NovoUsuarioModal'
import { EditarUsuarioModal } from './EditarUsuarioModal'
import { SenhaTemporariaModal } from './SenhaTemporariaModal'

const COLUNAS = 'minmax(0,1.3fr) 150px 150px 150px 176px'

/** Administração (usuario.ver sem usuario.gerenciar): a lista e os totais, sem a coluna de ações. */
const COLUNAS_LEITURA = 'minmax(0,1.3fr) 150px 150px 150px'

const PAPEIS = Object.keys(ROTULO_PAPEL) as Papel[]

const SITUACOES: readonly SituacaoUsuario[] = ['ativos', 'desativados']

export function UsuariosPage() {
  const { usuario: eu } = useAuth()
  const { avisar } = useToast()
  const podeVer = useCan('usuario.ver')
  const podeGerenciar = useCan('usuario.gerenciar')
  const gerenciaSindico = useCan('usuario.gerenciar_sindico')
  const { params, gravar } = useFiltrosUrl()
  const papel = lerOpcao(params.get('papel'), ['', ...PAPEIS] as ('' | Papel)[], '')
  const situacao = lerOpcao(params.get('sit'), ['', ...SITUACOES] as ('' | SituacaoUsuario)[], '')
  // Nome digitado é dado pessoal: fica só no estado (nunca na URL) e vai no corpo do POST.
  const [busca, setBusca] = useState('')
  const q = useValorAtrasado(busca.trim())
  const pag = useListaUsuarios({ q, papel, situacao }, podeVer)
  const resumo = useResumoUsuarios(podeVer).data
  const agora = useAgora(30_000)
  const [senha, setSenha] = useState<SenhaExibida | null>(null)
  const acoes = useAcoesUsuario((r, motivo) => setSenha({ ...r, motivo }))
  const [novo, setNovo] = useState(false)
  const [editar, setEditar] = useState<UsuarioSistema | null>(null)
  const [desativar, setDesativar] = useState<UsuarioSistema | null>(null)
  const [redefinir, setRedefinir] = useState<UsuarioSistema | null>(null)
  const gestor = { id: eu?.id ?? '', gerenciaSindico }
  const filtrado = !!(q || papel || situacao)

  /** Ação de linha: sucesso vira toast; erro (403 de permissão, 409/422 de regra) vira toast vermelho com a mensagem da API. */
  async function executar(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn()
      if (ok) avisar({ texto: ok })
    } catch (e) {
      avisar({ tom: 'vermelho', texto: mensagemErro(e) })
    }
  }
  // Ícone com rótulo só no empilhado (celular, sem hover); de md para cima, quadrado com `title` e nome acessível.
  const botao =
    'inline-flex h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-[14px] md:w-[44px] md:px-0 md:mouse:h-10 md:mouse:w-10'
  const rotulo = (t: string) => <span className="md:hidden">{t}</span>
  const lista = pag.consulta

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Usuários do sistema"
        descricao="Cada pessoa tem o próprio login. Senha nova é temporária (72 h) e precisa ser trocada na primeira entrada."
        acoes={
          podeGerenciar ? (
            <Button variante="primario" onClick={() => setNovo(true)}>
              Novo usuário
            </Button>
          ) : (
            // Sem a coluna de ações, a troca voluntária da própria senha fica no cabeçalho.
            <Link
              to="/trocar-senha"
              className="inline-flex h-[44px] items-center rounded-lg border border-[#B9C3CA] bg-white px-3 text-[14px] hover:bg-[#EEF2F4] lg:mouse:h-10"
            >
              Trocar minha senha
            </Link>
          )
        }
      />
      <Totais
        rotulo="Usuários por situação e papel"
        itens={[
          { rotulo: 'Ativos', valor: resumo?.ativos },
          { rotulo: 'Desativados', valor: resumo?.desativados },
          ...PAPEIS.map((p) => ({
            rotulo: `${ROTULO_PAPEL[p]} (ativos)`,
            valor: resumo?.porPapel[p],
          })),
        ]}
      />
      <BarraFiltros
        ativos={(busca.trim() ? 1 : 0) + (papel ? 1 : 0) + (situacao ? 1 : 0)}
        principalAtivo={!!busca.trim()}
        onLimpar={() => {
          setBusca('')
          gravar({ papel: undefined, sit: undefined })
        }}
        principal={
          <FiltroBusca rotulo="Buscar por nome ou login" value={busca} onChange={setBusca} />
        }
      >
        <CampoFiltro rotulo="Papel" largura="md:w-52">
          <select
            className={CONTROLE}
            value={papel}
            onChange={(e) => gravar({ papel: naUrl(e.target.value, '') })}
          >
            <option value="">Todos</option>
            {PAPEIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Situação" largura="md:w-44">
          <select
            className={CONTROLE}
            value={situacao}
            onChange={(e) => gravar({ sit: naUrl(e.target.value, '') })}
          >
            <option value="">Todas</option>
            <option value="ativos">Ativos</option>
            <option value="desativados">Desativados</option>
          </select>
        </CampoFiltro>
      </BarraFiltros>
      {filtrado && pag.total !== null && (
        <ContagemResultado
          n={pag.total}
          singular="usuário"
          plural="usuários"
          className="-mb-3 px-1"
        />
      )}
      <div className="rounded-[10px] border border-[#DCE1E5] bg-white">
        {lista.error && (
          <div className="p-4">
            <ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} />
          </div>
        )}
        <Lista
          legenda="Operadores do sistema"
          colunas={podeGerenciar ? COLUNAS : COLUNAS_LEITURA}
          empilhar
          className="!rounded-none !border-0"
          carregando={lista.isLoading}
        >
          <ListaCab
            rotulos={[
              'Nome',
              'Papel',
              'Situação',
              'Último acesso',
              ...(podeGerenciar ? ['Ações'] : []),
            ]}
          />
          {pag.itens.map((u) => {
            const a = acoesDaLinha(gestor, u)
            const aviso = avisoSenhaTemporaria(u, agora)
            const proprio = u.id === eu?.id
            return (
              <ListaLinha key={u.id} minH={56} padY={8}>
                <Cel className="flex flex-col">
                  <span className="font-medium">
                    {u.nome}
                    {proprio && (
                      <span className="ml-2 text-[12px] font-normal text-[#56616B]">(você)</span>
                    )}
                  </span>
                  <span className="font-mono text-[13px] text-[#56616B]">{u.login}</span>
                </Cel>
                <Cel className="text-[14px]">{ROTULO_PAPEL[u.papel]}</Cel>
                <Cel className="flex flex-col items-start gap-1">
                  {aviso ? (
                    <>
                      <Badge tom={aviso.vencida ? 'vermelho' : 'ambar'} icone={Clock}>
                        {aviso.selo}
                      </Badge>
                      <span
                        className={`text-[12px] ${aviso.vencida ? 'font-medium text-[#B42318]' : 'text-[#56616B]'}`}
                      >
                        {aviso.detalhe}
                      </span>
                    </>
                  ) : (
                    <Badge tom={u.ativo ? 'verde' : 'neutro'}>
                      {u.ativo ? 'Ativo' : 'Desativado'}
                    </Badge>
                  )}
                </Cel>
                <Cel className="font-mono text-[13.5px]">
                  {proprio ? (
                    <span className="font-sans text-[14px]">Agora (sessão atual)</span>
                  ) : u.ultimoAcesso ? (
                    fmtDataHora(u.ultimoAcesso)
                  ) : (
                    <span className="font-sans text-[14px] text-[#56616B]">Nunca</span>
                  )}
                </Cel>
                {podeGerenciar && (
                  <Cel className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                    {a.motivo === 'so_sindico' && (
                      <span className="text-[13px] text-[#56616B]">Só o síndico gerencia</span>
                    )}
                    {a.editar && (
                      <button
                        type="button"
                        aria-label={`Editar ${u.nome}`}
                        title="Editar"
                        className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`}
                        onClick={() => setEditar(u)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                        {rotulo('Editar')}
                      </button>
                    )}
                    {a.motivo === 'proprio' && u.ativo && (
                      <Link
                        to="/trocar-senha"
                        aria-label="Trocar minha senha"
                        title="Trocar minha senha"
                        className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                        {rotulo('Trocar minha senha')}
                      </Link>
                    )}
                    {a.redefinir && (
                      <button
                        type="button"
                        aria-label={`Nova senha temporária para ${u.nome}`}
                        title="Nova senha temporária"
                        className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`}
                        onClick={() => setRedefinir(u)}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                        {rotulo('Nova senha temporária')}
                      </button>
                    )}
                    {a.desativar && (
                      <button
                        type="button"
                        aria-label={`Desativar ${u.nome}`}
                        title="Desativar"
                        className={`${botao} border-[#FDA29B] text-[#B42318] hover:bg-[#FEF3F2]`}
                        onClick={() => setDesativar(u)}
                      >
                        <UserX className="h-4 w-4" aria-hidden />
                        {rotulo('Desativar')}
                      </button>
                    )}
                    {a.reativar && (
                      <button
                        type="button"
                        aria-label={`Reativar ${u.nome}`}
                        title="Reativar"
                        className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`}
                        onClick={() =>
                          void executar(
                            () => acoes.reativar.mutateAsync(u.id),
                            `${u.nome} reativado(a).`,
                          )
                        }
                      >
                        <UserCheck className="h-4 w-4" aria-hidden />
                        {rotulo('Reativar')}
                      </button>
                    )}
                  </Cel>
                )}
              </ListaLinha>
            )
          })}
        </Lista>
        {!lista.isLoading && !lista.error && pag.itens.length === 0 && (
          <Vazio>
            {filtrado ? 'Nenhum usuário nos filtros escolhidos.' : 'Nenhum usuário cadastrado.'}
          </Vazio>
        )}
        {pag.totalPaginas > 1 && (
          <div className="border-t border-[#E6EAED] p-3">
            <Paginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              onIr={pag.irPara}
              rotulo="usuários"
              ocupado={pag.trocando}
            />
          </div>
        )}
      </div>

      {novo && (
        <NovoUsuarioModal
          papeis={papeisCriaveis(gerenciaSindico)}
          onClose={() => setNovo(false)}
          onSalvar={async (f) => {
            await acoes.criar.mutateAsync(f)
            setNovo(false)
          }}
        />
      )}
      {editar && (
        <EditarUsuarioModal
          usuario={editar}
          proprio={editar.id === eu?.id}
          papeis={papeisCriaveis(gerenciaSindico)}
          onClose={() => setEditar(null)}
          onSalvar={async (i) => {
            if (Object.keys(i).length > 0) {
              await acoes.editar.mutateAsync({ id: editar.id, ...i })
              avisar({ texto: `Dados de ${i.nome ?? editar.nome} atualizados.` })
            }
            setEditar(null)
          }}
        />
      )}
      {senha && <SenhaTemporariaModal senha={senha} onClose={() => setSenha(null)} />}
      {redefinir && (
        <Modal
          titulo={`Nova senha temporária para ${redefinir.nome}?`}
          tamanho="p"
          onClose={() => setRedefinir(null)}
          rodape={
            <>
              <Button
                variante="primario"
                grande
                className="flex-1"
                onClick={() => {
                  const u = redefinir
                  setRedefinir(null)
                  void executar(() => acoes.redefinirAcesso.mutateAsync(u.id))
                }}
              >
                Gerar senha temporária
              </Button>
              <Button grande data-autofocus onClick={() => setRedefinir(null)}>
                Cancelar
              </Button>
            </>
          }
        >
          <p className="text-[15px] leading-[1.5]">
            Será gerada uma senha temporária. As sessões abertas de {redefinir.nome} são encerradas,
            e a troca de senha passa a ser obrigatória no próximo login.
          </p>
        </Modal>
      )}
      {desativar && (
        <Modal
          titulo={`Desativar ${desativar.nome}?`}
          tamanho="p"
          onClose={() => setDesativar(null)}
          rodape={
            <>
              <Button
                variante="perigo"
                grande
                className="flex-1"
                onClick={() => {
                  const u = desativar
                  setDesativar(null)
                  void executar(
                    () => acoes.desativar.mutateAsync(u.id),
                    `${u.nome} desativado(a). O histórico foi mantido.`,
                  )
                }}
              >
                Desativar
              </Button>
              <Button grande data-autofocus onClick={() => setDesativar(null)}>
                Cancelar
              </Button>
            </>
          }
        >
          <div className="flex gap-[10px] rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-[14px] py-3 text-[#7A2E0E]">
            <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span>
              O usuário perde o acesso imediatamente. O histórico do usuário é mantido e continua
              visível na auditoria: os registros feitos por ele permanecem na trilha com o nome
              dele.
            </span>
          </div>
        </Modal>
      )}
    </div>
  )
}
