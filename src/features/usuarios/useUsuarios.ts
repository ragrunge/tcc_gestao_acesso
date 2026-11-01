// Server state de usuários (React Query v5). A senha temporária NÃO passa pelo cache: as mutations que a recebem
// entregam a senha a `aoReceberSenha` (estado local da tela) e devolvem ao React Query só o usuário.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi, type NovoUsuarioInput, type SituacaoUsuario, type UsuarioComSenhaTemporaria } from '../../api';
import { usePaginacao } from '../../app/paginacao';
import type { Papel, UsuarioSistema } from '@domain/types';

export const CHAVE_USUARIOS = ['usuarios'] as const;

export interface FiltrosUsuarios { q: string; papel: Papel | ''; situacao: SituacaoUsuario | '' }

/** `habilitado`: quem não gerencia usuários nem chega a pedir a lista (evita 403 à toa). */
export function useListaUsuarios(f: FiltrosUsuarios, habilitado: boolean) {
  const api = useApi();
  return usePaginacao<UsuarioSistema>({
    chave: [...CHAVE_USUARIOS, 'lista', f.q, f.papel, f.situacao],
    buscar: (pos) => api.usuarios.listarPagina({ ...pos, q: f.q || undefined, papel: f.papel || undefined, situacao: f.situacao || undefined }),
    habilitado,
  });
}

export function useResumoUsuarios(habilitado: boolean) {
  const api = useApi();
  return useQuery({ queryKey: [...CHAVE_USUARIOS, 'resumo'], queryFn: () => api.usuarios.resumo(), enabled: habilitado, staleTime: 0 });
}

/** Valor que só muda depois de `ms` sem alteração (busca digitada). */
export function useValorAtrasado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function useAcoesUsuario(aoReceberSenha: (r: UsuarioComSenhaTemporaria, origem: 'criado' | 'redefinido') => void) {
  const api = useApi();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: CHAVE_USUARIOS });
  const comSenha = (r: UsuarioComSenhaTemporaria, origem: 'criado' | 'redefinido') => { aoReceberSenha(r, origem); return r.usuario; };

  return {
    criar: useMutation({
      mutationFn: async (i: NovoUsuarioInput) => comSenha(await api.usuarios.criar(i), 'criado'),
      onSuccess: invalidar,
    }),
    redefinirAcesso: useMutation({
      mutationFn: async (id: string) => comSenha(await api.usuarios.redefinirAcesso(id), 'redefinido'),
      onSuccess: invalidar,
    }),
    // 403/409 também invalidam: a linha volta ao estado que o servidor tem.
    desativar: useMutation({ mutationFn: (id: string) => api.usuarios.desativar(id), onSettled: invalidar }),
    reativar: useMutation({ mutationFn: (id: string) => api.usuarios.reativar(id), onSettled: invalidar }),
  };
}
