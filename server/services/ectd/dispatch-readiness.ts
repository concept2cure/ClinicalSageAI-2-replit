/**
 * Deterministic dispatch-readiness validator over the CANONICAL CORE.
 *
 * Computes the error count that feeds the dispatch gate (dispatch-gate.ts) from
 * a sequence's `submission_leaves` — server-side truth, never a client-supplied
 * number. The whole point of the hard gate is that it cannot be talked out of a
 * blocker; that only holds if the inputs are computed, not trusted.
 *
 * HARD ERRORS are limited to unambiguous, format-independent structural defects
 * that genuinely prevent a valid dispatch (a false-positive block in a hard gate
 * is as harmful as a missed one):
 *   - EMPTY_SEQUENCE      — nothing dispatchable
 *   - UNRESOLVED_DOCUMENT — a non-delete leaf with no document to assemble:
 *     an incomplete pointer (no table, or not the key its table is addressed
 *     by — integer `documentId` for most stores, `documentUuid` for the
 *     uuid-keyed vault), or a complete pointer the DB-bound resolver
 *     (leaf-document-resolver.ts) could not find in the caller's organization.
 *     Until 2026-09-21 this check read the integer column alone, so every leaf
 *     filed from the vault (uuid set, integer null) was reported unresolved
 *     although the write path had accepted the uuid and pinned its content
 *     hash — no vault-built sequence could ever clear the gate.
 *   - DOCUMENT_CONTENT_MISMATCH — the source document resolves, but the
 *     content hash pinned on the leaf when it was filed no longer matches what
 *     the store holds. The pin exists so "is the document behind this leaf
 *     still what was filed?" has an answer; a mismatch is that answer and is
 *     never silently passed.
 *   - UNPLACEABLE_DOCUMENT_TABLE — a leaf pointing at a document table no
 *     resolver can materialize (a typo or an invented table). The write path
 *     now refuses these, but rows placed BEFORE that guard existed are still in
 *     the database, and without this finding the gate keeps reporting their
 *     sequence dispatch-clear for a package assembly can never build — the
 *     write-side allowlist cannot repair rows that are already stored.
 *   - EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE — a leaf on a DOCUMENTED external
 *     table (vault_documents) the write path legitimately accepts but the
 *     assembler cannot build into the package. transmitSequence fails closed on
 *     ANY unresolved leaf, external ones included, so a dispatch-clear verdict
 *     here would promise an operator a transmit the system will refuse.
 *   - INVALID_LIFECYCLE_OP — an operation outside new|replace|append|delete
 *
 * The delete exemption is scoped to UNRESOLVED_DOCUMENT alone. A delete is
 * backbone-only and correctly carries no document, but if a delete row DOES
 * carry a pointer the table checks still apply — the assembler resolves every
 * stored leaf without reading its operation.
 *
 * Required-section completeness is reported as a non-blocking WARNING (Module-1
 * numbering and leaf section codes don't align cleanly across regions, so it is
 * informative, not provable). Pathway/regional completeness is covered separately
 * by the pathway engines and the AI dispatch-qc advisory.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM (leaf-document-tables holds
 * the table vocabulary and has no imports of its own). Document EXISTENCE and
 * the content-pin comparison need the database, so the DB-bound caller
 * (assess-dispatch-readiness) resolves each leaf's pointer through
 * leaf-document-resolver and hands the resolution in on `ReadinessLeaf.document`;
 * this module only turns that resolution into findings. A caller that supplies
 * no resolution gets the pointer-shape checks alone.
 *
 * @module server/services/ectd/dispatch-readiness
 */

import {
  documentTableKeyKind,
  externalDocumentTableReason,
  isPlaceableDocumentTable,
  PLACEABLE_DOCUMENT_TABLE_LIST,
} from './leaf-document-tables';

/** How the content pin on a leaf compares with what its store holds now. */
export type LeafDocumentPinVerdict =
  /** Pinned and the store's digest equals the pin. */
  | 'match'
  /** Pinned and the store's digest differs. */
  | 'mismatch'
  /** No pin was taken when the leaf was filed — unknown, never "unchanged". */
  | 'unpinned'
  /** Pinned, but the store yields no digest now (content emptied, bytes gone). */
  | 'unverifiable';

/**
 * What the DB-bound resolver found behind one leaf's document pointer. ONE
 * shape for the readiness assessment, the Builder's source-document column and
 * the freeze / dispatch gate (which composes the assessment), so the three
 * cannot disagree about whether a leaf resolves.
 */
