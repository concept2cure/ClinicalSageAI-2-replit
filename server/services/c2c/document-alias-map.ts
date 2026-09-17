/**
 * The document alias map — the ONLY writer and reader of `c2c_document_aliases`
 * (Document Identity Contract 2026-08, slice C2; ledger L10).
 *
 * A document has no single identity in this platform: `authoring_documents`
 * is uuid-native, `coauthor_documents` is serial, `submission_leaves` points
 * at an integer, and `concept2cure_artifacts` keys off the legacy `projects`
 * spine. The map answers exactly one question — "what is this document called
 * in that store?" — so a snapshot can record real lineage to its source and a
 * deep-link can resolve by identity instead of by title.
 *
 * THE TABLE HOLDS NO ATTRIBUTES. Not a title, not a status, not placement.
 * That invariant is what lets it survive where the reverted registry did not,
 * and scripts/ci/check-document-alias-attribute-free.mjs enforces it in CI.
 *
 * Fail-closed rules, in order:
 *   - An alias that would FORK an identity — the same native id already
 *     recorded under another canonical id, or the same canonical already
 *     represented by another native id in that store — is refused with
 *     DocumentAliasConflictError, and the caller's transaction rolls back.
 *     Two rows cannot say two different things about one document.
 *   - A native id another tenant already recorded is refused the same way,
 *     without saying whose it is.
 *   - A database that has not applied migrations/20260814d_document_alias_map.sql
 *     is reported as `relation_absent`, never as "nothing aliased": the
 *     caller decides whether that degrades or refuses, and says which.
 *   - Every read carries the organization predicate. A read without one would
 *     let a caller who knows a native id learn another tenant's canonical
 *     identity.
 *
 * @module server/services/c2c/document-alias-map
 */

/** The store vocabulary. Mirrors the CHECK constraint in the migration; extending
 *  one without the other is a deliberate, reviewed migration. */
export const DOCUMENT_ALIAS_STORES = [
  'authoring_documents',
  'coauthor_documents',
  'c2c_documents',
  'concept2cure_artifacts',
  'submission_leaves',
  'unified_documents',
] as const;
export type DocumentAliasStore = (typeof DOCUMENT_ALIAS_STORES)[number];

/** Minimal pg-shaped executor: a Pool, a PoolClient, a Drizzle transaction via
 *  queryableFromDrizzle, or PGlite in the contract test. */
export interface AliasExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface DocumentAliasRef {
  organizationId: number;
  canonicalId: string;
  store: DocumentAliasStore;
  nativeId: string;
}

export type RecordAliasResult =
  | { recorded: true }
  | { recorded: false; reason: 'already_recorded' }
  | { recorded: false; reason: 'relation_absent' };

export type AliasesRead =
  | { available: true; aliases: Array<{ store: DocumentAliasStore; nativeId: string }> }
  | { available: false; reason: 'relation_absent' };

export type CanonicalRead =
  | { available: true; canonicalId: string | null }
  | { available: false; reason: 'relation_absent' };

