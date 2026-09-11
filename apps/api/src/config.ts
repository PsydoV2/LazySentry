// Central runtime configuration, loaded once from the environment.

import { hkdfSync } from 'node:crypto';
import { z } from 'zod';
import { EncryptionKeyError, parseEncryptionKey } from './lib/crypto.js';

// Load a local .env in development; in production the environment is set by
// the container runtime and the file does not exist. Checked in the current
// working directory first, then at the workspace root (pnpm scripts run with
// the package directory as cwd). Already-set variables take precedence.
for (const envFile of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(envFile);
    break;
  } catch {
    // file not found — try the next location
  }
}

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./data/lazysentry.db'),
  // Path to the osv-scanner binary. Defaults to the binary on PATH (the
  // Docker image copies it to /usr/local/bin); for local development point
  // this at e.g. ./tools/osv-scanner.exe via .env.
  OSV_SCANNER_PATH: z.string().default('osv-scanner'),
  // Path to the trufflehog binary. Same convention as OSV_SCANNER_PATH above.
  TRUFFLEHOG_PATH: z.string().default('trufflehog'),
  // Set when the app is served over HTTPS, so session cookies get `Secure`.
  HTTPS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Explicit origin allowed for state-changing requests (docs/CONCEPT.md 6.2
  // CSRF). Only needed when a reverse proxy rewrites the Host header;
  // otherwise Origin is checked against Host. Example: https://sentry.example.com
  APP_ORIGIN: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

// The application refuses to start without a valid master key rather than
// silently storing tokens in the clear (docs/CONCEPT.md 4.2).
let encryptionKey: Buffer;
try {
  encryptionKey = parseEncryptionKey(process.env.APP_ENCRYPTION_KEY);
} catch (error) {
  if (error instanceof EncryptionKeyError) {
    console.error(`\nLazySentry cannot start.\n\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

export const config = {
  ...parsed.data,
  encryptionKey,
  // Derived from the master key so self-hosters have one secret to manage.
  // HKDF with a distinct info label keeps it independent of the data key.
  sessionSecret: Buffer.from(
    hkdfSync('sha256', encryptionKey, '', 'lazysentry:session', 32),
  ).toString('hex'),
};
