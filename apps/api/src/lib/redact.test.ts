import { describe, expect, it } from 'vitest';
import { redactSecret } from './redact.js';

describe('redactSecret', () => {
  it('keeps the first and last 4 characters of a long secret', () => {
    // A realistic AWS access key id (20 chars).
    expect(redactSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA************MPLE');
  });

  it('fully masks secrets shorter than 12 characters', () => {
    expect(redactSecret('short1')).toBe('******');
  });

  it('fully masks a secret right at the boundary', () => {
    expect(redactSecret('eleven-chr!')).toBe('*'.repeat(11));
  });

  it('masks the entire middle segment when it fits under the cap', () => {
    const raw = 'ghp_1234567890abcdefghij'; // 25 chars, 17 masked
    const redacted = redactSecret(raw);
    expect(redacted.slice(4, -4)).toBe('*'.repeat(raw.length - 8));
  });

  it('caps the masked segment for a very long secret (e.g. a private key)', () => {
    // A real PEM private key can be thousands of characters — masking it
    // 1:1 would store a proportionally huge string for no benefit.
    const raw = `-----BEGIN RSA PRIVATE KEY-----\n${'A'.repeat(3000)}\n-----END-----`;
    const redacted = redactSecret(raw);
    expect(redacted.length).toBeLessThan(50);
    expect(redacted.startsWith('----')).toBe(true);
  });

  it('never returns the raw secret verbatim', () => {
    const raw = 'super-secret-value-1234567890';
    expect(redactSecret(raw)).not.toBe(raw);
  });
});
