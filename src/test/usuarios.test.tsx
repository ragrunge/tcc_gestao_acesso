// @vitest-environment jsdom
// Tela de Usuários (F5) com a API falsa: o que cada papel vê e pode acionar (espelho de srv.usuario_*, 0018), a senha
// temporária mostrada uma vez e nunca guardada (estado local só; nem cache do React Query, nem storage), erros do
// formulário (validação local com as mensagens do banco, erro do servidor no campo certo) e das ações de linha.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MATRIZ, ROTAS, pode } from '@domain/rbac';
import type { Papel, UsuarioSistema } from '@domain/types';
import { ApiProvider } from '../api';
import { ApiError, type Api, type Pagina, type ResumoUsuarios } from '../api/types';
import { ToastProvider } from '../components/Toast';
import { UsuariosPage } from '../features/usuarios/UsuariosPage';
import { acoesDaLinha, papeisCriaveis, validarNovoUsuario } from '../features/usuarios/regras';
import { useAcoesUsuario } from '../features/usuarios/useUsuarios';

const { sessao } = vi.hoisted(() => ({ sessao: { id: 'u-eu', nome: 'Eu', papel: 'sindico' as string } }));
vi.mock('../auth/AuthContext', async () => {
  const rbac = await import('@domain/rbac');
  return {
    useAuth: () => ({ usuario: sessao }),
    useCan: (a: Parameters<typeof rbac.pode>[1]) => rbac.pode(sessao.papel as Papel, a),
  };
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
});
afterEach(() => cleanup());

const SENHA = 'k7mq-x3rt-w9az-c2hp';
const u = (x: Partial<UsuarioSistema> & Pick<UsuarioSistema, 'id' | 'nome' | 'login' | 'papel'>): UsuarioSistema =>
  ({ ativo: true, ultimoAcesso: null, deveTrocarSenha: false, senhaTemporariaExpiraEm: null, ...x });
const EU = u({ id: 'u-eu', nome: 'Eu Mesmo', login: 'eu.mesmo', papel: 'sindico' });
const OUTRO_SINDICO = u({ id: 'u-s2', nome: 'Sílvio Souza', login: 'silvio.souza', papel: 'sindico' });
const ADMIN = u({ id: 'u-ad', nome: 'Paula Nogueira', login: 'paula.nogueira', papel: 'administracao' });
const PORTEIRO = u({ id: 'u-po', nome: 'João Lima', login: 'joao.lima', papel: 'porteiro' });
const DESLIGADO = u({ id: 'u-de', nome: 'Davi Dias', login: 'davi.dias', papel: 'porteiro', ativo: false });
const TODOS = [ADMIN, DESLIGADO, EU, PORTEIRO, OUTRO_SINDICO];
const RESUMO: ResumoUsuarios = { ativos: 4, desativados: 1, porPapel: { sindico: 2, administracao: 1, porteiro: 1, auditor: 0 } };

function apiFalsa(itens = TODOS) {
  const usuarios = {
    listarPagina: vi.fn(async (): Promise<Pagina<UsuarioSistema>> => ({ itens, cursor: null, temMais: false, total: itens.length })),
    resumo: vi.fn(async () => RESUMO),
    criar: vi.fn(async (i: { nome: string; login: string; papel: Papel }) => ({
      usuario: u({ id: 'u-novo', nome: i.nome, login: i.login, papel: i.papel, deveTrocarSenha: true, senhaTemporariaExpiraEm: Date.now() + 72 * 3600e3 }),
      senhaTemporaria: SENHA,
    })),
    desativar: vi.fn(async (id: string) => ({ ...TODOS.find((x) => x.id === id)!, ativo: false })),
    reativar: vi.fn(async (id: string) => ({ ...TODOS.find((x) => x.id === id)!, ativo: true })),
    redefinirAcesso: vi.fn(async (id: string) => ({ usuario: { ...TODOS.find((x) => x.id === id)!, deveTrocarSenha: true }, senhaTemporaria: SENHA })),
  };
  return { api: { usuarios } as unknown as Api, usuarios };
}

const local = { search: '' };
function Sonda() { local.search = useLocation().search; return null; }

function montar(papel: Papel, itens = TODOS, url = '/usuarios', preparar?: (f: ReturnType<typeof apiFalsa>) => void) {
  sessao.papel = papel;
  sessao.id = 'u-eu';
  const f = apiFalsa(itens);
  preparar?.(f);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}><ApiProvider api={f.api}><ToastProvider><MemoryRouter initialEntries={[url]}>
      <UsuariosPage /><Sonda />
    </MemoryRouter></ToastProvider></ApiProvider></QueryClientProvider>,
  );
  return { ...f, qc };
}

