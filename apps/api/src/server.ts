// The HTTP server: serves the API and the built React app from one port
// (docs/CONCEPT.md 0.2, 3.1).
//
// Kept separate from the entrypoint in api.ts so the combined single-process
// mode (main.ts) can start the same server alongside the worker loop.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSessions } from './auth/session.js';
import { config } from './config.js';
import { runMigrations } from './db/client.js';
import { ScanEventStream } from './events/scan-events.js';
import { AppError, NOT_FOUND_BODY, registerErrorHandler } from './lib/errors.js';
import { registerAuditLogRoutes } from './routes/audit-log.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerEventRoutes } from './routes/events.js';
import { registerFleetRoutes } from './routes/fleet.js';
import { registerGitAccountRoutes } from './routes/git-accounts.js';
import { registerNotificationChannelRoutes } from './routes/notification-channels.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerSectionRoutes } from './routes/sections.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSetupRoutes } from './routes/setup.js';
import { registerUserRoutes } from './routes/users.js';
import { registerVersionRoutes } from './routes/version.js';

export async function startApi(): Promise<FastifyInstance> {
  runMigrations();

  const app = Fastify({
    logger: {
      // Tokens live in headers and bodies; neither is logged, but be explicit.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  // Registered before any plugin or route: a handler added after the instance
  // has started booting does not take effect, and Fastify's default error shape
  // would leak through instead (docs/CONCEPT.md 3.4).
  registerErrorHandler(app);

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

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The Vite build ships hashed assets; no inline scripts are used.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  // Global ceiling; login, connect and scan triggers set tighter limits of
  // their own (docs/CONCEPT.md 6.2).
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await registerSessions(app);

  app.get('/api/health', async () => ({ status: 'ok' }));

  registerSetupRoutes(app);
  registerAuditLogRoutes(app);
  registerAuthRoutes(app);
  registerFleetRoutes(app);
  registerGitAccountRoutes(app);
  registerNotificationChannelRoutes(app);
  registerProjectRoutes(app);
  registerSectionRoutes(app);
  registerSettingsRoutes(app);
  registerUserRoutes(app);
  registerVersionRoutes(app);

  // Scan progress reaches the browser over SSE; the worker's status changes are
  // picked up by polling this process's own database (docs/CONCEPT.md 3.5).
  const scanEvents = new ScanEventStream({
    onError: (error) => app.log.error(error, 'scan event poll failed'),
  });
  registerEventRoutes(app, scanEvents);
  scanEvents.start();

  // Serve the React build when it exists (production image). In development
  // the Vite dev server handles the frontend and proxies /api here.
  const webDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../web/dist',
  );
  const hasWebBuild = existsSync(webDist);
  if (hasWebBuild) {
    await app.register(fastifyStatic, { root: webDist });
  }

  app.setNotFoundHandler((request, reply) => {
    // SPA fallback: anything that is not an API route renders the app shell,
    // so client-side routes survive a page reload.
    if (hasWebBuild && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send(NOT_FOUND_BODY);
  });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  return app;
}
