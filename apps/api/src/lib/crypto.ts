// AES-256-GCM encryption for tokens and secret settings (docs/CONCEPT.md 4.2).
// The master key comes from APP_ENCRYPTION_KEY and never from the database.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class EncryptionKeyError extends Error {}

/**
 * Parses the master key from its hex representation. Throws with actionable
 * instructions rather than a stack trace, because this is the first thing a
 * self-hosting user hits when their .env is incomplete.
 */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  const hint =
    'Generate one with:\n' +
    '  openssl rand -hex 32\n' +
    '(no OpenSSL? if you have Node.js: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")\n' +
    `Set the ${KEY_BYTES * 2}-character result as APP_ENCRYPTION_KEY in your .env file.\n` +
    'Keep it safe: losing it makes stored tokens unrecoverable.';

  if (!raw || raw.trim() === '') {
    throw new EncryptionKeyError(`APP_ENCRYPTION_KEY is not set.\n${hint}`);
  }
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY must be hex-encoded.\n${hint}`,
    );
  }
  const key = Buffer.from(trimmed, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `APP_ENCRYPTION_KEY must be a ${KEY_BYTES * 2}-character hex string ` +
        `(${KEY_BYTES} bytes), but got ${trimmed.length} characters (${key.length} bytes).\n${hint}`,
    );
  }
  return key;
}

/**
 * Encrypts a value. Output layout: iv | authTag | ciphertext, base64-encoded.
 * A fresh random IV per call means the same plaintext never produces the same
 * ciphertext twice.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decrypt(encoded: string, key: Buffer): string {
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error('Ciphertext is too short to be valid');
  }
  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // Throws if the auth tag does not match — tampered or wrong-key data is
  // rejected rather than silently returning garbage.
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/** Constant-time comparison for opaque tokens. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
