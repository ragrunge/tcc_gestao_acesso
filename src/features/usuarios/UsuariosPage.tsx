import { useState, type FormEvent } from 'react';
import { Clock, Copy, MessageSquareText, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, type NovoUsuarioInput, type SituacaoUsuario, type UsuarioComSenhaTemporaria } from '../../api';
import { useAuth, useCan } from '../../auth/AuthContext';
import { Alert } from '../../components/Alert';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { Cel, Lista, ListaCab, ListaLinha, Vazio } from '../../components/Table';
import { useToast } from '../../components/Toast';
import { BarraFiltros, CampoFiltro, CONTROLE, ContagemResultado, FiltroBusca, lerOpcao, naUrl, useFiltrosUrl } from '../../components/Filtros';
import { Paginacao, Totais } from '../../components/Paginacao';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Label } from '../../components/ui/label';
import { ROTULO_PAPEL, type Papel, type UsuarioSistema } from '@domain/types';
import { fmtDataHora } from '@domain/time';
import { mensagemErro, useAgora } from '../../app/useAsync';
import { ErroCarregar } from '../../components/Carregando';
import { avisoSenhaTemporaria, mensagemAcesso, validadeTexto } from './senhaTemporaria';
import { acoesDaLinha, papeisCriaveis, validarNovoUsuario } from './regras';
import { useAcoesUsuario, useListaUsuarios, useResumoUsuarios, useValorAtrasado } from './useUsuarios';

const COLUNAS = 'minmax(0,1.3fr) 150px 150px 150px 290px';
const PAPEIS = Object.keys(ROTULO_PAPEL) as Papel[];
const SITUACOES: readonly SituacaoUsuario[] = ['ativos', 'desativados'];

/** Senha temporária em exibição: vive só neste estado local e some ao fechar o modal. */
interface SenhaExibida extends UsuarioComSenhaTemporaria { motivo: 'criado' | 'redefinido' }

