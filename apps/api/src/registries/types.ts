// Registry lookup interface (docs/CONCEPT.md 5.3). Only npm and Packagist
// are implemented for the MVP; PyPI/crates.io/Go plug into the same
// interface later without touching the caller.

export interface RegistryClient {
  /**
   * Resolves the latest published version of a package. Returns null when
   * the registry has no answer (package not found) — never throws for that
   * case, only for actual network/timeout failures, so the caller can tell
   * "confirmed absent" (cache it) apart from "could not ask" (retry later).
   */
  getLatestVersion(packageName: string): Promise<string | null>;
}

const REGISTRY_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
}
