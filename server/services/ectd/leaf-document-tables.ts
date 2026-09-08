/**
 * The document tables a submission leaf may point at — ONE canonical vocabulary
 * for the write boundary, the readiness gate and the assembler.
 *
 * `submission_leaves.document_table` is a POLYMORPHIC string reference (see
 * shared/schema/submissions.ts). Nothing constrained it on the write path: the
 * route schema accepted any 64-character string, `upsertLeaf` stored whatever it
 * was handed, and AnA's `place_into_sequence` forwarded a model-authored string.
 * A misspelled or invented table was accepted, audited as LEAF_CREATED, rendered
 * in the Builder, and reported dispatch-CLEAR by the deterministic readiness
 * validator — which only checked that a table string was PRESENT. The mistake
 * surfaced at transmit, as `unsupported document_table "…" — no resolver
 * registered`: a late, honest failure, but one that arrives at the end of a
 * filing window against a placement record and a readiness verdict that both
 * asserted something the system could never deliver.
 *
 * This module is PURE — no imports, no DB, no I/O — so the deterministic
 * modules (dispatch-readiness) and the mock-based service tests can depend on it
 * without pulling in the resolver's drizzle/storage graph.
 *
 * @module server/services/ectd/leaf-document-tables
 */

/**
 * Tables `materializeLeafSources` (leaf-source-resolver.ts) actually branches
 * on. Derived from the resolver's real branches, in resolver order — when a
 * branch is added there, it belongs here, and the tenancy dispatch in
 * submission-service.ts must gain a verifier for it (its drift guard fails
 * until it does).
 */
export const RESOLVABLE_DOCUMENT_TABLES: ReadonlySet<string> = new Set([
  'coauthor_documents',
  'unified_documents',
  'ctd_onboarding_documents',
  'rendered_leaf_files',
  'c2c_document_sections',
]);

/**
 * Tables whose content lives in an EXTERNAL system / as a binary upload and is
 * not locally renderable through the deterministic-PDF path. A leaf backed by
 * one of these is surfaced as unresolved, never silently dropped — so it stays
 * PLACEABLE (it is a documented target of the polymorphic reference) while
 * remaining un-assemblable until the reference model changes. A sequence that
 * still holds such a leaf at dispatch time is NOT clear: transmit fails closed
 * on any unresolved leaf, so the readiness gate reports one too.
 *
 * Module-local on purpose: `externalDocumentTableReason` below is the only way
 * to read it, so no caller can reintroduce the prototype-key `in` check.
 */
const EXTERNAL_DOCUMENT_TABLES: Record<string, string> = {
  // vault_documents CANNOT be materialized from a leaf today and is intentionally
  // left unresolved (a guard-stop, not a silent drop): submission_leaves.document_id
  // is INTEGER but vault.documents.id is a UUID (an integer cannot address the row),
  // and vault.documents has no organization_id (it is program-scoped), so there is
  // no tenant-safe lookup. Materializing it would require a reference/schema change;
  // forcing it would risk shipping wrong or cross-tenant bytes to the agency.
  vault_documents:
    'vault_documents is an external S3-backed binary in the separate `vault` schema ' +
    '(UUID-keyed, program-scoped); it cannot be addressed from an integer leaf ' +
    'document_id and has no org scope, so it is not materializable here',
};

/**
 * Every table a leaf may legitimately point at: the ones the assembler resolves,
 * plus the documented external targets it answers with an explained guard-stop.
 * Anything else is a typo or an invention and is refused at the write boundary.
 */
export const PLACEABLE_DOCUMENT_TABLES: ReadonlySet<string> = new Set([
  ...RESOLVABLE_DOCUMENT_TABLES,
  ...Object.keys(EXTERNAL_DOCUMENT_TABLES),
]);

/** Sorted, for deterministic error messages and tool-definition enums. */
export const PLACEABLE_DOCUMENT_TABLE_LIST: readonly string[] = [...PLACEABLE_DOCUMENT_TABLES].sort();

/**
 * The documented reason a table is external (and therefore not materializable
 * into a package), or null when the table is not an external target.
 *
 * Use this rather than `table in EXTERNAL_DOCUMENT_TABLES`: `in` also matches
 * inherited Object.prototype keys, so a leaf whose document_table is
 * "toString" or "constructor" would classify as an external-storage document
 * and carry a Function as its reason. Own-key lookup fails closed instead —
 * such a table falls through to "no resolver registered", which is the truth.
 */
export function externalDocumentTableReason(table: unknown): string | null {
  if (typeof table !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL_DOCUMENT_TABLES, table)) return null;
  const reason = EXTERNAL_DOCUMENT_TABLES[table];
  return typeof reason === 'string' ? reason : null;
}

/** True when `table` is a document table a leaf may point at. */
export function isPlaceableDocumentTable(table: unknown): table is string {
  return typeof table === 'string' && PLACEABLE_DOCUMENT_TABLES.has(table);
}

/** The single refusal wording, so the route, the service and AnA all say it. */
export function unplaceableDocumentTableMessage(table: string): string {
  return (
    `document_table "${table}" is not a placeable leaf source. ` +
    `Allowed: ${PLACEABLE_DOCUMENT_TABLE_LIST.join(', ')}.`
  );
}