export function UsuariosPage() {
  const { usuario: eu } = useAuth();
  const { avisar } = useToast();
  const podeGerenciar = useCan('usuario.gerenciar');
  const gerenciaSindico = useCan('usuario.gerenciar_sindico');
  const { params, gravar } = useFiltrosUrl();
  const papel = lerOpcao(params.get('papel'), ['', ...PAPEIS] as ('' | Papel)[], '');
  const situacao = lerOpcao(params.get('sit'), ['', ...SITUACOES] as ('' | SituacaoUsuario)[], '');
  // Nome digitado é dado pessoal: fica só no estado (nunca na URL) e vai no corpo do POST.
  const [busca, setBusca] = useState('');
  const q = useValorAtrasado(busca.trim());
  const pag = useListaUsuarios({ q, papel, situacao }, podeGerenciar);
  const resumo = useResumoUsuarios(podeGerenciar).data;
  const agora = useAgora(30_000);
  const [senha, setSenha] = useState<SenhaExibida | null>(null);
  const acoes = useAcoesUsuario((r, motivo) => setSenha({ ...r, motivo }));
  const [novo, setNovo] = useState(false);
  const [desativar, setDesativar] = useState<UsuarioSistema | null>(null);
  const [redefinir, setRedefinir] = useState<UsuarioSistema | null>(null);
  const gestor = { id: eu?.id ?? '', gerenciaSindico };
  const filtrado = !!(q || papel || situacao);

  /** Ação de linha: sucesso vira toast; erro (403 de permissão, 409/422 de regra) vira toast vermelho com a mensagem da API. */
  async function executar(fn: () => Promise<unknown>, ok?: string) {
    try { await fn(); if (ok) avisar({ texto: ok }); } catch (e) { avisar({ tom: 'vermelho', texto: mensagemErro(e) }); }
  }
  const botao = 'h-[44px] rounded-lg lg:h-10 border px-3 text-[14px] bg-white';
  const lista = pag.consulta;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titulo="Usuários do sistema" descricao="Cada pessoa tem o próprio login. Senha nova é temporária (72 h) e precisa ser trocada na primeira entrada."
        acoes={podeGerenciar && <Button variante="primario" onClick={() => setNovo(true)}>Novo usuário</Button>} />
      <Totais rotulo="Usuários por situação e papel" itens={[
        { rotulo: 'Ativos', valor: resumo?.ativos },
        { rotulo: 'Desativados', valor: resumo?.desativados },
        ...PAPEIS.map((p) => ({ rotulo: `${ROTULO_PAPEL[p]} (ativos)`, valor: resumo?.porPapel[p] })),
      ]} />
      <BarraFiltros ativos={(busca.trim() ? 1 : 0) + (papel ? 1 : 0) + (situacao ? 1 : 0)} principalAtivo={!!busca.trim()}
        onLimpar={() => { setBusca(''); gravar({ papel: undefined, sit: undefined }); }}
        principal={<FiltroBusca rotulo="Buscar por nome ou login" value={busca} onChange={setBusca} />}>
        <CampoFiltro rotulo="Papel" largura="md:w-52">
          <select className={CONTROLE} value={papel} onChange={(e) => gravar({ papel: naUrl(e.target.value, '') })}>
            <option value="">Todos</option>{PAPEIS.map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Situação" largura="md:w-44">
          <select className={CONTROLE} value={situacao} onChange={(e) => gravar({ sit: naUrl(e.target.value, '') })}>
            <option value="">Todas</option><option value="ativos">Ativos</option><option value="desativados">Desativados</option>
          </select>
        </CampoFiltro>
      </BarraFiltros>
      {filtrado && pag.total !== null && <ContagemResultado n={pag.total} singular="usuário" plural="usuários" className="-mb-3 px-1" />}
      <div className="rounded-[10px] border border-[#DCE1E5] bg-white">
        {lista.error && <div className="p-4"><ErroCarregar mensagem={mensagemErro(lista.error)} onTentar={() => lista.refetch()} /></div>}
        <Lista legenda="Operadores do sistema" colunas={COLUNAS} empilhar className="!rounded-none !border-0" carregando={lista.isLoading}>
          <ListaCab rotulos={['Nome', 'Papel', 'Situação', 'Último acesso', 'Ações']} />
          {pag.itens.map((u) => {
            const a = acoesDaLinha(gestor, u);
            const aviso = avisoSenhaTemporaria(u, agora);
            const proprio = u.id === eu?.id;
            return (
              <ListaLinha key={u.id} minH={56} padY={8}>
                <Cel className="flex flex-col">
                  <span className="font-medium">{u.nome}{proprio && <span className="ml-2 text-[12px] font-normal text-[#56616B]">(você)</span>}</span>
                  <span className="font-mono text-[13px] text-[#56616B]">{u.login}</span>
                </Cel>
                <Cel className="text-[14px]">{ROTULO_PAPEL[u.papel]}</Cel>
                <Cel className="flex flex-col items-start gap-1">
                  {aviso
                    ? <><Badge tom={aviso.vencida ? 'vermelho' : 'ambar'} icone={Clock}>{aviso.selo}</Badge><span className={`text-[12px] ${aviso.vencida ? 'font-medium text-[#B42318]' : 'text-[#56616B]'}`}>{aviso.detalhe}</span></>
                    : <Badge tom={u.ativo ? 'verde' : 'neutro'}>{u.ativo ? 'Ativo' : 'Desativado'}</Badge>}
                </Cel>
                <Cel className="font-mono text-[13.5px]">{proprio ? <span className="font-sans text-[14px]">Agora (sessão atual)</span> : u.ultimoAcesso ? fmtDataHora(u.ultimoAcesso) : <span className="font-sans text-[14px] text-[#56616B]">Nunca</span>}</Cel>
                <Cel className="col-span-2 flex flex-wrap gap-2 md:col-span-1">
                  {a.motivo === 'so_sindico' && <span className="self-center text-[13px] text-[#56616B]">Só o síndico gerencia</span>}
                  {a.motivo === 'proprio' && u.ativo && <Link to="/trocar-senha" className={`${botao} inline-flex items-center border-[#B9C3CA] hover:bg-[#EEF2F4]`}>Trocar minha senha</Link>}
                  {a.redefinir && <button type="button" aria-label={`Nova senha temporária para ${u.nome}`} className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`} onClick={() => setRedefinir(u)}>Nova senha temporária</button>}
                  {a.desativar && <button type="button" aria-label={`Desativar ${u.nome}`} className={`${botao} border-[#FDA29B] text-[#B42318] hover:bg-[#FEF3F2]`} onClick={() => setDesativar(u)}>Desativar</button>}
                  {a.reativar && <button type="button" aria-label={`Reativar ${u.nome}`} className={`${botao} border-[#B9C3CA] hover:bg-[#EEF2F4]`}
                    onClick={() => void executar(() => acoes.reativar.mutateAsync(u.id), `${u.nome} reativado(a).`)}>Reativar</button>}
                </Cel>
              </ListaLinha>
            );
          })}
        </Lista>
        {!lista.isLoading && !lista.error && pag.itens.length === 0 && <Vazio>{filtrado ? 'Nenhum usuário nos filtros escolhidos.' : 'Nenhum usuário cadastrado.'}</Vazio>}
        {pag.totalPaginas > 1 && (
          <div className="border-t border-[#E6EAED] p-3">
            <Paginacao pagina={pag.pagina} totalPaginas={pag.totalPaginas} onIr={pag.irPara} rotulo="usuários" ocupado={pag.trocando} />
          </div>
        )}
      </div>

      {novo && <NovoUsuarioModal papeis={papeisCriaveis(gerenciaSindico)} onClose={() => setNovo(false)}
        onSalvar={async (f) => { await acoes.criar.mutateAsync(f); setNovo(false); }} />}
      {senha && <SenhaTemporariaModal senha={senha} onClose={() => setSenha(null)} />}
      {redefinir && (
        <Modal titulo={`Nova senha temporária para ${redefinir.nome}?`} tamanho="p" onClose={() => setRedefinir(null)}
          rodape={<>
            <Button variante="primario" grande className="flex-1" onClick={() => { const u = redefinir; setRedefinir(null); void executar(() => acoes.redefinirAcesso.mutateAsync(u.id)); }}>Gerar senha temporária</Button>
            <Button grande data-autofocus onClick={() => setRedefinir(null)}>Cancelar</Button>
          </>}>
          <p className="text-[15px] leading-[1.5]">Será gerada uma senha temporária. As sessões abertas de {redefinir.nome} são encerradas, e a troca de senha passa a ser obrigatória no próximo login.</p>
        </Modal>
      )}
      {desativar && (
        <Modal titulo={`Desativar ${desativar.nome}?`} tamanho="p" onClose={() => setDesativar(null)}
          rodape={<>
            <Button variante="perigo" grande className="flex-1" onClick={() => { const u = desativar; setDesativar(null); void executar(() => acoes.desativar.mutateAsync(u.id), `${u.nome} desativado(a). O histórico foi mantido.`); }}>Desativar</Button>
            <Button grande data-autofocus onClick={() => setDesativar(null)}>Cancelar</Button>
          </>}>
          <div className="flex gap-[10px] rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-[14px] py-3 text-[#7A2E0E]">
            <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span>O usuário perde o acesso imediatamente. O histórico do usuário é mantido e continua visível na auditoria: os registros feitos por ele permanecem na trilha com o nome dele.</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

type ErrosNovo = { nome?: string; login?: string; geral?: string };

/** Erro do servidor no campo certo (VALIDACAO com `field`, login repetido); o resto vai para o alerta do formulário. */
function errosDoServidor(e: unknown): ErrosNovo {
  if (e instanceof ApiError) {
    if (e.code === 'LOGIN_EXISTENTE') return { login: e.message };
    const campo = Array.isArray(e.detalhes) ? (e.detalhes[0] as { field?: unknown } | undefined)?.field : undefined;
    if (e.code === 'VALIDACAO' && (campo === 'nome' || campo === 'login')) return { [campo]: e.message };
  }
  return { geral: mensagemErro(e) };
}

function NovoUsuarioModal({ papeis, onClose, onSalvar }: { papeis: Papel[]; onClose: () => void; onSalvar: (f: NovoUsuarioInput) => Promise<void> }) {
  const [f, setF] = useState<{ nome: string; login: string; papel: Papel }>({ nome: '', login: '', papel: 'porteiro' });
  const [erros, setErros] = useState<ErrosNovo>({});
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const locais = validarNovoUsuario(f);
    setErros(locais);
    if (locais.nome || locais.login) return;
    setSalvando(true);
    try { await onSalvar({ nome: f.nome.trim(), login: f.login.trim().toLowerCase(), papel: f.papel }); } catch (err) { setErros(errosDoServidor(err)); setSalvando(false); }
  }
  return (
    <Modal titulo="Novo usuário" onClose={onClose}
      rodape={<><Button type="submit" form="f-user" variante="primario" grande className="flex-1" carregando={salvando}>Criar usuário</Button><Button grande onClick={onClose}>Cancelar</Button></>}>
      <form id="f-user" onSubmit={salvar} noValidate className="flex flex-col gap-[14px]">
        <Field label="Nome completo" erro={erros.nome}>
          <input data-autofocus className="input" autoComplete="off" value={f.nome} aria-invalid={erros.nome ? true : undefined} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Field>
        <Field label="Login" erro={erros.login} dica="Letras minúsculas, números, ponto, hífen ou sublinhado (ex.: nome.sobrenome).">
          <input className="input font-mono" autoComplete="off" autoCapitalize="none" spellCheck={false} value={f.login} aria-invalid={erros.login ? true : undefined}
            onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="nome.sobrenome" />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend id="rot-perfil" className="mb-1.5 text-[14px] font-medium">Papel</legend>
          <RadioGroup value={f.papel} onValueChange={(v) => setF({ ...f, papel: v as Papel })} aria-labelledby="rot-perfil" className="grid-cols-2 sm:grid-cols-4">
            {papeis.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-lg border border-[#B9C3CA] bg-white px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-claro">
                <RadioGroupItem id={`papel-${p}`} value={p} />
                <Label htmlFor={`papel-${p}`} className="cursor-pointer">{ROTULO_PAPEL[p]}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="rounded-lg bg-[#E3F0F2] px-3 py-[10px] text-[14px] text-[#0B4450]">A senha temporária aparece uma única vez, logo depois de criar.</div>
        {erros.geral && <Alert tom="vermelho" role="alert">{erros.geral}</Alert>}
      </form>
    </Modal>
  );
}

/**
 * Mostra a senha temporária UMA vez. Ao fechar, o estado da tela é zerado e a senha some da memória da UI
 * (não fica em contexto global, cache do React Query nem storage). A API também não a devolve de novo.
 */
function SenhaTemporariaModal({ senha, onClose }: { senha: SenhaExibida; onClose: () => void }) {
  const [copiado, setCopiado] = useState<'senha' | 'mensagem' | 'falhou' | null>(null);
  const expiraEm = senha.usuario.senhaTemporariaExpiraEm ?? null;
  const mensagem = mensagemAcesso({ login: senha.usuario.login, senhaTemporaria: senha.senhaTemporaria, expiraEm, origem: window.location.origin });
  async function copiar(texto: string, qual: 'senha' | 'mensagem') {
    try { await navigator.clipboard.writeText(texto); setCopiado(qual); } catch { setCopiado('falhou'); }
  }
  return (
    <Modal titulo={senha.motivo === 'criado' ? `Usuário ${senha.usuario.nome} criado` : `Acesso de ${senha.usuario.nome} redefinido`}
      tamanho="p" tom="petroleo" tituloId="modal-senha-temporaria" semFechar onClose={onClose}
      rodape={<Button variante="primario" grande className="flex-1" data-autofocus onClick={onClose}>Já copiei, fechar</Button>}>
      <div className="flex gap-[10px] rounded-lg border border-[#FEC84B] bg-[#FEF0C7] px-[14px] py-3 text-[#7A2E0E]">
        <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
        <span><strong>Copie agora.</strong> Esta senha temporária não será mostrada de novo. No primeiro acesso, {senha.usuario.nome} vai precisar trocá-la.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium">Login</span>
        <span className="font-mono text-[15px]">{senha.usuario.login}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="rot-senha-temp" className="text-[14px] font-medium">Senha temporária</span>
        <div className="flex flex-wrap items-center gap-2">
          <output aria-labelledby="rot-senha-temp" className="min-w-0 flex-1 select-all break-all rounded-lg border border-[#B9C3CA] bg-[#F6F8F9] px-[14px] py-[10px] font-mono text-[18px] tracking-[0.04em]">
            {senha.senhaTemporaria}
          </output>
          <Button onClick={() => void copiar(senha.senhaTemporaria, 'senha')}><Copy className="mr-1.5 inline h-4 w-4" aria-hidden />{copiado === 'senha' ? 'Copiada' : 'Copiar senha'}</Button>
        </div>
        <span className="text-[13px] text-[#56616B]">Digite com os hífens, só letras minúsculas e números.</span>
        {expiraEm != null && <span className="text-[14px] font-medium text-[#7A2E0E]">Válida até {validadeTexto(expiraEm)}. Depois disso, será preciso gerar outra.</span>}
      </div>
      <Button onClick={() => void copiar(mensagem, 'mensagem')}>
        <MessageSquareText className="mr-1.5 inline h-4 w-4" aria-hidden />{copiado === 'mensagem' ? 'Mensagem copiada' : 'Copiar mensagem com login, senha e endereço'}
      </Button>
      <span className="sr-only" aria-live="polite">{copiado === 'mensagem' ? 'Mensagem copiada.' : copiado === 'senha' ? 'Senha copiada.' : ''}</span>
      {copiado === 'falhou' && <Alert tom="ambar" role="alert">Não foi possível copiar. Selecione a senha e copie manualmente.</Alert>}
    </Modal>
  );
}
