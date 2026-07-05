import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    files: {
      // Keep the pre-SvelteKit layout: static runtime assets stay in public/
      // (models/, assets/, vendor/, groq-guide.html) instead of static/.
      assets: 'public',
    },
  },
};

export default config;
