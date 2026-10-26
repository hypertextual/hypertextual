import { defineConfig, mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import appConfig from '../../apps/hypertextual-svelte/vite.config.ts'

// Compile the actual application and its CSS; this entry exists only in the test build.
export default mergeConfig(
  appConfig,
  defineConfig({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    build: {
      outDir: 'e2e/hypertextual-desktop/dist-e2e',
      rolldownOptions: { input: 'e2e/hypertextual-desktop/fixture.html' },
    },
    preview: { host: '127.0.0.1', port: 1421, strictPort: true },
  }),
)
