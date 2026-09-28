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
 *    equality with the root itself. `routes/dossier_routes.ts` (since deleted
 *    as an unreachable parallel path) already had this right; these three
 *    sites did not.
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
 * ── The three roots that ARE tenant files, and the prefix rule (IAM-07) ──────
 * `uploads`, `exports` and `generated_documents` stayed on the list above as
 * "platform files", and they are not: an upload is one tenant's document
 * (`uploads/org-{id}/{fileId}`, per services/ana/uploaded-file-access), and a
 * generated DOCX is one tenant's draft. `generated_documents/` was one flat
 * directory for every tenant, with names of the form
 * `<Title>_<type>_<YYYYMMDD>.docx` — predictable, and overwritten on collision —
 * so an authenticated user of one organization could download or analyze
 * another's file by guessing its name (audit 2026-09-24, IAM-07).
 *
 * The rule now: files under those three roots live at `<root>/org-<id>/…`, and
 * a caller that passes its organization is confined to its own prefix. A path
 * under another tenant's prefix, or a legacy flat file with no prefix (and so
 * no owner recorded anywhere), returns the same null an escape does. The
 * predicate lives HERE rather than at each route for the reason given above:
 * the three file-reading routes and the download route already come through
 * this one decision point, and a check written four times drifts. `csrs` and
 * `ectd` are not prefixed: `csrs/` is a checked-in set of public CSR synopses
 * and nothing in the server writes a per-tenant tree under either root, so
 * they are reference corpora, not tenant files. If that changes, add the root
 * to TENANT_OWNED_ROOTS and the test that walks it fails until the prefix rule
 * covers it.
 *
 * The no-organization form is kept for internal callers that resolve a path
 * the server itself built. A route handling a caller-supplied path must pass
 * the organization; `ci:path-containment` sees the call but cannot see the
 * argument, so that is a review rule, pinned by the route tests.
 *
 * @module server/utils/document-file-roots
 */

import path from 'node:path';
import { usableOrgId } from './authedOrgId';

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

/**
 * The subset of ALLOWED_DOCUMENT_ROOTS whose contents belong to a tenant, laid
 * out as `<root>/org-<id>/…`. With an organization given, resolution under one
 * of these is confined to that prefix. See the module note for why `csrs` and
 * `ectd` are not here.
 */
export const TENANT_OWNED_ROOTS: readonly string[] = Object.freeze([
  path.resolve('uploads'),
  path.resolve('exports'),
  path.resolve('generated_documents'),
]);

/** Absolute path of the per-tenant vault, which is never reachable this way. */
export const TENANT_VAULT_ROOT = path.resolve('storage', 'vault');

/** The directory a tenant's files live under within a tenant-owned root. */
export function tenantPrefixDir(root: string, organizationId: number): string {
  return path.join(path.resolve(root), `org-${organizationId}`);
}

export interface ResolveDocumentPathOptions {
  /**
   * The caller's organization, from the verified request context — never from
   * the body. Given, a path under a tenant-owned root must lie inside
   * `<root>/org-<id>/`. Given but unusable (0, negative, NaN, non-numeric) the
   * call refuses everything: an organization the caller could not resolve is
   * not a licence to read as nobody.
   */
  organizationId?: number | string;
}

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
export function resolveDocumentPath(
  input: unknown,
  opts?: ResolveDocumentPathOptions
): string | null {
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

  const root = ALLOWED_DOCUMENT_ROOTS.find(r => isPathWithin(r, full));
  if (!root) return null;

  // The no-organization form: an internal caller resolving a server-built path.
  if (opts?.organizationId === undefined) return full;

  const organizationId = usableOrgId(opts.organizationId);
  if (organizationId === null) return null;

  if (!TENANT_OWNED_ROOTS.includes(root)) return full;

  // Containment, not a string prefix: `org-77` is not inside `org-7`.
  return isPathWithin(tenantPrefixDir(root, organizationId), full) ? full : null;
}
