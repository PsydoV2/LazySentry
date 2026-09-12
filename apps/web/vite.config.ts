import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The browser's EventSource on /api/events (docs/CONCEPT.md 3.5) reconnects
 * by itself, which in development means it keeps retrying while the API
 * process is still booting or restarting on a file change. Vite logs every
 * such attempt as a proxy error with a stack trace, so a normal `pnpm dev`
 * starts with a wall of noise about a condition that resolves itself within
 * seconds. Only connection-refused proxy errors are dropped — a proxy error
 * with any other cause still reaches the console.
 */
const logger = createLogger();
const logError = logger.error.bind(logger);
logger.error = (message, options) => {
  if (message.includes('http proxy error') && message.includes('ECONNREFUSED')) {
    return;
  }
  logError(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    // In development the Fastify API runs separately; proxy API calls to it.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3111',
        // Keep the browser's Host header instead of rewriting it to the
        // target. The API checks Origin against Host as its CSRF defense
        // (docs/CONCEPT.md 6.2), so a rewritten Host makes every
        // state-changing request in development look cross-site.
        changeOrigin: false,
      },
    },
  },
});
