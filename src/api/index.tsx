import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import type { Api } from './types';
import { createSupabaseApi } from './supabase/createSupabaseApi';
import { criarClienteSupabase } from '../lib/supabase';

export * from './types';

/**
 * Cliente da API: Supabase (Auth + RPC + Edge Functions), desenho §6. Fase F1: auth e a gestão de contas pela Edge;
 * o resto responde NAO_MIGRADO até as fases seguintes (createSupabaseApi.ts).
 */
export function criarApi(): Api {
  const { cliente, chaveAnon, armazenamento } = criarClienteSupabase();
  return createSupabaseApi(cliente, { chaveAnon, armazenamento });
}

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api?: Api; children: ReactNode }) {
  const valor = useMemo(() => api ?? criarApi(), [api]);
  return createElement(ApiContext.Provider, { value: valor }, children);
}

export function useApi(): Api {
  const a = useContext(ApiContext);
  if (!a) throw new Error('useApi fora de <ApiProvider>');
  return a;
}
