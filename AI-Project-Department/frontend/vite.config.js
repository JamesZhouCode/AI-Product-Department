import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: process.env.VITE_SKIP_PUBLIC === 'true' ? false : 'public',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // 链知智答后端（python agent/service.py）；未启动时前端自动回退本地规则引擎。
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
