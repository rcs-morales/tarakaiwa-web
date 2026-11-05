// Cloudflare bindings for the /api endpoints. adapter-cloudflare provides them
// through the `cloudflare:workers` module (emulated in `vite dev`, where
// they're unset unless configured). Declared here rather than pulling in
// @cloudflare/workers-types, whose globals clash with the DOM lib.
declare module 'cloudflare:workers' {
  export const env: {
    GROQ_API_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
  };
}
