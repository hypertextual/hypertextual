import tailwindcss from '@tailwindcss/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  resolve: { dedupe: ['svelte', '@tiptap/core', '@tiptap/pm'] },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  build: {
    // Tauri uses WebKit on macOS and Linux, and WebView2 on Windows.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
  },
})
