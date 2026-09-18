// Session handling and the guards used by protected routes.

import cookie from '@fastify/cookie';
import session from '@fastify/session';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { getUserById, type Role } from './users.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

declare module 'fastify' {
  interface Session {
    userId?: number;
    username?: string;
  }
}

export async function registerSessions(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(session, {
    secret: config.sessionSecret,
    cookieName: 'lazysentry.sid',
    cookie: {
      httpOnly: true,
      // Strict is the primary CSRF defense; app and API are same-origin.
      sameSite: 'strict',
      secure: config.HTTPS,
      path: '/',
      maxAge: SESSION_TTL_MS,
    },
    saveUninitialized: false,
  });
}

export function requireAuth(request: FastifyRequest): number {
  const userId = request.session.userId;
  if (userId === undefined) throw unauthorized();
  return userId;
}

/**
 * Admin-only guard (docs/CONCEPT.md 2.6: git-account and user management).
 * Re-reads the role from the database on every call rather than trusting a
 * value cached in the session cookie, so a role change (or account deletion)
 * takes effect immediately instead of only after the affected user's next
 * login.
 */
export function requireRole(request: FastifyRequest, role: Role): void {
  const userId = requireAuth(request);
  const user = getUserById(userId);
  if (!user || user.role !== role) throw forbidden();
}

/**
 * Second CSRF layer for state-changing requests (docs/CONCEPT.md 6.2), so the
 * defense does not rest on the SameSite cookie attribute alone.
 *
 * The Origin header is compared against the Host the browser addressed, not
 * against a hardcoded URL: an attacker's page can neither forge Origin nor
 * change which Host the request reaches. That keeps the check correct behind
 * a reverse proxy and in development, where the app is served from a
 * different port than the API. APP_ORIGIN overrides it for setups whose proxy
 * rewrites Host to the backend address.
 */
export function requireSameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  // Non-browser clients (curl, scripts) send no Origin and cannot be tricked
  // into a cross-site request in the first place.
  if (origin === undefined) return;

  const configured = config.APP_ORIGIN;
  if (configured !== undefined) {
    if (origin !== configured) throw forbidden('Request origin is not allowed');
    return;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden('Request origin is not allowed');
  }
  if (originHost !== request.headers.host) {
    throw forbidden('Request origin is not allowed');
  }
}
