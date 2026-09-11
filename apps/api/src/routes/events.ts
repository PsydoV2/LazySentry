// GET /api/events — Server-Sent Events stream of scan status changes
// (docs/CONCEPT.md 3.5). The browser's EventSource reconnects on its own, so
// there is no fallback transport in the MVP.

import type { FastifyInstance } from 'fastify';
import type { ScanEvent } from '@lazysentry/shared';
import { requireAuth } from '../auth/session.js';
import type { ScanEventStream } from '../events/scan-events.js';

/** Proxies and browsers drop an idle connection; a comment line keeps it warm. */
const HEARTBEAT_MS = 25_000;

export function registerEventRoutes(
  app: FastifyInstance,
  stream: ScanEventStream,
): void {
  app.get(
    '/api/events',
    {
      // A long-lived stream is one request that never ends — counting it
      // against the global limit would let a few reconnects lock the client
      // out of the API.
      config: { rateLimit: false },
    },
    (request, reply) => {
      requireAuth(request);

      // Past this point the response is written by hand: Fastify must not
      // try to serialize or end it.
      reply.hijack();
      const socket = reply.raw;
      socket.writeHead(200, {
        'content-type': 'text/event-stream',
        // no-transform also stops a proxy from buffering the stream.
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      socket.write(': connected\n\n');

      const send = (event: ScanEvent): void => {
        // The event type travels inside the payload rather than as an SSE
        // `event:` name, so the client needs a single onmessage handler.
        socket.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = stream.subscribe(send);
      const heartbeat = setInterval(() => socket.write(': ping\n\n'), HEARTBEAT_MS);
      heartbeat.unref();

      const close = (): void => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.raw.on('close', close);
      socket.on('error', close);
    },
  );
}
