/**
 * Check in the next version of a Vault document (VR-08, row D2).
 *
 * vault.documents is row-per-version: UNIQUE (program_id, document_code,
 * version), with `supersedes_id` naming the version a row replaces. A check-in
 * names the document by one of its versions. This module finds that version,
 * requires it to be the current head of its family in the caller's program and
 * organization, refuses bytes the family already holds, and assigns the next
 * version. The server assigns it, never the client, following FD1 (sequential
 * majors: 1.0 → 2.0 → 3.0), and a version it cannot read as a number gets no
 * invented successor.
 *
 * The ingest (vault-ingest.service.ts) calls planCheckIn twice. First without a
 * lock, before any byte is stored, so a refusal stores nothing. Then with
 * FOR UPDATE on the head inside its transaction: the second of two concurrent
 * check-ins waits there, then sees the first one's version and is refused,
 * naming it. The database guards the same rules for every writer
 * (migrations/20260930_vault_documents_version_lineage.sql).
 *
 * The algorithm follows the artifact version store's
 * (server/services/ana/artifactVersionStore.ts): lock the head, require it
 * current, refuse known bytes, assign, insert with the link.
 *
 * @module server/services/vault/vault-version-checkin
 */
import { isDeepStrictEqual } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import { closeReviewRoute } from '../review/review-route.js';
import { routeStanding } from '../review/review-route-standing.js';
import type { TaskEventNotice } from '../tasking/task-side-effects.js';

/** A pg-style client: the pool, or the ingest's transaction client. */
export interface CheckInQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** The head version a check-in succeeds, with what the new version inherits. */
export interface CheckInHead {
  id: string;
  document_code: string;
  document_type: string | null;
  version: string;
  folder_id: string | null;
  evidence_kind: string | null;
  ctd_section: string | null;
  placement_status: 'unfiled' | 'suggested' | 'confirmed';
  placement_confidence: string | null;
  placement_rationale: string | null;
  placed_by: number | null;
  classification: string | null;
  retention_policy: string | null;
}

export type CheckInRefusal = { ok: false; status: number; code: string; message: string };
export type CheckInPlan = { ok: true; head: CheckInHead; version: string } | CheckInRefusal;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The next version per FD1: the next major after the head's. `1.0` → `2.0`, and
 * `1.3` → `2.0`. Null for exhausted six-digit majors or a version that is not
 * a number (eSTAR hash labels and historical Authoring `draft-<sha8>` labels):
 * no successor is invented for a scheme the server cannot read.
 */
export function nextMajorVersion(version: string): string | null {
  const m = /^(\d{1,6})(?:\.\d{1,6})?$/.exec(version.trim());
  return m && Number(m[1]) < 999999 ? `${Number(m[1]) + 1}.0` : null;
}

const NOTHING = 'Nothing was saved.';

/** Numeric labels stay reserved after retirement; never revive or skip a live slot. */
async function assignNextRetainedVersion(q: CheckInQueryable, p: {
  programId: string; organizationId: number;
}, head: CheckInHead): Promise<{ ok: true; version: string } | CheckInRefusal> {
  const retired = await q.query(
    `SELECT max(split_part(btrim(version), '.', 1)::integer) AS major
       FROM vault.documents
      WHERE program_id = $1::uuid AND organization_id = $2 AND document_code = $3
        AND deleted_at IS NOT NULL AND btrim(version) ~ '^[0-9]{1,6}(\\.[0-9]{1,6})?$'`,
    [p.programId, p.organizationId, head.document_code],
  );
  const nextFromHead = nextMajorVersion(head.version);
  const reservedMajor = retired.rows[0]?.major;
  const version = nextFromHead && (reservedMajor == null || Number(reservedMajor) < Number(nextFromHead.split('.')[0])
    ? nextFromHead : nextMajorVersion(String(reservedMajor)));
  if (!version) return { ok: false, status: 409, code: 'VERSION_SCHEME_UNKNOWN',
    message: `Version "${head.version}" or its retained version slots cannot be advanced within the supported numeric range. ${NOTHING}` };
  const occupied = await q.query(
    `SELECT id FROM vault.documents WHERE program_id = $1::uuid AND organization_id = $2
       AND document_code = $3 AND version = $4 LIMIT 1`,
    [p.programId, p.organizationId, head.document_code, version],
  );
  if (occupied.rows[0]) return { ok: false, status: 409, code: 'VERSION_SLOT_OCCUPIED',
    message: `Version ${version} is already recorded for this document. Review its version history before adding a version. ${NOTHING}` };
  return { ok: true, version };
}

