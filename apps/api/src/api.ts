// Entrypoint for the HTTP server process: serves the API and (in production)
// the built React app. See docs/CONCEPT.md 0.2 for the process model.

import Fastify from 'fastify';
import { config } from './config.js';
import { runMigrations } from './db/client.js';
import { registerProjectRoutes } from './routes/projects.js';

runMigrations();

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ status: 'ok' }));

registerProjectRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
});

app.setNotFoundHandler((_request, reply) => {
  reply.status(404).send({
    error: { code: 'NOT_FOUND', message: 'Resource not found' },
  });
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
