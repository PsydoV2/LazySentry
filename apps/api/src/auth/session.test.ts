// CSRF origin check (docs/CONCEPT.md 6.2). Getting this wrong either blocks
// every legitimate request behind a reverse proxy or lets a cross-site POST
// through, so the cases are pinned down here.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

process.env.DATABASE_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'lazysentry-session-')),
  'test.db',
);
process.env.APP_ENCRYPTION_KEY ??= 'a'.repeat(64);

const { requireSameOrigin } = await import('./session.js');

function requestWith(headers: Record<string, string | undefined>) {
  return { headers } as unknown as FastifyRequest;
}

describe('requireSameOrigin', () => {
  it('allows a request whose Origin matches the Host it was sent to', () => {
    expect(() =>
      requireSameOrigin(
        requestWith({ origin: 'http://localhost:5173', host: 'localhost:5173' }),
      ),
    ).not.toThrow();

    // Behind a reverse proxy the browser addresses the public host.
    expect(() =>
      requireSameOrigin(
        requestWith({
          origin: 'https://sentry.example.com',
          host: 'sentry.example.com',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a cross-site Origin', () => {
    expect(() =>
      requireSameOrigin(
        requestWith({ origin: 'https://evil.example', host: 'localhost:3000' }),
      ),
    ).toThrow(/origin is not allowed/);
  });

  it('rejects an unparseable Origin instead of letting it through', () => {
    expect(() =>
      requireSameOrigin(requestWith({ origin: 'null', host: 'localhost:3000' })),
    ).toThrow(/origin is not allowed/);
  });

  it('allows non-browser clients that send no Origin at all', () => {
    // curl and scripts cannot be used for a cross-site attack.
    expect(() =>
      requireSameOrigin(requestWith({ host: 'localhost:3000' })),
    ).not.toThrow();
  });
});
