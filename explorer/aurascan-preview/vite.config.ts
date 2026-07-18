import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Dev-server proxies point at the live infra so `vite dev` works with real
// chain data. Production routing is handled by nginx.conf (same paths).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://139.180.140.143:4000',
        changeOrigin: true,
      },
      '/noderpc': {
        target: 'http://139.180.188.61:8545',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/noderpc/, ''),
      },
      '/admin/api': {
        target: 'http://139.180.140.143',
        changeOrigin: true,
      },
    },
  },
});
