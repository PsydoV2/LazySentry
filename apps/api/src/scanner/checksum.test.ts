import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./versions.js', () => ({
  SCANNER_VERSIONS: { 'osv-scanner': '2.5.1', trufflehog: '3.97.4' } as const,
  SCANNER_CHECKSUMS: {} as Partial<Record<'osv-scanner' | 'trufflehog', string>>,
}));

const { checkScannerChecksums } = await import('./checksum.js');
const versions = await import('./versions.js');

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), 'lazysentry-checksum-'));
  // Module namespace bindings can't be reassigned — clear the mocked object's
  // own properties instead, so each test starts from "nothing pinned".
  for (const key of Object.keys(versions.SCANNER_CHECKSUMS)) {
    delete (versions.SCANNER_CHECKSUMS as Record<string, string>)[key];
  }
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeBinary(name: string, content: string): string {
  const filePath = path.join(testDir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe('checkScannerChecksums', () => {
  it('reports binary_not_found for a path that does not exist', async () => {
    const results = await checkScannerChecksums([
      { name: 'osv-scanner', binaryPath: path.join(testDir, 'missing') },
    ]);
    expect(results).toEqual([{ name: 'osv-scanner', status: 'binary_not_found' }]);
  });

  it('reports unpinned (but still computes the hash) when no checksum is configured', async () => {
    const filePath = writeBinary('osv-scanner', 'fake binary content');
    const expectedHash = createHash('sha256').update('fake binary content').digest('hex');

    const results = await checkScannerChecksums([
      { name: 'osv-scanner', binaryPath: filePath },
    ]);
    expect(results).toEqual([
      { name: 'osv-scanner', status: 'unpinned', actual: expectedHash },
    ]);
  });

  it('reports verified when the computed hash matches the pinned value', async () => {
    const filePath = writeBinary('trufflehog', 'the real binary');
    const hash = createHash('sha256').update('the real binary').digest('hex');
    (versions.SCANNER_CHECKSUMS as Record<string, string>).trufflehog = hash;

    const results = await checkScannerChecksums([{ name: 'trufflehog', binaryPath: filePath }]);
    expect(results).toEqual([
      { name: 'trufflehog', status: 'verified', expected: hash, actual: hash },
    ]);
  });

  it('reports mismatch when the computed hash differs from the pinned value', async () => {
    const filePath = writeBinary('trufflehog', 'tampered binary');
    (versions.SCANNER_CHECKSUMS as Record<string, string>).trufflehog = 'a'.repeat(64);

    const results = await checkScannerChecksums([{ name: 'trufflehog', binaryPath: filePath }]);
    expect(results[0]!.status).toBe('mismatch');
    expect(results[0]!.expected).toBe('a'.repeat(64));
    expect(results[0]!.actual).not.toBe('a'.repeat(64));
  });

  it('resolves a bare command name against PATH', async () => {
    writeBinary('osv-scanner', 'on path');
    const originalPath = process.env.PATH;
    process.env.PATH = `${testDir}${path.delimiter}${originalPath ?? ''}`;
    try {
      const results = await checkScannerChecksums([
        { name: 'osv-scanner', binaryPath: 'osv-scanner' },
      ]);
      expect(results[0]!.status).toBe('unpinned');
      expect(results[0]!.actual).toBe(
        createHash('sha256').update('on path').digest('hex'),
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
