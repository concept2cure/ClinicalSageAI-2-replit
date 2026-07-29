/**
 * Submission-bundle storage namespace — the single place that answers
 * "is this descriptor allowed to name that byte source?".
 *
 * Context (C2C-SUB-003). The transmit path used to accept a *client-supplied*
 * bundle descriptor: `{ path, sha256, sizeBytes, format }` straight off the
 * request body. `path` was then handed to `fs.readFile` by every gateway's
 * integrity gate, and the only integrity check was that the bytes hashed to the
 * caller's own `sha256`/`sizeBytes` — a self-consistent check an attacker
 * trivially satisfies for any file they can already hash. That made the
 * transmit route an arbitrary server-side file read whose output is shipped to
 * an external agency gateway.
 *
 * The trusted descriptor is the SERVER-GENERATED one that the tenant-scoped
 * assemble route persists on `c2c_submission_packages.metadata.bundle`. It
 * carries the immutable content hash, the internal eCTD structural-validation
 * result, and provenance (`assembledAt` / `assembledBy`). This module gives the
 * transmit route and the gateway integrity gate a shared, conservative way to
 * confine any descriptor to the namespace the assemble route actually writes to.
 *
 * Nothing here reads request state — the predicates are pure functions of the
 * candidate string plus process configuration.
 */
import * as path from 'path';

/**
 * The single root directory under which assembled submission bundles live.
 *
 * MUST stay identical to `BUNDLE_DIR` in server/routes/submission-ops.ts (the
 * assemble route's write target). If the two ever drift, legitimate bundles
 * become untransmittable — which is the safe direction, but still a bug. The
 * resolution is deliberately duplicated rather than imported so this module
 * carries no route dependency; see the note in the transmit route.
 */
export function submissionBundleRoot(): string {
  const configured = process.env.SUBMISSION_BUNDLE_DIR;
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'uploads', 'submission-bundles');
}

/**
 * Whether descriptor-provenance and namespace confinement are ENFORCED.
 *
 * Fail closed: enforcement is on everywhere except an explicitly declared local
 * `development` or `test` environment. An unset, blank, misspelled, `staging`
 * or `production` NODE_ENV all enforce. Mirrors the repo's established
 * prod-fail-closed gates (see server/middleware/uploadSafety.ts).
 *
 * Dev/test keep the historical explicit-descriptor affordance so local flows
 * and the pre-existing gateway route suite can drive the transmit path against
 * scratch files; the unconditional path-syntax guard below still applies there.
 */
export function bundleTrustEnforced(): boolean {
  const env = (process.env.NODE_ENV ?? '').trim().toLowerCase();
  return !(env === 'development' || env === 'test');
}

/** A `..` component in either separator style, anywhere in the string. */
const TRAVERSAL_SEGMENT = /(^|[\\/])\.\.([\\/]|$)/;

/**
 * Path syntax that is never acceptable for a bundle, in ANY environment:
 * a non-string / empty value, an embedded NUL (truncation tricks), or a `..`
 * traversal component.
 */
export function hasUnsafePathSyntax(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return true;
  if (candidate.includes('\0')) return true;
  return TRAVERSAL_SEGMENT.test(candidate);
}

/**
 * True when `candidate` resolves inside the submission-bundle root.
 *
 * `path.resolve` collapses `..` before the prefix comparison, so
 * `<root>/../../etc/passwd` is rejected rather than accepted on a naive
 * `startsWith`. The check is lexical: a symlink planted *inside* the root that
 * points outside is not detected here — see the note in the transmit route for
 * why that is out of scope for the request-body vector this closes.
 */
export function isPathWithinBundleRoot(candidate: unknown): boolean {
  if (hasUnsafePathSyntax(candidate)) return false;
  const root = submissionBundleRoot();
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  // -- Semgrep flags path.resolve() on a non-literal argument. Here the resolve
  // IS the sanitiser, not the sink: this function returns a BOOLEAN and reads no
  // file. `candidate` has already been rejected for NUL and `..` segments above,
  // and the containment comparison on the next line is what makes the result
  // safe — resolve() collapses any remaining traversal before the prefix test,
  // and an ABSOLUTE candidate (which resolve() would let override `root`)
  // likewise fails that test unless it genuinely lives under the root. Callers
  // only open a path once this has returned true.
  const resolved = path.resolve(root, candidate as string);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * Object-key prefix owned by `bundleStorageKey()` in
 * server/services/submission-bundle-storage.ts. Durable-copy keys recorded on a
 * descriptor must live under it.
 */
export const BUNDLE_STORAGE_KEY_PREFIX = 'submission-bundles/';

/**
 * True when `candidate` is a durable-storage key inside the bundle namespace.
 * Rejects absolute-looking keys, NULs and `..` components so a tampered
 * descriptor cannot pull an arbitrary object out of the bundle bucket.
 */
export function isBundleStorageKey(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  if (candidate.includes('\0')) return false;
  if (!candidate.startsWith(BUNDLE_STORAGE_KEY_PREFIX)) return false;
  return !TRAVERSAL_SEGMENT.test(candidate);
}
