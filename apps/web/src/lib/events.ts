// Live scan updates over Server-Sent Events (docs/CONCEPT.md 3.5). The whole
// client side of this is one EventSource and a targeted cache invalidation —
// no polling, no client-side state machine for scan progress.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ScanEvent } from '@lazysentry/shared';

/**
 * Subscribes to /api/events for as long as the component is mounted.
 * EventSource reconnects on its own after a dropped connection, so there is
 * no retry logic here.
 */
export function useScanEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.onmessage = (message: MessageEvent<string>) => {
      let event: ScanEvent;
      try {
        event = JSON.parse(message.data) as ScanEvent;
      } catch {
        return; // malformed frame — nothing to invalidate
      }
      if (typeof event.projectId !== 'number') return;

      // Two keys, both targeted (docs/CONCEPT.md 8.4): the detail view of the
      // project that changed, and the grid, whose counters and card state
      // come from the project list itself. Neither is a global refetch.
      queryClient.invalidateQueries({ queryKey: ['project', event.projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    };

    return () => source.close();
  }, [queryClient]);
}
