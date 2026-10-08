/**
 * AnA's description of a Vault document is a suggestion until a person
 * confirms or corrects it (D5, Data Room catalog S4;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: completeCatalog stored the kind, purpose, summary and key data AnA
 * wrote with `cataloged_by` = the person whose session it was. Nothing said a
 * model wrote them, which one, or in which turn; no audit row was written; and
 * no screen let a person confirm or correct the record, although every
 * member's session recall and AnA's every later read served it as fact.
 *
 * Now, the same shape placement already has (vault-placement.service.ts):
 *   - writeCatalogSuggestion: AnA's write is 'suggested', names the agent, the
 *     model, the conversation and the turn, and commits with one chained
 *     `vault.document.catalog_suggest` audit row or not at all. It never
 *     replaces a record a person confirmed or corrected.
 *   - reviewCatalogRecord: a person with a Vault write role confirms the
 *     record as written, or corrects it with a reason for change; one chained
 *     `vault.document.catalog_confirm` / `catalog_correct` row carries the
 *     before, the after, the proposer and the reason.
 *   - readCatalogRecord: what the Vault panel shows.
 *
 * The kind is from the Vault's evidence-kind vocabulary on both writers
 * (filingVocabularyRefusal): a value outside it is refused, never stored.
 */
import { pool } from '../../db.js';
import { requireGovernedReason } from '../../routes/governed-reason.js';
import { writeChainedAuditRow } from '../auditService.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { filingVocabularyRefusal } from './vault-filing.service.js';
import { vaultDocKindLabel } from '../../../shared/constants/domain/vault-taxonomy.js';

export type CatalogState = 'suggested' | 'confirmed' | 'corrected';

/**
 * The record's state as every reader must see it, from the row's raw columns.
 * A description written before 20261008e has no state; it was AnA's
 * (completeCatalog's only caller is her tool), so it reads as a suggestion,
 * with its proposer not recorded. Derived here rather than in SQL text, so no
 * query interpolates a fragment (ci:sql-interpolation).
 */
export function catalogStateOf(row: { catalog_state?: unknown; document_kind?: unknown } | null | undefined): CatalogState | null {
  if (!row) return null;
  const state = row.catalog_state;
  if (state === 'suggested' || state === 'confirmed' || state === 'corrected') return state;
  return row.document_kind ? 'suggested' : null;
}

/** Who proposed a description: the agent, its model, and the turn, from the tool context. */
export interface CatalogProposer {
  actorKind: 'agent:ana';
  model: string | null;
  threadId: string | null;
  turnId: string | null;
  /** The repo's agent-audit details (agentAuditDetails), for the audit row. */
  audit: Record<string, unknown>;
}

const PURPOSE_MAX = 1_000;
const SUMMARY_MAX = 8_000;

const VERSION_CHANGED =
  'This document has a newer version than the one you read. Read the current version, then catalog it. Nothing was saved.';

type Client = import('pg').PoolClient;

const SUGGEST = `UPDATE vault.document_catalog SET
       catalog_status = 'cataloged', document_kind = $1, purpose = $2, summary = $3,
       key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6, cataloged_at = NOW(),
       catalog_state = 'suggested', proposed_by = $9, proposed_model = $10,
       proposed_thread_id = $11, proposed_turn_id = $12,
       confirmed_by = NULL, confirmed_at = NULL, correction_reason = NULL,
       updated_at = NOW()
     WHERE document_id = $7 AND content_hash = $8`;
/** The same write with the vector, where the column exists (pgvector). */
const SUGGEST_WITH_VECTOR = `UPDATE vault.document_catalog SET
       catalog_status = 'cataloged', document_kind = $1, purpose = $2, summary = $3,
       key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6, cataloged_at = NOW(),
       catalog_state = 'suggested', proposed_by = $9, proposed_model = $10,
       proposed_thread_id = $11, proposed_turn_id = $12,
       confirmed_by = NULL, confirmed_at = NULL, correction_reason = NULL,
       updated_at = NOW(), embedding = $13::vector
     WHERE document_id = $7 AND content_hash = $8`;

// ─── AnA's suggestion ──────────────────────────────────────────────────────────

