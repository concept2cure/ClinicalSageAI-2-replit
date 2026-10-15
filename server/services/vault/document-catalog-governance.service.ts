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
import type { RequestSqlClient } from '../../db/requestDb.js';
import { ProgramReadAccessError } from '../c2c/current-program-access.js';
import { requireGovernedReason } from '../../routes/governed-reason.js';
import { writeChainedAuditRow } from '../auditService.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { filingVocabularyRefusal } from './vault-filing.service.js';
import { vaultDocKindLabel } from '../../../shared/constants/domain/vault-taxonomy.js';
import { stableHash } from '../../../shared/canonical-json.js';
import { LEGACY_CATALOG_VERIFICATION_SCOPE, type LegacyCatalogVerificationScope } from '../../../shared/ana/catalog-facts.js';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership.js';
import { vaultDataEligibleSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import { verifyKeyDataAgainstText, type UnverifiedKeyDataLeaf } from './document-catalog-core.js';
import { admitCatalogActor, CatalogAdmissionError } from './document-catalog-admission.js';
import { HASH_RE, textDigest, reserveCatalogWrite, lockedCatalogSource, sourceProblem, requireWritableSource, requireUpdateReceipt, missingVectorOperation } from './document-catalog-write-integrity.js';

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
       key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6, cataloged_at = clock_timestamp(),
       catalog_state = 'suggested', proposed_by = $9, proposed_model = $10,
       proposed_thread_id = $11, proposed_turn_id = $12,
       confirmed_by = NULL, confirmed_at = NULL, correction_reason = NULL,
       updated_at = clock_timestamp()
     WHERE document_id = $7 AND content_hash = $8
     RETURNING document_id, content_hash, updated_at::text AS revision`;
/** The same write with the vector, where the column exists (pgvector). */
const SUGGEST_WITH_VECTOR = `UPDATE vault.document_catalog SET
       catalog_status = 'cataloged', document_kind = $1, purpose = $2, summary = $3,
       key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6, cataloged_at = clock_timestamp(),
       catalog_state = 'suggested', proposed_by = $9, proposed_model = $10,
       proposed_thread_id = $11, proposed_turn_id = $12,
       confirmed_by = NULL, confirmed_at = NULL, correction_reason = NULL,
       updated_at = clock_timestamp(), embedding = $13::vector
     WHERE document_id = $7 AND content_hash = $8
     RETURNING document_id, content_hash, updated_at::text AS revision`;

// ─── AnA's suggestion ──────────────────────────────────────────────────────────

export interface CatalogSuggestion {
  documentId: string;
  contentHash: string;
  /** Exact text checked before asynchronous embedding; unchanged bytes are insufficient. */
  expectedExtractedTextSha256: string;
  organizationId: number;
  programId: string;
  documentTitle: string | null;
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
  | { ok: false; refusal: string; unverifiedKeyData?: UnverifiedKeyDataLeaf[] };

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
      const receipt = await client.query(sql(true), [...params, s.embeddingLiteral]);
      requireUpdateReceipt(receipt, s.documentId, s.contentHash);
      await client.query('RELEASE SAVEPOINT catalog_vector');
      return 'embedded';
    } catch (err) {
      if (!missingVectorOperation(err)) throw err;
      await client.query('ROLLBACK TO SAVEPOINT catalog_vector');
      await client.query('RELEASE SAVEPOINT catalog_vector');
    }
  }
  params[4] = 'failed';
  const receipt = await client.query(sql(false), params);
  requireUpdateReceipt(receipt, s.documentId, s.contentHash);
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
    contentHash: s.contentHash,
    extractedTextSha256: s.expectedExtractedTextSha256,
    keyDataSha256: stableHash(s.keyData),
    checkerRevision: 'legacy-key-data-presence:v1',
    checkScope: LEGACY_CATALOG_VERIFICATION_SCOPE,
    description: `${p ? 'AnA suggested catalog record' : 'Catalog record suggested'}: ${vaultDocKindLabel(s.documentKind)}. Not yet confirmed.`,
  };
}

/**
 * Write AnA's description as a suggestion, with its chained audit row, in one
 * transaction. Refused when the bytes changed since the read, and when a
 * person has already confirmed or corrected the record.
 */
function validSuggestionIdentity(s: CatalogSuggestion): boolean {
  return HASH_RE.test(s.contentHash) && HASH_RE.test(s.expectedExtractedTextSha256 ?? '')
    && UUID_RE.test(s.documentId) && UUID_RE.test(s.programId);
}

function validSuggestionDescription(s: CatalogSuggestion): boolean {
  return typeof s.purpose === 'string' && s.purpose.trim().length > 0 && s.purpose.length <= PURPOSE_MAX
    && typeof s.summary === 'string' && s.summary.trim().length > 0 && s.summary.length <= SUMMARY_MAX;
}

function suggestionPreflight(s: CatalogSuggestion): string | null {
  if (!validSuggestionIdentity(s) || !validSuggestionDescription(s)) {
    return 'A valid source version, extraction digest and bounded description are required. Nothing was saved.';
  }
  return filingVocabularyRefusal({ evidenceKind: s.documentKind })?.message ?? null;
}

export async function writeCatalogSuggestion(input: CatalogSuggestion): Promise<SuggestionResult> {
  // Snapshot before connection acquisition/embedding-related asynchronous work.
  const s = JSON.parse(JSON.stringify(input)) as CatalogSuggestion;
  const preflight = suggestionPreflight(s);
  if (preflight) return { ok: false, refusal: preflight };
  s.documentId = s.documentId.toLowerCase(); s.programId = s.programId.toLowerCase();
  const client = await pool.connect();
  try {
    await reserveCatalogWrite(client, s.organizationId, s.programId);
    await admitCatalogActor(client, s, { write: true, hold: true });
    const source = await lockedCatalogSource(client, s);
    const extractedTextSha256 = requireWritableSource(source, s.organizationId, s.contentHash, s.expectedExtractedTextSha256);
    s.expectedExtractedTextSha256 = extractedTextSha256;
    const checked = verifyKeyDataAgainstText(s.keyData, source.extracted_text);
    if (!checked.verified) {
      await client.query('ROLLBACK');
      return { ok: false, refusal: checked.reason ?? 'The key data does not match the current source text.', unverifiedKeyData: checked.unverified };
    }
    const found = await client.query(
      `SELECT c.catalog_state, c.document_kind, c.purpose, c.summary, c.confirmed_at
         FROM vault.document_catalog c JOIN vault.documents d ON d.id = c.document_id
        WHERE c.document_id = $1 AND c.content_hash = $2 AND d.content_hash = $2
          AND d.program_id = $3::uuid AND d.organization_id = $4 AND d.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $4 AND rp.deleted_at IS NULL)
        FOR UPDATE OF c, d`,
      [s.documentId, s.contentHash, s.programId, s.organizationId],
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
    await admitCatalogActor(client, s, { write: true, hold: true });
    await client.query('COMMIT');
    return { ok: true, embeddingStatus };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // The record no longer describes the bytes AnA read: say that, not "no longer eligible".
    if (err instanceof CatalogAdmissionError && err.code === 'SOURCE_VERSION_CHANGED') return { ok: false, refusal: VERSION_CHANGED };
    if (err instanceof CatalogAdmissionError || err instanceof ProgramReadAccessError) return { ok: false, refusal: err.message };
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
  /** Optional exact extraction shown; legacy callers retain whole-record semantics. */
  expectedExtractedTextSha256?: string;
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
  extractedTextSha256: string;
}

/** The document of this project and its current record, locked; or the refusal. */
async function lockRecord(client: Client, args: ReviewCatalogArgs): Promise<ReviewRow | ReviewCatalogResult> {
  const source = await lockedCatalogSource(client, args);
  const extractedTextSha256 = requireWritableSource(source, args.organizationId, args.expectedContentHash, args.expectedExtractedTextSha256);
  const contentHash = source.content_hash;
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
  return { document_title: source.document_title, content_hash: contentHash, ...rec.rows[0], state: catalogStateOf(rec.rows[0]), extractedTextSha256 } as ReviewRow;
}

function describeReview(state: 'confirmed' | 'corrected', changes: Array<{ field: keyof CatalogFields; from: string | null; to: string }>): string {
  if (state === 'confirmed') return 'Catalog record confirmed as AnA suggested it.';
  const name: Record<keyof CatalogFields, string> = { documentKind: 'Kind', purpose: 'Purpose', summary: 'Summary' };
  const shown = (f: keyof CatalogFields, v: string | null) =>
    v == null ? 'not recorded' : f === 'documentKind' ? vaultDocKindLabel(v) : f === 'summary' ? 'changed' : v;
  return `Catalog record corrected. ${changes.map(c => `${name[c.field]}: ${c.field === 'summary' ? 'changed' : `${shown(c.field, c.from)} to ${shown(c.field, c.to)}`}`).join('; ')}`;
}

type FieldChange = { field: keyof CatalogFields; from: string | null; to: string };

/** What the decision changes, or why it is refused on this record. */
function decisionPlan(
  args: ReviewCatalogArgs,
  row: ReviewRow,
  fields: Partial<CatalogFields>,
): { current: CatalogFields; changes: FieldChange[] } | ReviewCatalogResult {
  if (args.action === 'confirm' && row.state !== 'suggested') {
    return refuse(409, 'ALREADY_DECIDED', `This record is already ${row.state}. Nothing was saved.`);
  }
  const current: CatalogFields = { documentKind: row.document_kind ?? '', purpose: row.purpose ?? '', summary: row.summary ?? '' };
  const changes = (Object.entries(fields) as Array<[keyof CatalogFields, string]>)
    .filter(([f, to]) => current[f] !== to)
    .map(([field, to]) => ({ field, from: current[field] || null, to }));
  if (args.action === 'correct' && changes.length === 0) {
    return refuse(400, 'NOTHING_TO_CHANGE', 'The values given match the record. Change at least one field. Nothing was saved.');
  }
  return { current, changes };
}

/**
 * Confirm AnA's description as written, or correct it with a reason. The
 * UPDATE and its chained audit row commit together or not at all.
 */
export async function reviewCatalogRecord(input: ReviewCatalogArgs): Promise<ReviewCatalogResult> {
  const args = JSON.parse(JSON.stringify(input)) as ReviewCatalogArgs;
  const pre = reviewPreflight(args);
  if ('ok' in pre) return pre as ReviewCatalogResult;
  args.documentId = args.documentId.toLowerCase(); args.programId = args.programId.toLowerCase();
  const client = await pool.connect();
  try {
    await reserveCatalogWrite(client, args.organizationId, args.programId);
    await admitCatalogActor(client, args, { write: true, hold: true });
    const row = await lockRecord(client, args);
    if ('ok' in row) {
      await client.query('ROLLBACK');
      return row as ReviewCatalogResult;
    }
    const plan = decisionPlan(args, row, pre.fields);
    if ('ok' in plan) {
      await client.query('ROLLBACK');
      return plan as ReviewCatalogResult;
    }
    const { current, changes } = plan;
    const state = args.action === 'confirm' ? 'confirmed' : 'corrected';
    const next = { ...current, ...pre.fields };
    const receipt = await client.query(
      `UPDATE vault.document_catalog SET
         catalog_state = $1, document_kind = $2, purpose = $3, summary = $4,
         confirmed_by = $5, confirmed_at = clock_timestamp(), correction_reason = $6,
         -- A changed description is no longer what its vector encodes.
         embedding_status = CASE WHEN $7 THEN 'stale' ELSE embedding_status END,
         updated_at = clock_timestamp()
       WHERE document_id = $8 AND content_hash = $9 AND updated_at::text = $10
       RETURNING document_id, content_hash, updated_at::text AS revision`,
      [state, next.documentKind, next.purpose, next.summary, args.userId, pre.reason, changes.length > 0,
        args.documentId, row.content_hash, args.expectedRevision],
    );
    requireUpdateReceipt(receipt, args.documentId, row.content_hash);
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
        extractedTextSha256: row.extractedTextSha256,
        extractionBindingShown: args.expectedExtractedTextSha256 !== undefined,
        keyDataSha256: stableHash(row.key_data),
        checkScope: LEGACY_CATALOG_VERIFICATION_SCOPE,
        reviewScope: 'whole_catalog_record',
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
    await admitCatalogActor(client, args, { write: true, hold: true });
    await client.query('COMMIT');
    return { ok: true, state, changes };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof CatalogAdmissionError || err instanceof ProgramReadAccessError) return refuse(err.status, err.code, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ─── What the Vault shows ──────────────────────────────────────────────────────

export interface CatalogRecordView {
  contentHash: string;
  extractedTextSha256: string | null;
  /** Check coverage, never a retrospective assertion that this row passed. */
  checkScope: Readonly<LegacyCatalogVerificationScope>;
  currentUse: { eligible: boolean; reasonCode: string | null; originalFileAvailable: boolean };
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
function catalogAttributionView(r: Record<string, any>): Pick<CatalogRecordView,
  'proposedBy' | 'proposedModel' | 'proposedAt' | 'confirmedBy' | 'confirmedAt' | 'correctionReason'> {
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return {
    proposedBy: r.proposed_by ?? null, proposedModel: r.proposed_model ?? null,
    proposedAt: iso(r.cataloged_at),
    confirmedBy: r.confirmed_by != null ? { id: Number(r.confirmed_by), name: r.confirmed_by_name ?? null } : null,
    confirmedAt: iso(r.confirmed_at), correctionReason: r.correction_reason ?? null,
  };
}

function toRecordView(r: Record<string, any>, organizationId: number, role: string): CatalogRecordView {
  const problem = sourceProblem(r, organizationId);
  const originalFileAvailable = r.original_file_available === true;
  return {
    contentHash: String(r.content_hash),
    extractedTextSha256: typeof r.extracted_text === 'string' && r.extracted_text.trim() ? textDigest(r.extracted_text) : null,
    checkScope: LEGACY_CATALOG_VERIFICATION_SCOPE,
    currentUse: { eligible: problem === null, reasonCode: problem ?? (!originalFileAvailable ? 'SOURCE_ORIGINAL_UNAVAILABLE' : null), originalFileAvailable },
    revision: r.revision ?? null,
    canWrite: vaultWriteRefusal(role) === null && GOVERNED_WRITE_ROLES.has(role) && problem === null && originalFileAvailable,
    state: catalogStateOf(r),
    documentKind: r.document_kind ?? null,
    documentKindLabel: r.document_kind ? vaultDocKindLabel(r.document_kind) : null,
    purpose: r.purpose ?? null,
    summary: r.summary ?? null,
    keyData: r.key_data ?? null,
    ...catalogAttributionView(r),
    extractionStatus: r.catalog_status ?? null,
  };
}

/** The current version's record, for a document of this project; null when it is not one. */
export async function readCatalogRecord(args: {
  executor?: RequestSqlClient;
  programId: string;
  documentId: string;
  organizationId: number;
  userId?: number | null;
}): Promise<CatalogRecordView | null> {
  args = Object.freeze({ executor: args.executor, programId: args.programId, documentId: args.documentId, organizationId: args.organizationId, userId: args.userId });
  if (!UUID_RE.test(args.programId) || !UUID_RE.test(args.documentId)) return null;
  const actorArgs = { ...args, userId: args.userId ?? null };
  const owned = !args.executor || args.executor === pool;
  const client = owned ? await pool.connect() : args.executor!;
  try {
    if (owned) await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
    await admitCatalogActor(client, actorArgs);
    const { rows } = await client.query(
    `SELECT d.organization_id, d.content_hash, d.extracted_text, c.content_hash AS catalog_content_hash,
            ${vaultDataEligibleSql('d')} AS data_eligible, ${vaultBinaryAvailableSql('d')} AS original_file_available,
            ${supersededSql('d')} AS superseded, c.catalog_status, c.catalog_state,
            c.document_kind, c.purpose, c.summary, c.key_data, c.proposed_by, c.proposed_model,
            c.cataloged_at, c.confirmed_by, u.name AS confirmed_by_name, c.confirmed_at, c.correction_reason,
            c.updated_at::text AS revision
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
       LEFT JOIN users u ON u.id = c.confirmed_by
      WHERE d.id = $1 AND d.program_id = $2 AND d.organization_id = $3 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)`,
    [args.documentId, args.programId, args.organizationId],
  );
    const current = await admitCatalogActor(client, actorArgs);
    const view = rows[0]?.organization_id === args.organizationId ? toRecordView(rows[0], args.organizationId, current.role) : null;
    if (owned) await client.query('COMMIT');
    return view;
  } catch (err) {
    if (owned) await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof CatalogAdmissionError && [401, 403, 404].includes(err.status)) return null;
    throw err;
  } finally { if (owned) (client as import('pg').PoolClient).release(); }
}
