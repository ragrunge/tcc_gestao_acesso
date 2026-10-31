// Cliente do Supabase. É a única porta do front para o backend (a API NestJS foi removida).
// Só a chave anon/publishable entra no bundle; a service_role nunca. O que a pessoa pode ler ou gravar é decidido
// por RLS e RPC no banco, não aqui.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chaveAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !chaveAnon) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env (ver .env.example).');
}

export const supabase = createClient(url, chaveAnon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