const linha = (nome: string) => screen.getByText(nome, { exact: true }).closest('[role="row"]') as HTMLElement;
const esperarLista = () => screen.findByText('João Lima', { exact: true });

describe('regras da tela (espelho de srv.usuario_*)', () => {
  const sindico = { id: 'eu', gerenciaSindico: true };
  const adm = { id: 'eu', gerenciaSindico: false };
  it('ninguém desativa nem redefine a si mesmo', () => {
    expect(acoesDaLinha(sindico, { id: 'eu', papel: 'sindico', ativo: true })).toEqual({ redefinir: false, desativar: false, reativar: false, motivo: 'proprio' });
    expect(acoesDaLinha(adm, { id: 'eu', papel: 'administracao', ativo: true }).motivo).toBe('proprio');
  });
  it('administração não mexe em síndico; síndico mexe em outro síndico', () => {
    expect(acoesDaLinha(adm, { id: 'x', papel: 'sindico', ativo: true })).toEqual({ redefinir: false, desativar: false, reativar: false, motivo: 'so_sindico' });
    expect(acoesDaLinha(adm, { id: 'x', papel: 'sindico', ativo: false }).reativar).toBe(false);
    expect(acoesDaLinha(sindico, { id: 'x', papel: 'sindico', ativo: true })).toMatchObject({ redefinir: true, desativar: true, reativar: false });
  });
  it('ativo: redefinir e desativar; desativado: só reativar', () => {
    expect(acoesDaLinha(adm, { id: 'x', papel: 'porteiro', ativo: true })).toEqual({ redefinir: true, desativar: true, reativar: false, motivo: null });
    expect(acoesDaLinha(adm, { id: 'x', papel: 'porteiro', ativo: false })).toEqual({ redefinir: false, desativar: false, reativar: true, motivo: null });
  });
  it('papéis que cada um cria', () => {
    expect(papeisCriaveis(true)).toEqual(['sindico', 'administracao', 'porteiro', 'auditor']);
    expect(papeisCriaveis(false)).toEqual(['administracao', 'porteiro', 'auditor']);
  });
  it('validação do formulário com as mensagens de app.validar_novo_usuario', () => {
    expect(validarNovoUsuario({ nome: 'Marcos Teixeira', login: 'marcos.t' })).toEqual({});
    expect(validarNovoUsuario({ nome: '  ab ', login: 'Marcos.T' })).toEqual({ nome: 'Nome: de 3 a 120 caracteres.' });
    expect(validarNovoUsuario({ nome: 'Marcos', login: '1marcos' }).login).toMatch(/começando por letra/);
    expect(validarNovoUsuario({ nome: 'Marcos', login: 'ma' }).login).toBeDefined();
    expect(validarNovoUsuario({ nome: 'Marcos', login: 'marcos teixeira' }).login).toBeDefined();
  });
  it('a rota de Usuários vale para quem tem usuario.gerenciar, e só para esses', () => {
    expect([...ROTAS.usuarios].sort()).toEqual([...MATRIZ['usuario.gerenciar']].sort());
  });
});

