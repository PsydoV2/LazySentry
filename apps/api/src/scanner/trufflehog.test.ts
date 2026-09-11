import { describe, expect, it } from 'vitest';
import { toTruffleHogUri } from './trufflehog.js';

// process.platform is a getter on the process object; redefining it is the
// standard way to test platform-specific branches without an OS-specific CI
// matrix.
function withPlatform(platform: NodeJS.Platform, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    run();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
}

describe('toTruffleHogUri', () => {
  it('uses the two-slash form on Windows, avoiding a trufflehog drive-letter bug', () => {
    // Verified against trufflehog v3.97.4: the RFC-correct three-slash form
    // (`file:///C:/...`) makes it re-prepend the scanning process's own
    // drive letter, producing `file://E:/C:/Users/...` — the two-slash form
    // below does not hit that path.
    withPlatform('win32', () => {
      expect(toTruffleHogUri('C:\\Users\\sebfa\\AppData\\Local\\Temp\\scan-abc')).toBe(
        'file://C:/Users/sebfa/AppData/Local/Temp/scan-abc',
      );
    });
  });

  it('uses the RFC-correct three-slash form on POSIX, matching docs/CONCEPT.md 5.1', () => {
    withPlatform('linux', () => {
      expect(toTruffleHogUri('/tmp/scan-abc')).toBe('file:///tmp/scan-abc');
    });
  });
});
