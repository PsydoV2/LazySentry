import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the Fastify API runs separately; proxy API calls to it.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        // Keep the browser's Host header instead of rewriting it to the
        // target. The API checks Origin against Host as its CSRF defense
        // (docs/CONCEPT.md 6.2), so a rewritten Host makes every
        // state-changing request in development look cross-site.
        changeOrigin: false,
      },
    },
  },
});
