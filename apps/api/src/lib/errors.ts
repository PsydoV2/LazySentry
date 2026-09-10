// Central error handling per docs/CONCEPT.md 3.4: every error response has
// the shape { error: { code, message } } with a matching HTTP status.
// Fastify's default Ajv/serialized error shape is never passed through.

import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** An error with a deliberate HTTP status and machine-readable code. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) =>
  new AppError(400, 'VALIDATION_ERROR', message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message: string) =>
  new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) =>
  new AppError(409, code, message);

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }

    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      return reply
        .status(400)
        .send({ error: { code: 'VALIDATION_ERROR', message } });
    }

    const statusCode = (error as FastifyError).statusCode ?? 500;

    if (statusCode >= 500) {
      // Only server faults are logged with the full error; client mistakes
      // are not noise-worthy and may carry request data.
      request.log.error(error);
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }

    return reply.status(statusCode).send({
      error: {
        code: STATUS_CODES[statusCode] ?? (error as FastifyError).code ?? 'REQUEST_ERROR',
        message: error.message,
      },
    });
  });

}

/** The 404 body for API routes, shared by both not-found handlers. */
export const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'Resource not found' },
} as const;
