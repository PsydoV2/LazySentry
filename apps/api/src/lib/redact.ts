// Masks a raw secret for storage (docs/CONCEPT.md 4.3, rule 1). The raw
// value is only ever passed in here and to secretFingerprint() — nowhere
// else. Both calls happen in the same place in the worker and the raw
// string is discarded immediately after.

const VISIBLE_CHARS = 4;
const MIN_LENGTH_TO_PARTIALLY_REVEAL = 12;

/**
 * Keeps the first and last 4 characters, masks the rest. Secrets shorter
 * than 12 characters are masked completely — 4+4 visible characters out of,
 * say, 9 would leak most of the secret.
 */
export function redactSecret(rawSecret: string): string {
  if (rawSecret.length < MIN_LENGTH_TO_PARTIALLY_REVEAL) {
    return '*'.repeat(rawSecret.length);
  }
  const start = rawSecret.slice(0, VISIBLE_CHARS);
  const end = rawSecret.slice(-VISIBLE_CHARS);
  const maskedLength = rawSecret.length - VISIBLE_CHARS * 2;
  return `${start}${'*'.repeat(maskedLength)}${end}`;
}
