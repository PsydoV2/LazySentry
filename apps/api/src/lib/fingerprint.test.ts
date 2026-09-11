import { describe, expect, it } from 'vitest';
import {
  fingerprint,
  secretFingerprint,
  vulnerabilityFingerprint,
} from './fingerprint.js';

describe('fingerprint', () => {
  it('is stable across calls', () => {
    expect(fingerprint('a', 'b')).toBe(fingerprint('a', 'b'));
  });

  it('does not collide when the split between components shifts', () => {
    // Naive concatenation would make these identical and silently merge two
    // different findings into one row.
    expect(fingerprint('ab', 'c')).not.toBe(fingerprint('a', 'bc'));
  });

  it('distinguishes the same OSV id in different packages and ecosystems', () => {
    const npm = vulnerabilityFingerprint('npm', 'lodash', 'GHSA-x');
    const packagist = vulnerabilityFingerprint('Packagist', 'lodash', 'GHSA-x');
    const other = vulnerabilityFingerprint('npm', 'underscore', 'GHSA-x');
    expect(new Set([npm, packagist, other]).size).toBe(3);
  });
});

describe('secretFingerprint', () => {
  it('distinguishes two different credentials on the same line of the same commit', () => {
    const first = secretFingerprint('AWS', 'src/config.js', 'abc123', 'AKIA_ONE');
    const second = secretFingerprint('AWS', 'src/config.js', 'abc123', 'AKIA_TWO');
    expect(first).not.toBe(second);
  });

  it('is stable for the same finding', () => {
    const a = secretFingerprint('GitHub', 'a.env', 'sha1', 'ghp_secret');
    const b = secretFingerprint('GitHub', 'a.env', 'sha1', 'ghp_secret');
    expect(a).toBe(b);
  });
});
