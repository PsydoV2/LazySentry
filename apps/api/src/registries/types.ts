// Registry lookup interface (docs/CONCEPT.md 5.3, 2.5). Only npm and
// Packagist are implemented for now; PyPI/crates.io/Go plug into the same
// interface later without touching the caller.

export interface PackageInfo {
  latestVersion: string | null;
  /** Declared license as the registry reports it (often an SPDX expression),
   * null when the registry has no license field — display only, never guessed. */
  license: string | null;
}

export interface RegistryClient {
  /**
   * Resolves the latest published version and declared license of a
   * package in a single call, since both come off the same registry
   * response for every ecosystem implemented so far. Returns null when the
   * registry has no answer (package not found) — never throws for that
   * case, only for actual network/timeout failures, so the caller can tell
   * "confirmed absent" (cache it) apart from "could not ask" (retry later).
   */
  getPackageInfo(packageName: string): Promise<PackageInfo | null>;
}

const REGISTRY_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
}
