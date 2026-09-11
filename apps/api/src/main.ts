// Combined entrypoint (docs/CONCEPT.md 0.2): HTTP server and scan worker in
// one process.
//
//   node dist/main.js                 API only
//   node dist/main.js --with-worker   API + worker
//
// The compose setup runs api and worker as two services on the same image;
// this mode exists for small single-container setups — and it is what
// `pnpm dev` uses, so a scan queued in the UI is actually picked up instead
// of sitting in the queue with nothing to run it.

import { closeDb } from './db/client.js';
import { startApi } from './server.js';
import { startWorker, stopWorker } from './worker-loop.js';

const withWorker = process.argv.includes('--with-worker');

const app = await startApi();
app.log.info(
  withWorker
    ? 'scan worker running in this process (--with-worker)'
    : 'no worker in this process — start one with `node dist/worker.js`',
);

let workerLoop: Promise<void> | undefined;
if (withWorker) {
  workerLoop = startWorker();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown();
  });
}

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // Let the worker finish the job it is on before the database handle both
  // of them share goes away.
  stopWorker();
  await workerLoop;
  await app.close();
  closeDb();
}