/**
 * Bytes the document already holds are refused, so a version is never added
 * twice. A restore (MR-08 Stage 5) is the one exception: the bytes are the
 * version being restored, and they are admitted unless the current version
 * already holds them.
 */
function sameBytesRefusal(
  same: Array<{ id: string; version: string }>, head: CheckInHead, restoreOf: string | undefined,
): CheckInRefusal | null {
  if (!same.length) return null;
  if (restoreOf && same.some((r) => r.id === head.id)) {
    return { ok: false, status: 409, code: 'CONTENT_ALREADY_CURRENT',
      message: `The current version, ${head.version}, already holds these exact bytes. ${NOTHING}` };
  }
  if (restoreOf && same.some((r) => r.id === restoreOf)) return null;
  return { ok: false, status: 409, code: 'CONTENT_ALREADY_A_VERSION',
    message: `These exact bytes are already version ${same[0].version} of this document. ${NOTHING}` };
}

/**
 * Plan a check-in against `headId`: refusals in the order a person can act on
 * them, else the head and the version to assign. `lock` takes FOR UPDATE on the
 * head, and holds only inside a transaction.
 */
export async function planCheckIn(
  q: CheckInQueryable,
  p: { organizationId: number; programId: string; headId: string; contentHash: string; lock?: boolean; restoreOf?: string },
): Promise<CheckInPlan> {
  const notFound: CheckInRefusal = {
    ok: false,
    status: 404,
    code: 'VERSION_HEAD_NOT_FOUND',
    message: `The document to add a version to is not in this project. ${NOTHING}`,
  };
  if (!UUID_RE.test(p.headId)) return notFound;

  const { rows } = await q.query(
    `SELECT d.id::text AS id, d.document_code, d.document_type, d.version, d.folder_id, d.evidence_kind, d.ctd_section,
            d.placement_status, d.placement_confidence, d.placement_rationale, d.placed_by,
            d.classification, d.retention_policy
       FROM vault.documents d
      WHERE d.id = $1::uuid AND d.program_id = $2::uuid AND d.organization_id = $3
        AND d.deleted_at IS NULL${p.lock ? '\n      FOR UPDATE' : ''}`,
    [p.headId, p.programId, p.organizationId],
  );
  const head = rows[0] as CheckInHead | undefined;
  if (!head) return notFound;

  /* The current version is the end of the successor chain from the one named,
     under the rule the database admits a link by (same program, organization
     and document code), so this agrees with the Vault tree about which version
     is current (vault-version-family.ts). */
  const later = await q.query(
    `WITH RECURSIVE chain AS (
       SELECT s.id, s.version, 1 AS depth FROM vault.documents s
        WHERE s.supersedes_id = $1::uuid AND s.deleted_at IS NULL
          AND s.program_id = $2::uuid AND s.organization_id = $3 AND s.document_code IS NOT DISTINCT FROM $4
       UNION ALL
       SELECT s.id, s.version, c.depth + 1 FROM vault.documents s
         JOIN chain c ON s.supersedes_id = c.id
        WHERE s.deleted_at IS NULL AND c.depth < 1000
          AND s.program_id = $2::uuid AND s.organization_id = $3 AND s.document_code IS NOT DISTINCT FROM $4
     )
     SELECT id::text AS id, version FROM chain ORDER BY depth DESC LIMIT 1`,
    [head.id, p.programId, p.organizationId, head.document_code],
  );
  const current = later.rows[0] as { id: string; version: string } | undefined;
  if (current) {
    return {
      ok: false,
      status: 409,
      code: 'VERSION_NOT_CURRENT',
      message:
        `Version ${head.version} of this document already has a newer version; the current one is ${current.version}. ` +
        `Add the new version to ${current.version}. ${NOTHING}`,
    };
  }

  /* A row written before the lineage rule can name this version although it is
     not a version of this document. The database still refuses a second
     successor (the lineage trigger), so say why here instead of failing at the
     insert, and name nothing about that row. */
  const named = await q.query(
    // tenant-isolation-safe: an existence test that mirrors the lineage trigger's second-successor check, which spans every tenant; it returns only whether the row is a version of the CALLER's own document, never a column of it.
    `SELECT (program_id = $2::uuid AND organization_id = $3 AND document_code IS NOT DISTINCT FROM $4) AS in_family
       FROM vault.documents WHERE supersedes_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
    [head.id, p.programId, p.organizationId, head.document_code],
  );
  /* A successor of this document's own family found HERE, after the chain query
     above found none, committed between the two statements: a concurrent
     check-in won the race. That is "not current", not a foreign record an
     administrator must resolve (CI run 12756, the two-concurrent-check-ins
     dbtest under load). */
  if (named.rows[0]?.in_family) {
    return {
      ok: false,
      status: 409,
      code: 'VERSION_NOT_CURRENT',
      message: `A newer version of this document was added while this one was being prepared. ${NOTHING}`,
    };
  }
  if (named.rows[0]) {
    return {
      ok: false,
      status: 409,
      code: 'VERSION_LINK_CONFLICT',
      message:
        `Another record already names version ${head.version} as the one it replaces, and it is not a version of this ` +
        `document, so no version can be added here until an administrator resolves that record. ${NOTHING}`,
    };
  }

  const same = await q.query(
    `SELECT id::text AS id, version FROM vault.documents
      WHERE program_id = $1::uuid AND organization_id = $2 AND document_code = $3 AND content_hash = $4
      ORDER BY created_at`,
    [p.programId, p.organizationId, head.document_code, p.contentHash],
  );
  const sameBytes = sameBytesRefusal(same.rows as Array<{ id: string; version: string }>, head, p.restoreOf);
  if (sameBytes) return sameBytes;

  const assigned = await assignNextRetainedVersion(q, p, head);
  return assigned.ok ? { ok: true, head, version: assigned.version } : assigned;
}

/**
 * The current version of the document recorded at `documentCode` in this
 * program and organization: the end of its successor chain, which is the one a
 * new version is added to (planCheckIn refuses any other). Used when an upload
 * conflicts with a recorded version, so the refusal can name what to add to.
 * Null when no live head holds that code, or multiple heads make it ambiguous.
 *
 * Read-only. A conflict that names another document's version is no offer.
 */
export async function currentVersionOfCode(
  q: CheckInQueryable,
  p: { organizationId: number; programId: string; documentCode: string },
): Promise<{ id: string; version: string } | null> {
  const { rows } = await q.query(
    `SELECT d.id::text AS id, d.version
       FROM vault.documents d
      WHERE d.program_id = $1::uuid AND d.organization_id = $2 AND d.document_code = $3
        AND d.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM vault.documents s
           WHERE s.supersedes_id = d.id AND s.deleted_at IS NULL
             AND s.program_id = d.program_id AND s.organization_id = d.organization_id
             AND s.document_code IS NOT DISTINCT FROM d.document_code
        )
      LIMIT 2`,
    [p.programId, p.organizationId, p.documentCode],
  );
  return rows.length === 1 ? (rows[0] as { id: string; version: string }) : null;
}

/**
 * What a check-in does not accept (VR-08): the server assigns the version, and
 * the new version keeps its document's filing. Refused before anything is
 * stored, and said, rather than silently ignored.
 */
export function checkInArgumentRefusal(args: {
  supersedesDocumentId?: string;
  version?: string;
  folderId?: string;
  evidenceKind?: string;
  ctdSection?: string;
}): { ok: false; status: number; code: string; message: string } | null {
  if (!args.supersedesDocumentId) return null;
  if (args.version !== undefined) {
    return { ok: false, status: 400, code: 'VERSION_IS_ASSIGNED',
      message: `The next version number is assigned when a version is added; do not send one. ${NOTHING}` };
  }
  if (args.folderId !== undefined || args.evidenceKind !== undefined || args.ctdSection !== undefined) {
    return { ok: false, status: 400, code: 'FILING_IS_KEPT',
      message: `A new version keeps its document's filing; move the document to file it elsewhere. ${NOTHING}` };
  }
  return null;
}