describe('UsuariosPage', () => {
  it('síndico: lista, totais do servidor, nenhuma ação na própria linha e ações nas demais (inclusive outro síndico)', async () => {
    const m = montar('sindico');
    await esperarLista();
    expect(m.usuarios.listarPagina).toHaveBeenCalledWith({ limite: 50, deslocamento: 0, q: undefined, papel: undefined, situacao: undefined });
    const totais = screen.getByLabelText('Usuários por situação e papel');
    expect(await within(totais).findByText('Síndico (ativos)')).toBeTruthy();
    expect(within(totais).getByText('Ativos').nextSibling?.textContent).toBe('4');

    const minha = linha('Eu Mesmo');
    expect(within(minha).queryByRole('button')).toBeNull();
    expect(within(minha).getByRole('link', { name: 'Trocar minha senha' })).toBeTruthy();
    expect(within(linha('Sílvio Souza')).getByRole('button', { name: 'Desativar Sílvio Souza' })).toBeTruthy();
    expect(within(linha('Davi Dias')).getByRole('button', { name: 'Reativar Davi Dias' })).toBeTruthy();
    expect(within(linha('Davi Dias')).queryByRole('button', { name: /Desativar/ })).toBeNull();
    // Nada de e-mail sintético nem id interno na tela.
    expect(document.body.textContent).not.toMatch(/portaria\.invalid|u-s2|u-po/);
  });

  it('administração: linha de síndico sem ação ("Só o síndico gerencia") e sem a opção Síndico ao criar', async () => {
    montar('administracao');
    await esperarLista();
    const s = linha('Sílvio Souza');
    expect(within(s).queryByRole('button')).toBeNull();
    expect(within(s).getByText('Só o síndico gerencia')).toBeTruthy();
    expect(within(linha('João Lima')).getByRole('button', { name: 'Desativar João Lima' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Novo usuário' });
    const radios = within(dialogo).getAllByRole('radio').map((r) => r.getAttribute('value'));
    expect(radios).toEqual(['administracao', 'porteiro', 'auditor']);
  });

  it('porteiro e auditor (sem usuario.gerenciar) nem pedem a lista nem o resumo', async () => {
    for (const papel of ['porteiro', 'auditor'] as Papel[]) {
      expect(pode(papel, 'usuario.gerenciar')).toBe(false);
      const m = montar(papel);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(m.usuarios.listarPagina).not.toHaveBeenCalled();
      expect(m.usuarios.resumo).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Novo usuário' })).toBeNull();
      cleanup();
    }
  });

  it('criar: login normalizado, senha temporária mostrada UMA vez, copiável, e some ao fechar sem ir a cache nem storage', async () => {
    const m = montar('sindico');
    const escrever = vi.fn(async (_t: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    await esperarLista();
    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Novo usuário' });
    expect(document.activeElement).toBe(within(dialogo).getByLabelText('Nome completo'));
    fireEvent.change(within(dialogo).getByLabelText('Nome completo'), { target: { value: '  Marcos Teixeira ' } });
    fireEvent.change(within(dialogo).getByLabelText('Login'), { target: { value: ' Marcos.Teixeira ' } });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Porteiro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));

    const senha = await screen.findByRole('dialog', { name: 'Usuário Marcos Teixeira criado' });
    expect(m.usuarios.criar).toHaveBeenCalledWith({ nome: 'Marcos Teixeira', login: 'marcos.teixeira', papel: 'porteiro' });
    expect(screen.queryByRole('dialog', { name: 'Novo usuário' })).toBeNull();
    expect(within(senha).getByText(SENHA)).toBeTruthy();
    fireEvent.click(within(senha).getByRole('button', { name: /Copiar senha/ }));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith(SENHA));
    expect(await within(senha).findByText('Senha copiada.')).toBeTruthy();

    const guardado = JSON.stringify([m.qc.getQueryCache().getAll().map((q) => q.state.data), m.qc.getMutationCache().getAll().map((x) => x.state)]);
    expect(guardado).not.toContain(SENHA);
    expect(JSON.stringify({ ...localStorage })).not.toContain(SENHA);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SENHA);

    fireEvent.click(within(senha).getByRole('button', { name: 'Já copiei, fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain(SENHA);
    await waitFor(() => expect(m.usuarios.listarPagina.mock.calls.length).toBeGreaterThan(1)); // lista invalidada
    expect(document.body.textContent).not.toContain(SENHA);
  });

  it('criar: validação local não chama o servidor; LOGIN_EXISTENTE aparece no campo; recusa de permissão no alerta', async () => {
    const m = montar('sindico');
    await esperarLista();
    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Novo usuário' });
    fireEvent.change(within(dialogo).getByLabelText('Nome completo'), { target: { value: 'Marcos Teixeira' } });
    fireEvent.change(within(dialogo).getByLabelText('Login'), { target: { value: '1x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));
    expect(await within(dialogo).findByText(/Login: 3 a 40 caracteres/)).toBeTruthy();
    expect(within(dialogo).getByLabelText('Login').getAttribute('aria-invalid')).toBe('true');
    expect(m.usuarios.criar).not.toHaveBeenCalled();

    m.usuarios.criar.mockRejectedValueOnce(new ApiError(409, 'LOGIN_EXISTENTE', 'Já existe um usuário com este login.'));
    fireEvent.change(within(dialogo).getByLabelText('Login'), { target: { value: 'joao.lima' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));
    const campo = within(dialogo).getByLabelText('Login');
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(campo.getAttribute('aria-describedby')!)!.textContent).toBe('Já existe um usuário com este login.');

    m.usuarios.criar.mockRejectedValueOnce(new ApiError(403, 'SEM_PERMISSAO', 'Só o síndico gerencia usuários com o papel de síndico.'));
    fireEvent.change(within(dialogo).getByLabelText('Login'), { target: { value: 'outro.login' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('Só o síndico gerencia usuários com o papel de síndico.');
    expect(screen.queryByRole('dialog', { name: /criado/ })).toBeNull();
  });

  it('redefinir: confirma, mostra a senha nova uma vez; desativar: confirma e mostra o erro do servidor em toast', async () => {
    const m = montar('administracao');
    await esperarLista();
    fireEvent.click(within(linha('João Lima')).getByRole('button', { name: 'Nova senha temporária para João Lima' }));
    const confirmar = await screen.findByRole('dialog', { name: 'Nova senha temporária para João Lima?' });
    expect(document.activeElement).toBe(within(confirmar).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(confirmar).getByRole('button', { name: 'Gerar senha temporária' }));
    const senha = await screen.findByRole('dialog', { name: 'Acesso de João Lima redefinido' });
    expect(m.usuarios.redefinirAcesso).toHaveBeenCalledWith('u-po');
    expect(within(senha).getByText(SENHA)).toBeTruthy();
    fireEvent.click(within(senha).getByRole('button', { name: 'Já copiei, fechar' }));
    await waitFor(() => expect(document.body.textContent).not.toContain(SENHA));

    m.usuarios.desativar.mockRejectedValueOnce(new ApiError(422, 'AUTO_DESATIVACAO', 'Você não pode desativar o próprio usuário.'));
    fireEvent.click(within(linha('João Lima')).getByRole('button', { name: 'Desativar João Lima' }));
    const d = await screen.findByRole('dialog', { name: 'Desativar João Lima?' });
    fireEvent.click(within(d).getByRole('button', { name: 'Desativar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Você não pode desativar o próprio usuário.');
    expect(m.usuarios.desativar).toHaveBeenCalledWith('u-po');
  });

  it('Esc fecha a confirmação de desativar sem desativar', async () => {
    const m = montar('sindico');
    await esperarLista();
    fireEvent.click(within(linha('João Lima')).getByRole('button', { name: 'Desativar João Lima' }));
    await screen.findByRole('dialog', { name: 'Desativar João Lima?' });
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(m.usuarios.desativar).not.toHaveBeenCalled();
  });

  it('filtros: papel e situação vão para a consulta; a busca (dado pessoal) vai aparada no corpo, depois da pausa, nunca na URL', async () => {
    const m = montar('sindico', TODOS, '/usuarios?papel=porteiro&sit=desativados');
    await esperarLista();
    expect(m.usuarios.listarPagina).toHaveBeenLastCalledWith(expect.objectContaining({ papel: 'porteiro', situacao: 'desativados' }));
    fireEvent.change(screen.getByLabelText('Buscar por nome ou login'), { target: { value: '  joão ' } });
    await waitFor(() => expect(m.usuarios.listarPagina).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'joão', papel: 'porteiro' })), { timeout: 2000 });
    expect(local.search).toBe('?papel=porteiro&sit=desativados');
  });

  it('erro ao carregar a lista: mensagem do servidor e "tentar de novo"', async () => {
    const m = montar('sindico', TODOS, '/usuarios', (f) => {
      f.usuarios.listarPagina.mockRejectedValueOnce(new ApiError(503, 'HTTP_503', 'O servidor não respondeu como esperado. Tente novamente em instantes.'));
    });
    expect(await screen.findByText(/O servidor não respondeu como esperado/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tentar/ }));
    await esperarLista();
    expect(m.usuarios.listarPagina).toHaveBeenCalledTimes(2);
  });
});

describe('useAcoesUsuario', () => {
  it('a senha vai só para o callback; o resultado da mutation (cache) é o usuário sem a senha', async () => {
    const f = apiFalsa();
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const recebida = vi.fn();
    const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><ApiProvider api={f.api}>{children}</ApiProvider></QueryClientProvider>;
    const { result } = renderHook(() => useAcoesUsuario(recebida), { wrapper: envolver });
    let r: unknown;
    await act(async () => { r = await result.current.criar.mutateAsync({ nome: 'Ana Souza', login: 'ana.souza', papel: 'auditor' }); });
    expect(recebida).toHaveBeenCalledWith(expect.objectContaining({ senhaTemporaria: SENHA }), 'criado');
    expect(JSON.stringify(r)).not.toContain(SENHA);
    expect(JSON.stringify(qc.getMutationCache().getAll().map((x) => x.state))).not.toContain(SENHA);
  });
});
