// Entrypoint for the HTTP server process: serves the API and (in production)
// the built React app. See docs/CONCEPT.md 0.2 for the process model.

import Fastify from 'fastify';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ status: 'ok' }));

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
  await app.listen({ host: HOST, port: PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