/**
 * What a check-in's audit row says of its lineage: the version it succeeds,
 * and that its filing was kept. A restore (MR-08 Stage 5) also names the
 * version whose bytes these are, and the person's reason.
 */
export function checkInLineage(head: CheckInHead, restoreOf?: { versionId: string; version: string; reason: string }) {
  return { supersedes: head.id, predecessorVersion: head.version, filingKept: true, ...(restoreOf ? { restoredFrom: restoreOf } : {}) };
}

/** The filing a new version keeps: its head's, as recorded. */
export function inheritedPlacement(h: CheckInHead) {
  return {
    folderId: h.folder_id,
    evidenceKind: h.evidence_kind,
    ctdSection: h.ctd_section,
    status: h.placement_status,
    confidence: h.placement_confidence,
    rationale: `Kept from version ${h.version} when this version was added.`,
    placedBy: h.placed_by,
    needsReview: h.placement_status === 'unfiled',
  };
}

/**
 * Plan the check-in again with the head locked FOR UPDATE, on the ingest's
 * transaction client: null when the plan still holds, else the refusal. A
 * concurrent check-in that committed first is seen here (VERSION_NOT_CURRENT,
 * naming it).
 */
export async function recheckUnderLock(
  client: CheckInQueryable,
  p: { organizationId: number; programId: string; contentHash: string; restoreOf?: string },
  planned: { head: CheckInHead; version: string },
): Promise<CheckInRefusal | null> {
  const locked = await planCheckIn(client, { ...p, headId: planned.head.id, lock: true });
  if (!locked.ok) return locked;
  if (locked.version !== planned.version) return { ok: false, status: 409, code: 'VERSION_NOT_CURRENT',
    message: `This document changed while the new version was being added. ${NOTHING}` };
  // Placement and governed metadata were prepared before storage. A current
  // head can have moved without gaining a successor; never restore stale
  // classification, retention or filing on its new version.
  if (!isDeepStrictEqual(locked.head, planned.head)) return {
    ok: false, status: 409, code: 'VERSION_METADATA_CHANGED',
    message: `The document’s filing or metadata changed while the new version was being prepared. Review its current Vault record and try again. ${NOTHING}`,
  };
  return null;
}

