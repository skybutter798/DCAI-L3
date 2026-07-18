import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Dev/preview proxies point at the live infra so `vite dev` and
// `vite preview` work with real chain data. Production routing is handled
// by nginx.conf (same paths).
const liveProxy = {
  '/api': {
    target: 'http://139.180.140.143:4000',
    changeOrigin: true,
  },
  '/noderpc': {
    target: 'http://139.180.188.61:8545',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/noderpc/, ''),
  },
  '/admin/api': {
    target: 'http://139.180.140.143',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Deterministic vendor chunks for long-term caching across app
        // releases. Function form keyed on the node_modules package dir —
        // entry-list form mis-assigns subpath imports (the app imports
        // 'motion/react', not 'motion', and react's CJS payload gets claimed
        // by whichever listed subtree reaches it first).
        // `vendor-ethers` is only imported by the lazy wallet views
        // (ContributorProgram, DashboardView), so it stays async and off the
        // explorer's critical path.
        manualChunks(id: string) {
          const nid = id.replace(/\\/g, '/');
          const m = nid.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
          if (!m) return undefined;
          const pkg = m[1];
          if (['react', 'react-dom', 'scheduler'].includes(pkg)) return 'vendor-react';
          if (['motion', 'framer-motion', 'motion-dom', 'motion-utils'].includes(pkg)) return 'vendor-motion';
          if (['ethers', '@noble/hashes', '@noble/curves', '@adraffy/ens-normalize', 'aes-js'].includes(pkg)) return 'vendor-ethers';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: liveProxy,
  },
  preview: {
    proxy: liveProxy,
  },
});
