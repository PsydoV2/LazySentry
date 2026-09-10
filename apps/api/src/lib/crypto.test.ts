import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decrypt,
  encrypt,
  EncryptionKeyError,
  parseEncryptionKey,
  safeEquals,
} from './crypto.js';

const key = randomBytes(32);

describe('parseEncryptionKey', () => {
  it('accepts a 32-byte hex key', () => {
    const hex = randomBytes(32).toString('hex');
    expect(parseEncryptionKey(hex)).toEqual(Buffer.from(hex, 'hex'));
    expect(parseEncryptionKey(` ${hex}\n`).length).toBe(32);
  });

  it('rejects missing, malformed and wrong-length keys with guidance', () => {
    for (const bad of [undefined, '', '   ', 'not-hex!!', randomBytes(16).toString('hex')]) {
      expect(() => parseEncryptionKey(bad)).toThrow(EncryptionKeyError);
    }
    expect(() => parseEncryptionKey(undefined)).toThrow(/APP_ENCRYPTION_KEY/);
    // The message must tell the user how to fix it, not just what broke.
    expect(() => parseEncryptionKey(undefined)).toThrow(/randomBytes\(32\)/);
  });
});

describe('encrypt/decrypt', () => {
  it('round-trips a value', () => {
    const secret = 'github_pat_11ABCDEFG_exampleTokenValue';
    expect(decrypt(encrypt(secret, key), key)).toBe(secret);
  });

  it('round-trips unicode and empty strings', () => {
    for (const value of ['', 'schlüssel–ünïcode ✓', 'a'.repeat(5000)]) {
      expect(decrypt(encrypt(value, key), key)).toBe(value);
    }
  });

  it('produces different ciphertext for the same plaintext', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('refuses to decrypt with the wrong key', () => {
    const encrypted = encrypt('secret', key);
    expect(() => decrypt(encrypted, randomBytes(32))).toThrow();
  });

  it('refuses tampered ciphertext instead of returning garbage', () => {
    const raw = Buffer.from(encrypt('secret', key), 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(() => decrypt(raw.toString('base64'), key)).toThrow();
    expect(() => decrypt('short', key)).toThrow();
  });
});

describe('safeEquals', () => {
  it('compares values without leaking length mismatches as errors', () => {
    expect(safeEquals('abc', 'abc')).toBe(true);
    expect(safeEquals('abc', 'abd')).toBe(false);
    expect(safeEquals('abc', 'abcd')).toBe(false);
    expect(safeEquals('', '')).toBe(true);
  });
});
