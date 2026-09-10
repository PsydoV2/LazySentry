// The API contract in docs/CONCEPT.md 3.4 is that *every* error response has
// the shape { error: { code, message } }. Fastify's default error shape must
// never leak through — it did once, because the handler was registered after
// the instance had started booting.

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  registerErrorHandler,
  unauthorized,
} from './errors.js';

function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.get('/bad-request', async () => {
    throw badRequest('Invalid project id');
  });
  app.get('/unauthorized', async () => {
    throw unauthorized();
  });
  app.get('/forbidden', async () => {
    throw forbidden();
  });
  app.get('/not-found', async () => {
    throw notFound('Project not found');
  });
  app.get('/conflict', async () => {
    throw conflict('SCAN_ALREADY_QUEUED', 'Already queued');
  });
  app.get('/zod', async () => {
    z.object({ name: z.string().min(3) }).parse({ name: 'a' });
  });
  app.get('/boom', async () => {
    throw new Error('database exploded');
  });
  app.get('/fastify-error', async () => {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type');
  });
  return app;
}

async function call(path: string) {
  const app = buildApp();
  const response = await app.inject({ method: 'GET', url: path });
  await app.close();
  return { status: response.statusCode, body: response.json() };
}

describe('error handler', () => {
  it('maps each error type to its status and code', async () => {
    const cases = [
      ['/bad-request', 400, 'VALIDATION_ERROR'],
      ['/unauthorized', 401, 'UNAUTHORIZED'],
      ['/forbidden', 403, 'FORBIDDEN'],
      ['/not-found', 404, 'NOT_FOUND'],
      ['/conflict', 409, 'SCAN_ALREADY_QUEUED'],
      ['/fastify-error', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ] as const;

    for (const [path, status, code] of cases) {
      const result = await call(path);
      expect(result.status, path).toBe(status);
      expect(result.body, path).toEqual({
        error: { code, message: expect.any(String) },
      });
    }
  });

  it('turns Zod validation failures into a 400 with readable messages', async () => {
    const result = await call('/zod');
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
    // The raw issue array must not be dumped into the response.
    expect(result.body.error.message).toContain('name');
    expect(result.body.error.message).not.toContain('too_small');
  });

  it('never leaks internal error details to the client', async () => {
    const result = await call('/boom');
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(result.body)).not.toContain('database exploded');
  });

  it('does not fall back to the default Fastify error shape', async () => {
    for (const path of ['/bad-request', '/zod', '/boom']) {
      const result = await call(path);
      // Fastify's default body has top-level statusCode/error/message.
      expect(result.body).not.toHaveProperty('statusCode');
      expect(result.body).not.toHaveProperty('message');
      expect(Object.keys(result.body)).toEqual(['error']);
    }
  });
});