export interface LeafDocumentResolution {
  status:
    /** A document exists in this organization and its pin, if any, matches. */
    | 'resolved'
    /** The pointer is incomplete — no table, or not the key the table uses. */
    | 'no_pointer'
    /** The table is outside the placeable set; nothing can look it up. */
    | 'unplaceable_table'
    /** A complete pointer, but no such document in this organization. */
    | 'missing'
    /** The document exists but its content no longer matches the pin. */
    | 'content_changed';
  /** The key space the leaf's table is addressed by; null for an unknown table. */
  keyKind: 'integer' | 'uuid' | null;
  documentTable: string | null;
  documentId: number | null;
  documentUuid: string | null;
  /** SHA-256 pinned on the leaf when it was filed (submission_leaves.document_content_sha256). */
  pinnedSha256: string | null;
  /** The digest the store reports for the document now, on the same reading the pin was taken over. */
  storedSha256: string | null;
  pin: LeafDocumentPinVerdict;
  /** Human-readable detail for anything but a clean resolution. */
  reason: string | null;
}

export interface ReadinessLeaf {
  sectionCode: string;
  title: string;
  /** new | replace | append | delete */
  lifecycleOp: string;
  documentTable: string | null;
  /** The integer half of the polymorphic reference (integer-keyed stores). */
  documentId: number | null;
  /** The uuid half (uuid-keyed stores — vault_documents). Absent on callers
   *  that predate the column; treated as null. */
  documentUuid?: string | null;
  /** What the resolver found behind the pointer. Supplied by the DB-bound
   *  assessor; a pure caller may omit it and gets the shape checks alone. */
  document?: LeafDocumentResolution | null;
}

export interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
}

export interface DispatchReadinessReport {
  errors: number;
  warnings: number;
  infos: number;
  findings: ReadinessFinding[];
}

export interface ComputeReadinessOptions {
  /** Section codes the region marks required (e.g. region profile Module-1). */
  requiredSections?: string[];
  /**
   * True for an original (0000) sequence. In an original there is no prior
   * content, so any replace/append/delete lifecycle operation is a filing error —
   * only `new` is valid.
   */
  isOriginalSequence?: boolean;
  /** The sequence number — eCTD requires exactly four digits (e.g. "0000"). */
  sequenceNumber?: string;
}

const VALID_OPS = new Set(['new', 'replace', 'append', 'delete']);

/**
 * Lowercase, drop a leading 'm' (module prefix), and collapse separators to a
 * single '.' so codes stay segment-comparable. Stripping dots entirely would
 * conflate numerically-adjacent sections (e.g. '1.2' and '1.20' both → '12'),
 * which is the boundary the presence check relies on.
 */