export interface CatalogSuggestion {
  documentId: string;
  contentHash: string;
  organizationId: number;
  programId: string;
  documentTitle: string;
  documentKind: string;
  purpose: string;
  summary: string;
  keyData: Record<string, unknown> | null;
  embeddingStatus: 'embedded' | 'failed';
  embeddingLiteral: string | null;
  /** The person on whose behalf AnA acts; `proposer` says who wrote it. */
  userId: number | null;
  proposer: CatalogProposer | null;
}

export type SuggestionResult =
  | { ok: true; embeddingStatus: 'embedded' | 'failed' }
  | { ok: false; refusal: string };

/** The suggestion's UPDATE; the vector only where the column exists (pgvector). */
async function updateSuggestion(client: Client, s: CatalogSuggestion): Promise<'embedded' | 'failed'> {
  const params = [
    s.documentKind, s.purpose, s.summary, s.keyData ? JSON.stringify(s.keyData) : null, null, s.userId,
    s.documentId, s.contentHash, s.proposer?.actorKind ?? null, s.proposer?.model ?? null,
    s.proposer?.threadId ?? null, s.proposer?.turnId ?? null,
  ];
  const sql = (withVector: boolean) => (withVector ? SUGGEST_WITH_VECTOR : SUGGEST);
  if (s.embeddingLiteral) {
    // A savepoint: a missing vector column must not abort the transaction.
    await client.query('SAVEPOINT catalog_vector');
    try {
      params[4] = 'embedded';
      await client.query(sql(true), [...params, s.embeddingLiteral]);
      await client.query('RELEASE SAVEPOINT catalog_vector');
      return 'embedded';
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT catalog_vector');
    }
  }
  params[4] = 'failed';
  await client.query(sql(false), params);
  return 'failed';
}

/** A person's decision on the record, in words; null when there is none. */
function personDecided(row: { state: string | null; confirmed_at: unknown }): string | null {
  if (row.state !== 'confirmed' && row.state !== 'corrected') return null;
  const when = row.confirmed_at ? new Date(String(row.confirmed_at)).toISOString().slice(0, 10) : 'an earlier date';
  return (
    `A person ${row.state} this document's catalog record on ${when}, so AnA does not replace it. ` +
    'Nothing was saved. Tell the user what you would change; they can correct the record in the Vault.'
  );
}

/** The suggestion's audit details: the agent's provenance, then the write's own facts. */
function suggestionAuditDetails(
  s: CatalogSuggestion,
  before: { state: string | null; document_kind: string | null; purpose: string | null },
): Record<string, unknown> {
  const p = s.proposer;
  return {
    // First, so the write's own facts below can never be overwritten by it.
    ...(p?.audit ?? {}),
    programId: s.programId,
    documentTitle: s.documentTitle,
    proposedBy: p?.actorKind ?? null,
    model: p?.model ?? null,
    threadId: p?.threadId ?? null,
    turnId: p?.turnId ?? null,
    from: { state: before.state, documentKind: before.document_kind, purpose: before.purpose },
    to: { state: 'suggested', documentKind: s.documentKind, purpose: s.purpose },
    keyDataPaths: s.keyData ? Object.keys(s.keyData) : [],
    description: `${p ? 'AnA suggested catalog record' : 'Catalog record suggested'}: ${vaultDocKindLabel(s.documentKind)}. Not yet confirmed.`,
  };
}

/**
 * Write AnA's description as a suggestion, with its chained audit row, in one
 * transaction. Refused when the bytes changed since the read, and when a
 * person has already confirmed or corrected the record.
 */
