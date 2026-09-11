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

  it('masks the entire middle segment, whatever it contains', () => {
    const raw = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
    const redacted = redactSecret(raw);
    expect(redacted.slice(4, -4)).toBe('*'.repeat(raw.length - 8));
  });

  it('never returns the raw secret verbatim', () => {
    const raw = 'super-secret-value-1234567890';
    expect(redactSecret(raw)).not.toBe(raw);
  });
});