function normalizeCode(code: string): string {
  return (code || '')
    .toLowerCase()
    .replace(/^m(?=\d)/, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * The document-pointer errors for ONE leaf.
 *
 * A delete leaf is exempt from the COMPLETENESS check only. In eCTD a delete is
 * a backbone-only operation: it ships no file, so carrying no document pointer
 * is its correct shape, not a defect. That exemption does NOT extend to the
 * table checks. A delete row can still carry a pointer — AnaToolExecutor takes
 * `lifecycle_op` and `document_table` on the same call — and a pointer that
 * exists must be one the assembler recognizes whatever the operation, because
 * the assembler does not read the operation: buildPackagerInputFromCore calls
 * resolveFile on EVERY stored leaf and counts each one it cannot resolve
 * against submission completeness. Written as a blanket exemption, a typo table
 * on a delete leaf read dispatch-clear.
 *
 * The completeness check and the table check are INDEPENDENT: a half-pointer
 * (an unknown table AND a null document_id) is genuinely two defects and yields
 * two findings, so `errors` can exceed the leaf count. The two table verdicts
 * are mutually exclusive by construction — a table is either outside the closed
 * set or inside it, and only a table inside it can be a documented external
 * one. Each finding predicts the same outcome: the assembler cannot produce
 * this leaf's file, and transmitSequence fails closed on any unresolved leaf.
 */
/**
 * Is the leaf's pointer complete for the key space its table is addressed by?
 * A vault leaf is complete with a uuid alone; an integer-keyed store needs the
 * integer; a table outside the placeable set has no known key space, so either
 * key counts (the table itself is reported by the UNPLACEABLE finding).
 */
export function hasCompleteDocumentPointer(leaf: {
  documentTable: string | null;
  documentId: number | null;
  documentUuid?: string | null;
}): boolean {
  if (!leaf.documentTable) return false;
  const uuid = leaf.documentUuid ?? null;
  switch (documentTableKeyKind(leaf.documentTable)) {
    case 'uuid':
      return !!uuid;
    case 'integer':
      return !!leaf.documentId;
    default:
      return !!leaf.documentId || !!uuid;
  }
}

/** The key the leaf carries, for messages: `vault_documents 1b80ee68-…`. */
function pointerLabel(leaf: ReadinessLeaf): string {
  const key = leaf.documentUuid ?? (leaf.documentId != null ? String(leaf.documentId) : null);
  return key ? `${leaf.documentTable} ${key}` : String(leaf.documentTable);
}

/**
 * What the DB-bound resolver found behind a complete pointer. A document the
 * resolver could not find is exactly as unassemblable as no pointer at all,
 * and reads under the same code; a document whose content no longer matches
 * the pin taken at filing is its own finding — it is never silently passed.
 */
function resolutionFindings(leaf: ReadinessLeaf, isDelete: boolean): ReadinessFinding[] {
  const resolution = leaf.document ?? null;
  if (!resolution) return [];
  const out: ReadinessFinding[] = [];
  if (!isDelete && resolution.status === 'missing') {
    out.push({
      severity: 'error',
      code: 'UNRESOLVED_DOCUMENT',
      sectionCode: leaf.sectionCode,
      message:
        `Leaf "${leaf.title}" (${leaf.sectionCode}) points at ${pointerLabel(leaf)}, which does not resolve in this organization` +
        `${resolution.reason ? ` — ${resolution.reason}` : ''}. It cannot be assembled into the package.`,
    });
  }
  if (resolution.status === 'content_changed') {
    out.push({
      severity: 'error',
      code: 'DOCUMENT_CONTENT_MISMATCH',
      sectionCode: leaf.sectionCode,
      message:
        `Leaf "${leaf.title}" (${leaf.sectionCode}) was filed against content with SHA-256 ${resolution.pinnedSha256 ?? 'unknown'}, ` +
        `but ${pointerLabel(leaf)} now ${resolution.storedSha256 ? `carries ${resolution.storedSha256}` : 'yields no content digest'}` +
        `${resolution.reason ? ` — ${resolution.reason}` : ''}. Re-file the leaf against the current document, or restore the filed content, before dispatch.`,
    });
  }
  return out;
}

function documentPointerFindings(leaf: ReadinessLeaf): ReadinessFinding[] {
  const out: ReadinessFinding[] = [];
  const isDelete = leaf.lifecycleOp === 'delete';

  // ERROR: an incomplete pointer — there is no document to assemble. Exempt for
  // a delete, which is backbone-only and correctly carries none. Completeness
  // is judged against the key space the table is addressed by: a vault leaf
  // is complete with its uuid and needs no integer.
  if (!isDelete && !hasCompleteDocumentPointer(leaf)) {
    out.push({
      severity: 'error',
      code: 'UNRESOLVED_DOCUMENT',
      sectionCode: leaf.sectionCode,
      message: `Leaf "${leaf.title}" (${leaf.sectionCode}) has no resolvable document — it cannot be assembled into the package.`,
    });
  }

  const table = leaf.documentTable;
  if (!table) return out;

  // What the DB-bound resolver found behind a complete pointer. A document the
  // resolver could not find is exactly as unassemblable as no pointer at all,
  // and reads under the same code; a document whose content no longer matches
  // the pin taken at filing is its own finding — it is never silently passed.
  out.push(...resolutionFindings(leaf, isDelete));

  // ERROR: a table outside the closed set — a typo or an invented table. The
  // write path refuses these now; rows written before that guard existed are
  // still in the database and must not read dispatch-clear.
  if (!isPlaceableDocumentTable(table)) {
    out.push({
      severity: 'error',
      code: 'UNPLACEABLE_DOCUMENT_TABLE',
      sectionCode: leaf.sectionCode,
      message:
        `Leaf "${leaf.title}" (${leaf.sectionCode}) points at document table "${table}", which no resolver can materialize — assembly would report it unresolved and block transmit. Expected one of: ${PLACEABLE_DOCUMENT_TABLE_LIST.join(', ')}.`,
    });
    return out;
  }

  // ERROR: a PLACEABLE but external table. The pointer is legitimate and the
  // write path accepts it; the assembler still cannot build the bytes, and
  // transmit blocks on it. Reporting it here moves that refusal from the end of
  // the filing window to the readiness report.
  const externalReason = externalDocumentTableReason(table);
  if (externalReason) {
    out.push({
      severity: 'error',
      code: 'EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE',
      sectionCode: leaf.sectionCode,
      message:
        `Leaf "${leaf.title}" (${leaf.sectionCode}) points at "${table}", which the assembler cannot materialize into the package: ${externalReason}. Transmit fails closed on it, so this sequence is not dispatchable until the leaf is re-pointed at a document the assembler can build.`,
    });
  }

  return out;
}

/**
 * Evaluate a sequence's canonical leaves for dispatch readiness. `errors` is the
 * authoritative count the dispatch gate must use; it is never inflated by the
 * informative warning/info findings.
 */
export function computeDispatchReadiness(
  leaves: ReadinessLeaf[],
  opts: ComputeReadinessOptions = {}
): DispatchReadinessReport {
  const findings: ReadinessFinding[] = [];

  const activeNonDelete = leaves.filter(l => l.lifecycleOp !== 'delete');

  // ERROR: nothing dispatchable.
  if (activeNonDelete.length === 0) {
    findings.push({
      severity: 'error',
      code: 'EMPTY_SEQUENCE',
      sectionCode: null,
      message: 'Sequence has no dispatchable leaves (every leaf is a delete or none exist).',
    });
  }

  // ERROR: eCTD sequence numbers are exactly four digits (0000, 0001, …).
  if (opts.sequenceNumber !== undefined && !/^\d{4}$/.test(opts.sequenceNumber)) {
    findings.push({
      severity: 'error',
      code: 'SEQUENCE_NUMBER_FORMAT',
      sectionCode: null,
      message: `Sequence number "${opts.sequenceNumber}" is not a valid eCTD 4-digit sequence (expected e.g. "0000").`,
    });
  }

  for (const leaf of leaves) {
    // ERROR: invalid lifecycle operation.
    if (!VALID_OPS.has(leaf.lifecycleOp)) {
      findings.push({
        severity: 'error',
        code: 'INVALID_LIFECYCLE_OP',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" has invalid lifecycle operation "${leaf.lifecycleOp}" (expected new|replace|append|delete).`,
      });
    }

    findings.push(...documentPointerFindings(leaf));

    // ERROR: replace/append/delete in an original sequence — nothing to act on.
    if (
      opts.isOriginalSequence &&
      (leaf.lifecycleOp === 'replace' || leaf.lifecycleOp === 'append' || leaf.lifecycleOp === 'delete')
    ) {
      findings.push({
        severity: 'error',
        code: 'LIFECYCLE_OP_IN_ORIGINAL',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" uses lifecycle operation "${leaf.lifecycleOp}" in an original (0000) sequence — only "new" is valid; there is no prior content to ${leaf.lifecycleOp}.`,
      });
    }

    // WARNING: a declared act on a filed leaf is NOT assessed here. It is bound
    // to the filed inventory at assembly (package-from-core), and an act that
    // cannot bind is refused there and at transmit. Saying so keeps a clean
    // verdict from being read as covering it. 2026-09-22 (W5/D7).
    if (
      !opts.isOriginalSequence &&
      (leaf.lifecycleOp === 'replace' || leaf.lifecycleOp === 'append' || leaf.lifecycleOp === 'delete')
    ) {
      findings.push({
        severity: 'warning',
        code: 'LIFECYCLE_BINDING_NOT_ASSESSED',
        sectionCode: leaf.sectionCode,
        message:
          `Leaf "${leaf.title}" declares "${leaf.lifecycleOp}". Which filed leaf it acts on is established when the ` +
          'sequence is assembled, not here — assemble before freezing; an act that cannot be bound blocks transmit.',
      });
    }
  }

  // WARNING: required sections not present (informative — prefix match).
  if (opts.requiredSections && opts.requiredSections.length) {
    const presentNorm = activeNonDelete.map(l => normalizeCode(l.sectionCode));
    for (const required of opts.requiredSections) {
      const reqNorm = normalizeCode(required);
      if (!reqNorm) continue;
      // Present iff a leaf is the required section itself or a true sub-section.
      // The trailing '.' enforces a segment boundary so '1.20' does not satisfy
      // required '1.2' (only '1.2', '1.2.1', '1.2.x', … do).
      const present = presentNorm.some(p => p === reqNorm || p.startsWith(`${reqNorm}.`));
      if (!present) {
        findings.push({
          severity: 'warning',
          code: 'MISSING_REQUIRED_SECTION',
          sectionCode: required,
          message: `Required section ${required} has no leaf in this sequence.`,
        });
      }
    }
  }

  // INFO: a section carries more than one active "new" leaf.
  const newBySection = new Map<string, number>();
  for (const leaf of activeNonDelete) {
    if (leaf.lifecycleOp === 'new') {
      newBySection.set(leaf.sectionCode, (newBySection.get(leaf.sectionCode) || 0) + 1);
    }
  }
  for (const [code, count] of newBySection) {
    if (count > 1) {
      findings.push({
        severity: 'info',
        code: 'DUPLICATE_NEW_SECTION',
        sectionCode: code,
        message: `Section ${code} has ${count} leaves with operation "new" — confirm the lifecycle is intended.`,
      });
    }
  }

  return {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    infos: findings.filter(f => f.severity === 'info').length,
    findings,
  };
}

export default { computeDispatchReadiness };
