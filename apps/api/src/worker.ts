// Entrypoint for the standalone worker process (docs/CONCEPT.md 0.2):
//   node dist/worker.js
// The loop lives in worker-loop.ts, which the combined mode reuses.

import { closeDb } from './db/client.js';
import { startWorker, stopWorker } from './worker-loop.js';

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => stopWorker());
}

await startWorker();
closeDb();
