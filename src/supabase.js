import { createClient } from '@supabase/supabase-js';

// Publishable anon key — safe to ship client-side (access is enforced by RLS).
// Override via .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) if needed.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://bulodpcsyadcchgvpcge.supabase.co';
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zOAbzxY27SgoGclzVQIKdw_T6iLOW8H';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
