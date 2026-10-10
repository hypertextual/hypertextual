import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// Use the user's checkout directly, without modifying or publishing the library.
const helical = process.env.HELICAL_UI ?? resolve(homedir(), 'Projects/helical-ui');
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@helical': resolve(helical, 'libs/helical-react/src') },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [helical, resolve('../..')] } },
});
