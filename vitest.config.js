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
    setupFiles: ['./tests/setup.js'],
    // Svelte compilation under this toolchain has very slow cold-transform times;
    // the first module import in a file can exceed the 5s default when the suite
    // runs together. Give it headroom so passing tests don't flake on a timeout.
    testTimeout: 20000,
  },
})
