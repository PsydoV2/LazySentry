// Masks a raw secret for storage (docs/CONCEPT.md 4.3, rule 1). The raw
// value is only ever passed in here and to secretFingerprint() — nowhere
// else. Both calls happen in the same place in the worker and the raw
// string is discarded immediately after.

const VISIBLE_CHARS = 4;
const MIN_LENGTH_TO_PARTIALLY_REVEAL = 12;
// A multi-line private key can be thousands of characters; masking it
// 1:1 would store (and later render) a proportionally huge string for no
// benefit — the point of the mask is "this is hidden", not its exact
// length. Capped at a fixed width instead.
const MAX_MASKED_CHARS = 20;

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
  const maskedLength = Math.min(
    rawSecret.length - VISIBLE_CHARS * 2,
    MAX_MASKED_CHARS,
  );
  return `${start}${'*'.repeat(maskedLength)}${end}`;
}