export class DocumentAliasConflictError extends Error {
  readonly code = 'DOCUMENT_ALIAS_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'DocumentAliasConflictError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATION_ABSENT = '42P01';
const UNIQUE_VIOLATION = '23505';

function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

/**
 * Whether the alias table exists — asked with a SELECT that cannot error,
 * because the writer runs inside the caller's transaction and a failed INSERT
 * against a missing relation would abort that transaction (every later
 * statement then fails with 25P02), turning "migration not applied yet" into
 * "the document could not be created". to_regclass returns NULL, not an error.
 */
async function relationPresent(exec: AliasExecutor): Promise<boolean> {
  const r = await exec.query(
    `SELECT to_regclass('public.c2c_document_aliases') IS NOT NULL AS present`,
  );
  return r.rows.length > 0 && Boolean(r.rows[0].present);
}

function assertRef(ref: DocumentAliasRef): void {
  if (!Number.isInteger(ref.organizationId) || ref.organizationId <= 0) {
    throw new Error('Document alias requires an organization');
  }
  if (typeof ref.canonicalId !== 'string' || !UUID_RE.test(ref.canonicalId)) {
    throw new Error('Document alias requires a canonical uuid');
  }
  if (!(DOCUMENT_ALIAS_STORES as readonly string[]).includes(ref.store)) {
    throw new Error(`Unknown document store: ${String(ref.store)}`);
  }
  if (typeof ref.nativeId !== 'string' || ref.nativeId.trim() === '') {
    throw new Error('Document alias requires the store\'s native id');
  }
}

/**
 * Record that `nativeId` in `store` is a representation of `canonicalId`.
 * Idempotent for an identical row; refuses a fork; reports an unapplied
 * migration rather than pretending.
 */
export async function recordDocumentAlias(
  exec: AliasExecutor,
  ref: DocumentAliasRef,
): Promise<RecordAliasResult> {
  assertRef(ref);
  if (!(await relationPresent(exec))) return { recorded: false, reason: 'relation_absent' };
  const canonicalId = ref.canonicalId.toLowerCase();
  let inserted: { rows: Array<Record<string, unknown>> };
  try {
    inserted = await exec.query(
      `INSERT INTO c2c_document_aliases (canonical_id, store, native_id, organization_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store, native_id) DO NOTHING
       RETURNING canonical_id`,
      [canonicalId, ref.store, ref.nativeId, ref.organizationId],
    );
  } catch (error) {
    const code = pgCode(error);
    if (code === RELATION_ABSENT) return { recorded: false, reason: 'relation_absent' };
    if (code === UNIQUE_VIOLATION) {
      // UNIQUE (canonical_id, store): this canonical document is already
      // represented in that store by a different native id.
      throw new DocumentAliasConflictError(
        `Document ${canonicalId} already has a different representation in ${ref.store}`,
      );
    }
    throw error;
  }
  if (inserted.rows.length > 0) return { recorded: true };

  // (store, native_id) already exists. Identical row → idempotent. Anything
  // else — another canonical, or another tenant — is a fork and is refused
  // without disclosing what it collided with.
  const existing = await exec.query(
    `SELECT canonical_id FROM c2c_document_aliases
      WHERE store = $1 AND native_id = $2 AND organization_id = $3 AND canonical_id = $4
      LIMIT 1`,
    [ref.store, ref.nativeId, ref.organizationId, canonicalId],
  );
  if (existing.rows.length > 0) return { recorded: false, reason: 'already_recorded' };
  throw new DocumentAliasConflictError(
    `${ref.store} ${ref.nativeId} is already recorded as a different document`,
  );
}

/** Every representation of a canonical document, in this organization. */
export async function aliasesFor(
  exec: AliasExecutor,
  ref: { organizationId: number; canonicalId: string },
): Promise<AliasesRead> {
  if (!Number.isInteger(ref.organizationId) || ref.organizationId <= 0) {
    throw new Error('Document alias read requires an organization');
  }
  if (!UUID_RE.test(ref.canonicalId)) return { available: true, aliases: [] };
  if (!(await relationPresent(exec))) return { available: false, reason: 'relation_absent' };
  try {
    const result = await exec.query(
      `SELECT store, native_id FROM c2c_document_aliases
        WHERE organization_id = $1 AND canonical_id = $2
        ORDER BY store, native_id`,
      [ref.organizationId, ref.canonicalId.toLowerCase()],
    );
    return {
      available: true,
      aliases: result.rows.map((r) => ({
        store: String(r.store) as DocumentAliasStore,
        nativeId: String(r.native_id),
      })),
    };
  } catch (error) {
    if (pgCode(error) === RELATION_ABSENT) return { available: false, reason: 'relation_absent' };
    throw error;
  }
}

/** The canonical identity behind a store's native id, in this organization. */
export async function canonicalIdFor(
  exec: AliasExecutor,
  ref: { organizationId: number; store: DocumentAliasStore; nativeId: string },
): Promise<CanonicalRead> {
  if (!Number.isInteger(ref.organizationId) || ref.organizationId <= 0) {
    throw new Error('Document alias read requires an organization');
  }
  if (!(await relationPresent(exec))) return { available: false, reason: 'relation_absent' };
  try {
    const result = await exec.query(
      `SELECT canonical_id FROM c2c_document_aliases
        WHERE organization_id = $1 AND store = $2 AND native_id = $3
        LIMIT 1`,
      [ref.organizationId, ref.store, ref.nativeId],
    );
    return {
      available: true,
      canonicalId: result.rows.length > 0 ? String(result.rows[0].canonical_id) : null,
    };
  } catch (error) {
    if (pgCode(error) === RELATION_ABSENT) return { available: false, reason: 'relation_absent' };
    throw error;
  }
}
