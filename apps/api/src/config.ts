// Central runtime configuration, loaded once from the environment.
// APP_ENCRYPTION_KEY is validated here as soon as encrypted settings exist
// (implementation step 3) — see docs/CONCEPT.md 4.2.

import { z } from 'zod';

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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
