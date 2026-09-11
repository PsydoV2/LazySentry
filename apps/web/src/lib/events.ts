// Live scan updates over Server-Sent Events (docs/CONCEPT.md 3.5). The whole
// client side of this is one EventSource and a targeted cache invalidation —
// no polling, no client-side state machine for scan progress.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ScanEvent } from '@lazysentry/shared';

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

/**
 * Subscribes to /api/events for as long as the component is mounted.
 *
 * EventSource reconnects on its own, but at a fixed short interval and
 * forever — an API that is down (restarting in development, stopped in
 * production) is then hit every few seconds by every open tab. So the
 * reconnect is driven here instead, backing off up to half a minute and
 * resetting as soon as a connection is established.
 */
export function useScanEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = INITIAL_RETRY_MS;
    let cancelled = false;

    const connect = (): void => {
      if (cancelled) return;
      const stream = new EventSource('/api/events');
      source = stream;

      stream.onopen = () => {
        retryDelay = INITIAL_RETRY_MS;
      };

      stream.onmessage = (message: MessageEvent<string>) => {
        let event: ScanEvent;
        try {
          event = JSON.parse(message.data) as ScanEvent;
        } catch {
          return; // malformed frame — nothing to invalidate
        }
        if (typeof event.projectId !== 'number') return;

        // Two keys, both targeted (docs/CONCEPT.md 8.4): the detail view of
        // the project that changed, and the grid, whose counters and card
        // state come from the project list itself. Neither is a global
        // refetch.
        queryClient.invalidateQueries({ queryKey: ['project', event.projectId] });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      };

      stream.onerror = () => {
        // Closing here replaces the browser's own retry with the backoff
        // below; without it both would run.
        stream.close();
        if (cancelled) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [queryClient]);
}
