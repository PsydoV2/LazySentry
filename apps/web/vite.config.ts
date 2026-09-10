import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the Fastify API runs separately; proxy API calls to it.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
