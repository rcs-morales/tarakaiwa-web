import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // SvelteKit 3 takes its config here (svelte.config.js is no longer read).
    sveltekit({
      adapter: adapter({
        routes: {
          include: ['/*'],
          // By default the adapter lists every static file individually in
          // _routes.json, which sits right at Cloudflare's 100-rule limit with
          // the Live2D model tree (files beyond the limit fall through to the
          // worker and 404). Wildcards keep the rule count tiny and stable.
          exclude: ['<build>', '/assets/*', '/models/*', '/vendor/*', '/groq-guide.html'],
        },
      }),
      files: {
        // Keep the pre-SvelteKit layout: static runtime assets stay in public/
        // (models/, assets/, vendor/, groq-guide.html) instead of static/.
        assets: 'public',
      },
    }),
  ],
});
