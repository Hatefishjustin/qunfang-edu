import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 本地开发：/api 代理到 wrangler dev
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
