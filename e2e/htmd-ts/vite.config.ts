import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  build: {
    outDir: 'e2e/htmd-ts/dist-e2e',
    rolldownOptions: { input: 'e2e/htmd-ts/fixture.html' },
  },
  preview: { host: '127.0.0.1', port: 1422, strictPort: true },
})
