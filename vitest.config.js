import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'node:path'

export default defineConfig({
  // Compile .svelte / .svelte.js files in component tests.
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, 'src/lib'),
    },
    // Pick Svelte's client build in jsdom (not the SSR one) so mount() works.
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
