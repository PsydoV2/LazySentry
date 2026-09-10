// Entrypoint for the HTTP server process: serves the API and (in production)
// the built React app. See docs/CONCEPT.md 0.2 for the process model.

import Fastify from 'fastify';
import { config } from './config.js';
import { runMigrations } from './db/client.js';
import { AppError, registerErrorHandler } from './lib/errors.js';
import { registerProjectRoutes } from './routes/projects.js';

runMigrations();

const app = Fastify({ logger: true });

// Trigger endpoints (e.g. "run scan now") carry no payload, and a POST
// without a Content-Type header would otherwise be rejected as 415. This
// catch-all runs only after the JSON parser, so it accepts bodiless requests
// and still rejects an unsupported content type that does carry a body.
app.addContentTypeParser('*', (request, payload, done) => {
  const contentLength = request.headers['content-length'];
  if (contentLength === undefined || contentLength === '0') {
    payload.resume();
    done(null, undefined);
    return;
  }
  done(
    new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported content type: ${request.headers['content-type'] ?? 'none'}`,
    ),
  );
});

app.get('/api/health', async () => ({ status: 'ok' }));

registerProjectRoutes(app);
registerErrorHandler(app);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
