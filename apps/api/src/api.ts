// Entrypoint for the standalone HTTP server process (docs/CONCEPT.md 0.2):
//   node dist/api.js
// Scans are executed by the worker process, not here — see worker.ts, or
// main.ts for the combined single-process mode.

import { startApi } from './server.js';

await startApi();