export async function writeCatalogSuggestion(s: CatalogSuggestion): Promise<SuggestionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT c.catalog_state, c.document_kind, c.purpose, c.summary, c.confirmed_at
         FROM vault.document_catalog c
        WHERE c.document_id = $1 AND c.content_hash = $2
        FOR UPDATE`,
      [s.documentId, s.contentHash],
    );
    const before = found.rows[0] ? { ...found.rows[0], state: catalogStateOf(found.rows[0]) } : undefined;
    const refusal = !before ? VERSION_CHANGED : personDecided(before);
    if (refusal) {
      await client.query('ROLLBACK');
      return { ok: false, refusal };
    }
    const embeddingStatus = await updateSuggestion(client, s);
    await writeChainedAuditRow(client, {
      tenantId: s.organizationId,
      userId: s.userId ?? undefined,
      action: 'vault.document.catalog_suggest',
      resourceType: 'vault_document',
      resourceId: s.documentId,
      details: suggestionAuditDetails(s, before),
    });
    await client.query('COMMIT');
    return { ok: true, embeddingStatus };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ─── A person's confirmation or correction ─────────────────────────────────────

export interface ReviewCatalogArgs {
  programId: string;
  documentId: string;
  organizationId: number;
  userId: number | null;
  action: 'confirm' | 'correct';
  /** The content hash the person was shown: a record for other bytes is not confirmed. */
  expectedContentHash?: string;
  /**
   * The record revision the person was shown (readCatalogRecord's `revision`).
   * Required: AnA may re-suggest on the same bytes between the read and the
   * click, and a person never confirms text they were not shown.
   */
  expectedRevision?: string;
  /** For a correction, each field is changed only when given. */
  documentKind?: string;
  purpose?: string;
  summary?: string;
  /** Required for a correction (21 CFR 11.10(e)). */
  reason?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

interface CatalogFields { documentKind: string; purpose: string; summary: string }

export type ReviewCatalogResult =
  | { ok: true; state: 'confirmed' | 'corrected'; changes: Array<{ field: keyof CatalogFields; from: string | null; to: string }> }
  | { ok: false; status: number; code: string; message: string };

const refuse = (status: number, code: string, message: string): ReviewCatalogResult => ({ ok: false, status, code, message });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The correction's fields, checked; or the refusal. */
function correctionFields(args: ReviewCatalogArgs): Partial<CatalogFields> | ReviewCatalogResult {
  const out: Partial<CatalogFields> = {};
  if (args.documentKind !== undefined) {
    const vocab = filingVocabularyRefusal({ evidenceKind: args.documentKind });
    if (vocab || !args.documentKind.trim()) {
      return refuse(422, 'INVALID_DOCUMENT_KIND', vocab?.message ?? 'Choose a document kind. Nothing was saved.');
    }
    out.documentKind = args.documentKind.trim();
  }
  const text = (v: string | undefined, max: number, name: keyof CatalogFields, label: string) => {
    if (v === undefined) return null;
    const t = String(v).trim();
    if (!t || t.length > max) return refuse(422, 'INVALID_FIELD', `${label} is 1 to ${max} characters. Nothing was saved.`);
    out[name] = t;
    return null;
  };
  const bad = text(args.purpose, PURPOSE_MAX, 'purpose', 'The purpose') ?? text(args.summary, SUMMARY_MAX, 'summary', 'The summary');
  if (bad) return bad;
  if (Object.keys(out).length === 0) {
    return refuse(400, 'NOTHING_TO_CHANGE', 'Change the kind, purpose or summary, or confirm the record as written.');
  }
  return out;
}

/** The checks that need no database: role, ids, reason and fields. */
function reviewPreflight(args: ReviewCatalogArgs): { reason: string | null; fields: Partial<CatalogFields> } | ReviewCatalogResult {
  const roleRefusal = vaultWriteRefusal();
  if (roleRefusal) return roleRefusal;
  if (!UUID_RE.test(args.programId) || !UUID_RE.test(args.documentId)) {
    return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  }
  if (args.userId == null) return refuse(401, 'ACTOR_REQUIRED', 'No signed-in person is attached to this request, so nothing was saved.');
  if (!args.expectedRevision) {
    return refuse(400, 'REVISION_REQUIRED', 'Name the revision of the record that was shown. Nothing was saved.');
  }
  if (args.action === 'confirm') return { reason: null, fields: {} };
  if (args.action !== 'correct') return refuse(400, 'INVALID_ACTION', 'The action must be confirm or correct. Nothing was saved.');
  const reason = requireGovernedReason(args.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', `${reason.error} Nothing was saved.`);
  const fields = correctionFields(args);
  if ('ok' in fields) return fields as ReviewCatalogResult;
  return { reason: reason.reason, fields };
}

interface ReviewRow {
  document_title: string | null;
  content_hash: string;
  state: CatalogState | null;
  document_kind: string | null;
  purpose: string | null;
  summary: string | null;
  proposed_by: string | null;
  proposed_model: string | null;
  proposed_turn_id: string | null;
  key_data: unknown;
  revision: string;
}

/** The document of this project and its current record, locked; or the refusal. */
async function lockRecord(client: Client, args: ReviewCatalogArgs): Promise<ReviewRow | ReviewCatalogResult> {
  const doc = await client.query(
    `SELECT d.document_title, d.content_hash
       FROM vault.documents d
      WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)
      FOR UPDATE OF d`,
    [args.documentId, args.programId, args.organizationId],
  );
  if (!doc.rows[0]) return refuse(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  const contentHash = String(doc.rows[0].content_hash);
  if (args.expectedContentHash && args.expectedContentHash !== contentHash) {
    return refuse(409, 'CONFLICT', 'This document has a newer version than the one shown. Reload the Vault and review the current record. Nothing was saved.');
  }
  const rec = await client.query(
    `SELECT c.catalog_state, c.document_kind, c.purpose, c.summary,
            c.proposed_by, c.proposed_model, c.proposed_turn_id, c.key_data, c.updated_at::text AS revision
       FROM vault.document_catalog c
      WHERE c.document_id = $1 AND c.content_hash = $2
      FOR UPDATE`,
    [args.documentId, contentHash],
  );
  if (!rec.rows[0]?.document_kind) {
    return refuse(409, 'NOTHING_TO_REVIEW', 'No description is recorded for this version, so there is nothing to confirm. Nothing was saved.');
  }
  if (rec.rows[0].revision !== args.expectedRevision) {
    return refuse(409, 'CHANGED_SINCE_SHOWN',
      'The record changed after it was shown to you. Reload it and review the current text. Nothing was saved.');
  }
  return { document_title: doc.rows[0].document_title, content_hash: contentHash, ...rec.rows[0], state: catalogStateOf(rec.rows[0]) } as ReviewRow;
}

function describeReview(state: 'confirmed' | 'corrected', changes: Array<{ field: keyof CatalogFields; from: string | null; to: string }>): string {
  if (state === 'confirmed') return 'Catalog record confirmed as AnA suggested it.';
  const name: Record<keyof CatalogFields, string> = { documentKind: 'Kind', purpose: 'Purpose', summary: 'Summary' };
  const shown = (f: keyof CatalogFields, v: string | null) =>
    v == null ? 'not recorded' : f === 'documentKind' ? vaultDocKindLabel(v) : f === 'summary' ? 'changed' : v;
  return `Catalog record corrected. ${changes.map(c => `${name[c.field]}: ${c.field === 'summary' ? 'changed' : `${shown(c.field, c.from)} to ${shown(c.field, c.to)}`}`).join('; ')}`;
}

/**
 * Confirm AnA's description as written, or correct it with a reason. The
 * UPDATE and its chained audit row commit together or not at all.
 */
export async function reviewCatalogRecord(args: ReviewCatalogArgs): Promise<ReviewCatalogResult> {
  const pre = reviewPreflight(args);
  if ('ok' in pre) return pre as ReviewCatalogResult;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await lockRecord(client, args);
    if ('ok' in row) {
      await client.query('ROLLBACK');
      return row as ReviewCatalogResult;
    }
    if (args.action === 'confirm' && row.state !== 'suggested') {
      await client.query('ROLLBACK');
      return refuse(409, 'ALREADY_DECIDED', `This record is already ${row.state}. Nothing was saved.`);
    }
    const current: CatalogFields = { documentKind: row.document_kind ?? '', purpose: row.purpose ?? '', summary: row.summary ?? '' };
    const changes = (Object.entries(pre.fields) as Array<[keyof CatalogFields, string]>)
      .filter(([f, to]) => current[f] !== to)
      .map(([field, to]) => ({ field, from: current[field] || null, to }));
    if (args.action === 'correct' && changes.length === 0) {
      await client.query('ROLLBACK');
      return refuse(400, 'NOTHING_TO_CHANGE', 'The values given match the record. Change at least one field. Nothing was saved.');
    }
    const state = args.action === 'confirm' ? 'confirmed' : 'corrected';
    const next = { ...current, ...pre.fields };
    await client.query(
      `UPDATE vault.document_catalog SET
         catalog_state = $1, document_kind = $2, purpose = $3, summary = $4,
         confirmed_by = $5, confirmed_at = NOW(), correction_reason = $6,
         -- A changed description is no longer what its vector encodes.
         embedding_status = CASE WHEN $7 THEN 'stale' ELSE embedding_status END,
         updated_at = NOW()
       WHERE document_id = $8 AND content_hash = $9`,
      [state, next.documentKind, next.purpose, next.summary, args.userId, pre.reason, changes.length > 0,
        args.documentId, row.content_hash],
    );
    await writeChainedAuditRow(client, {
      tenantId: args.organizationId,
      userId: args.userId ?? undefined,
      action: `vault.document.catalog_${args.action}`,
      resourceType: 'vault_document',
      resourceId: args.documentId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      ...(pre.reason ? { reason: pre.reason } : {}),
      details: {
        programId: args.programId,
        documentTitle: row.document_title,
        contentHash: row.content_hash,
        proposedBy: row.proposed_by,
        proposedModel: row.proposed_model,
        proposedTurnId: row.proposed_turn_id,
        revision: row.revision,
        // Key data is not edited here; the decision covers it as shown, so its paths are named.
        keyDataPaths: row.key_data && typeof row.key_data === 'object' ? Object.keys(row.key_data as object) : [],
        from: { state: row.state, ...current },
        to: { state, ...next },
        changes,
        reason: pre.reason,
        description: describeReview(state, changes),
      },
    });
    await client.query('COMMIT');
    return { ok: true, state, changes };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ─── What the Vault shows ──────────────────────────────────────────────────────

export interface CatalogRecordView {
  contentHash: string;
  /** The record revision a confirm or correction must name (its updated_at). */
  revision: string | null;
  /** Whether the reader's role may confirm or correct; the server checks again on the write. */
  canWrite: boolean;
  /** null: the extraction tier only, or no catalog row; AnA has not described this version. */
  state: CatalogState | null;
  documentKind: string | null;
  documentKindLabel: string | null;
  purpose: string | null;
  summary: string | null;
  keyData: unknown;
  proposedBy: string | null;
  proposedModel: string | null;
  proposedAt: string | null;
  confirmedBy: { id: number; name: string | null } | null;
  confirmedAt: string | null;
  correctionReason: string | null;
  extractionStatus: string | null;
}

/** A row of the read, as the panel shows it. */
function toRecordView(r: Record<string, any>): CatalogRecordView {
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return {
    contentHash: String(r.content_hash),
    revision: r.revision ?? null,
    canWrite: vaultWriteRefusal() === null,
    state: catalogStateOf(r),
    documentKind: r.document_kind ?? null,
    documentKindLabel: r.document_kind ? vaultDocKindLabel(r.document_kind) : null,
    purpose: r.purpose ?? null,
    summary: r.summary ?? null,
    keyData: r.key_data ?? null,
    proposedBy: r.proposed_by ?? null,
    proposedModel: r.proposed_model ?? null,
    proposedAt: iso(r.cataloged_at),
    confirmedBy: r.confirmed_by != null ? { id: Number(r.confirmed_by), name: r.confirmed_by_name ?? null } : null,
    confirmedAt: iso(r.confirmed_at),
    correctionReason: r.correction_reason ?? null,
    extractionStatus: r.catalog_status ?? null,
  };
}

/** The current version's record, for a document of this project; null when it is not one. */
export async function readCatalogRecord(args: {
  programId: string;
  documentId: string;
  organizationId: number;
}): Promise<CatalogRecordView | null> {
  if (!UUID_RE.test(args.programId) || !UUID_RE.test(args.documentId)) return null;
  const { rows } = await pool.query(
    `SELECT d.content_hash, c.catalog_status, c.catalog_state,
            c.document_kind, c.purpose, c.summary, c.key_data, c.proposed_by, c.proposed_model,
            c.cataloged_at, c.confirmed_by, u.name AS confirmed_by_name, c.confirmed_at, c.correction_reason,
            c.updated_at::text AS revision
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
       LEFT JOIN users u ON u.id = c.confirmed_by
      WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)`,
    [args.documentId, args.programId, args.organizationId],
  );
  return rows[0] ? toRecordView(rows[0]) : null;
}
