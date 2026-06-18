const SUPABASE_URL = 'https://bulodpcsyadcchgvpcge.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zOAbzxY27SgoGclzVQIKdw_T6iLOW8H';

const { createClient } = globalThis.supabase || {};
if (!createClient) {
  console.warn('Supabase SDK not loaded — bug reports will not work.');
}

export const supabaseClient = createClient
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