/**
 * A check-in makes its head no longer current, so an open review route on the
 * head's lifecycle record is withdrawn on the check-in's own transaction, with
 * the reason "Superseded by version N" (RR1a, §2.9: every exit from review
 * closes the route). The record is locked first, then the route's rows; the
 * notices go out after COMMIT. Nothing happens when the head has no record, or
 * its record has no open route.
 */
export async function withdrawHeadReviewRoute(
  client: CheckInQueryable,
  p: { organizationId: number; headId: string; version: string; actorUserId: number },
): Promise<TaskEventNotice[]> {
  const { rows } = await client.query(
    `SELECT canonical_id, title, stage FROM canonical_documents
      WHERE organization_id = $1 AND source_refs ? 'vault_documents' AND source_refs -> 'vault_documents' ->> 'nativeId' = $2
      ORDER BY created_at, canonical_id LIMIT 1 FOR UPDATE`,
    [p.organizationId, p.headId],
  );
  const record = rows[0];
  if (!record) return [];
  const standing = await routeStanding(client, {
    organizationId: p.organizationId, subjectType: 'canonical_document', subjectId: String(record.canonical_id),
    inReview: record.stage === 'in_review', forUpdate: true,
  });
  if (standing.state !== 'live') return [];
  const closed = await closeReviewRoute(drizzle(client as never) as never, {
    organizationId: p.organizationId, standing, status: 'withdrawn', reason: `Superseded by version ${p.version}`,
    actorUserId: p.actorUserId, subjectType: 'canonical_document', subjectId: String(record.canonical_id), subjectTitle: String(record.title),
  });
  return closed.notices;
}
