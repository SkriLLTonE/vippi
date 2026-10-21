import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

export default defineConfig(() => ({
  // Env files are read from apps/web only: the root .env belongs to the API and sets
  // NODE_ENV=development, which would make `vite build` emit a development bundle.
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            // No manual group for recharts: it pulled shared deps (clsx) in recursively and made every page preload it.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
}));
