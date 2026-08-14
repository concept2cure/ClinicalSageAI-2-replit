/**
 * The one place that decides whether a caller-supplied file path may be read.
 *
 * ── The defect this replaces ──────────────────────────────────────────────────
 * `routes/document-understanding.ts` (mounted at `/api/document-understanding`)
 * accepted a `filePath` from the request body, resolved it, and read it if it
 * started with one of six allowed roots. The array was duplicated at three call
 * sites. Two things were wrong with it, and the second is the serious one.
 *
 * 1. PREFIX MATCHING IS NOT CONTAINMENT. `fullPath.startsWith(root)` admits
 *    `/app/storage-evil/secret` for the root `/app/storage`, because the string
 *    genuinely does start with it. Containment needs the separator, or exact
 *    equality with the root itself. `routes/dossier_routes.ts` already had this
 *    right; these three sites did not.
 *
 * 2. THE ALLOWLIST CONTAINED THE TENANT VAULT. `storage` was on the list, and
 *    `services/storage/local-provider.ts` puts every tenant's files under
 *    `storage/vault/{orgId}/{projectId}/versions/…`. So an authenticated user of
 *    one organization could post
 *      { filePath: 'storage/vault/<other-org>/<project>/versions/<id>/file.pdf' }
 *    and read another customer's regulatory document. The allowlist permitted
 *    it, and nothing on that path ever looked at an organization.
 *
 *    That is the same vault the storage provider now guards by requiring an
 *    orgId — reached through a different door. It is the argument for having one
 *    decision point rather than a check at each call site: the provider was
 *    fixed and this was still open.
 *
 * ── Why the vault is excluded rather than org-scoped here ─────────────────────
 * This helper answers "is this a readable platform file?", not "whose file is
 * this?". Tenant-owned bytes have exactly one correct accessor —
 * `services/storage` (which now requires an organization) or
 * `services/ana/uploaded-file-access` (which requires both the org column and
 * the path prefix). Teaching this helper to also do tenant authorization would
 * create a second, weaker way to reach the same bytes, which is how the two
 * drifted apart in the first place. So the vault is simply not reachable by
 * arbitrary path, and a caller wanting a tenant file must go through an accessor
 * that knows which tenant is asking.
 *
 * @module server/utils/document-file-roots
 */

import path from 'node:path';

/**
 * Directories a caller-supplied path may name. Deliberately NOT including the
 * tenant vault — see the module note. `storage` as a whole is gone with it,
 * because the vault lives inside it and a root cannot be half-allowed.
 */
export const ALLOWED_DOCUMENT_ROOTS: readonly string[] = Object.freeze([
  path.resolve('uploads'),
  path.resolve('exports'),
  path.resolve('generated_documents'),
  path.resolve('csrs'),
  path.resolve('ectd'),
]);

/** Absolute path of the per-tenant vault, which is never reachable this way. */
export const TENANT_VAULT_ROOT = path.resolve('storage', 'vault');

/**
 * True when `candidate` is the root itself or genuinely sits underneath it.
 *
 * The separator is the whole point: without it `/app/storage-evil` is "inside"
 * `/app/storage`. Exported because the same mistake is easy to re-make anywhere
 * a root check is written.
 */
export function isPathWithin(root: string, candidate: string): boolean {
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  return c === r || c.startsWith(r + path.sep);
}

/**
 * Resolve a caller-supplied path, or return null if it may not be read.
 *
 * Null rather than a thrown error or a distinguishable reason: the caller
 * answers with one response for "not allowed" and "not there", so the endpoint
 * cannot be used to probe which paths exist on the host.
 */
export function resolveDocumentPath(input: unknown): string | null {
  if (typeof input !== 'string' || input.trim() === '') return null;

  // A NUL byte truncates the path in some syscalls, so a name that passes the
  // check here can open a different file underneath.
  if (input.includes('\0')) return null;

  const full = path.resolve(input);

  // REDUNDANT TODAY, and kept deliberately. With `storage` off the list above,
  // no vault path can reach the allowlist check, so removing this line changes
  // no current behaviour — mutation-tested, and the suite stays green without
  // it. What actually enforces the invariant is the structural assertion in
  // __tests__/document-file-roots.test.ts ("keeps the vault out of the allowlist
  // itself"), which fails the moment a root containing the vault is re-added.
  //
  // This line is the second belt: it makes the guarantee hold at runtime during
  // the window between someone adding such a root and CI telling them. Stated
  // plainly rather than dressed up as load-bearing, because a comment claiming
  // more than the code does is how the next reader mis-scopes an edit.
  if (isPathWithin(TENANT_VAULT_ROOT, full)) return null;

  return ALLOWED_DOCUMENT_ROOTS.some(root => isPathWithin(root, full)) ? full : null;
}
