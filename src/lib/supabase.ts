// Cliente do Supabase. É a única porta do front para o backend (a API NestJS foi removida).
// Só a chave anon/publishable entra no bundle; a service_role nunca. O que a pessoa pode ler ou gravar é decidido
// no banco (app.ator() e app.exigir() em cada RPC), não aqui. Criado sob demanda: importar este módulo sem as
// variáveis de ambiente (testes) não quebra nada.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { criarArmazenamentoSessao, type ArmazenamentoSessao } from '../api/supabase/armazenamento';

export interface ClienteSupabase { cliente: SupabaseClient; chaveAnon: string; armazenamento: ArmazenamentoSessao }

export function criarClienteSupabase(): ClienteSupabase {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !chaveAnon) {
    throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver .env.example).');
  }
  const armazenamento = criarArmazenamentoSessao();
  const cliente = createClient(url, chaveAnon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: armazenamento },
  });
  return { cliente, chaveAnon, armazenamento };
}
