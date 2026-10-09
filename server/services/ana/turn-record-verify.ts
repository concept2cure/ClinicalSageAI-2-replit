/**
 * Reading an AnA turn record back, and checking it.
 *
 * The writer is ./turn-record.ts. This module only reads and verifies: every
 * verdict is recomputed from the stored bytes each time, over exactly what the
 * read returned, so a verdict can never be staler than the record it is about.
 *
 * @compliance 21 CFR Part 11 §11.10(b), (c), (e); EU Annex 11 §9.
 * @module server/services/ana/turn-record-verify
 */

import { hashPayload } from '../audit/chain.js';
import {
  sha256Hex,
  TURN_RECORD_AUDIT_ACTION,
  type Queryable,
  type TextRef,
  type TurnOutcome,
  type TurnRecordBody,
} from './turn-record.js';

/** Every text reference a record makes, for verification and export. */
export function textRefsOf(body: TurnRecordBody): TextRef[] {
  const refs: Array<TextRef | null | undefined> = [
    body.request.typed,
    body.request.sentAsQuestion,
    body.reasoning,
    body.answer.streamed,
    body.answer.stored,
  ];
  for (const m of [...body.modelInput, ...(body.roundInputs ?? []).flatMap((r) => r.messages)]) {
    refs.push(m.text);
    for (const b of m.blocks ?? []) refs.push(b.text);
  }
  for (const s of body.steps) refs.push(s.input, s.result, s.sentToModel);
  for (const d of body.outputs.drafts) refs.push(d.content);
  // From /4: each note's text is a reference like any other (turn-record.ts addEvent).
  for (const e of body.timeline ?? []) if (e.kind === 'note') refs.push(e.text);
  return refs.filter((r): r is TextRef => Boolean(r));
}

export interface TurnRecordVerdict {
  /** The stored text hashes to the stored hash. */
  recordIntact: boolean;
  /** The chained audit row for this record carries the same hash. */
  chainCarriesHash: boolean;
  /**
   * The chain row's details still hash to the payload_hash its chain link was
   * computed over. Null when the caller did not supply the payload hash.
   */
  chainPayloadIntact: boolean | null;
  /** Every referenced text is present and hashes to its reference. */
  textsIntact: boolean;
  missingTexts: string[];
  alteredTexts: string[];
  ok: boolean;
}

/**
 * Check a stored record against itself, its chain entry and its texts. Pure:
 * the caller reads the rows. The chain row's details must carry the record's
 * hash, and — when `chainPayloadHash` is given — still hash to the
 * payload_hash its chain link was computed over. Whether that link itself
 * holds is the tenant chain walk's question (verifyAuditChain), not this one.
 */
export function verifyTurnRecord(input: {
  recordText: string;
  recordSha256: string;
  chainDetails: { recordSha256?: string } | null;
  /** The chain row's payload_hash, when read from the row. */
  chainPayloadHash?: string | null;
  texts: Map<string, string>;
}): TurnRecordVerdict {
  const recordIntact = sha256Hex(input.recordText) === input.recordSha256;
  const chainCarriesHash = input.chainDetails?.recordSha256 === input.recordSha256;
  const chainPayloadIntact =
    input.chainPayloadHash === undefined
      ? null
      : Boolean(input.chainDetails) && hashPayload(input.chainDetails) === input.chainPayloadHash;
  const body = parseBody(input.recordText);
  // One entry per text, however many places reference it (the question is
  // referenced as typed, as sent and in the model input).
  const missing = new Set<string>();
  const altered = new Set<string>();
  for (const r of body ? textRefsOf(body) : []) {
    const t = input.texts.get(r.sha256);
    if (t === undefined) missing.add(r.sha256);
    else if (sha256Hex(t) !== r.sha256) altered.add(r.sha256);
  }
  const missingTexts = [...missing];
  const alteredTexts = [...altered];
  const textsIntact = Boolean(body) && missingTexts.length === 0 && alteredTexts.length === 0;
  return {
    recordIntact,
    chainCarriesHash,
    chainPayloadIntact,
    textsIntact,
    missingTexts,
    alteredTexts,
    ok: recordIntact && chainCarriesHash && chainPayloadIntact !== false && textsIntact,
  };
}

/** The record's body, or null when its text is not JSON. */
function parseBody(text: string): TurnRecordBody | null {
  try {
    return JSON.parse(text) as TurnRecordBody;
  } catch {
    return null;
  }
}

// ── Reading a record back ──────────────────────────────────────────────────

/** One stored record, its chain row and every text it references, as stored. */
export interface StoredTurnRecord {
  id: string;
  organizationId: number;
  threadId: string | null;
  runId: string | null;
  actorUserId: number | null;
  outcome: TurnOutcome;
  startedAt: string;
  endedAt: string;
  schemaVersion: string;
  recordText: string;
  recordSha256: string;
  createdAt: string;
  /** The chained audit_logs row that carries the record's hash; null when there is none. */
  chain: {
    auditLogId: string;
    chainSeq: string | null;
    sha256Chain: string | null;
    payloadHash: string | null;
    hmacSeal: string | null;
    occurredAt: string;
    details: Record<string, unknown> | null;
  } | null;
  texts: Map<string, string>;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/** Optional transport budgets for a governed consumer, not a truncated export. */
export interface TurnRecordReadLimits {
  maxRecordBytes: number;
  maxAuditBytes: number;
  maxTextBytes: number;
  maxTotalTextBytes: number;
  maxTextRefs: number;
}
export class TurnRecordReadError extends Error {
  constructor(public code: 'LIMIT_EXCEEDED' | 'INVALID_RECORD') {
    super(code === 'LIMIT_EXCEEDED' ? 'Turn record exceeds the bounded read limits.' : 'Turn record references are invalid.');
    this.name = 'TurnRecordReadError';
  }
}
function boundedRefs(body: TurnRecordBody | null, limits: TurnRecordReadLimits): TextRef[] {
  if (!body) throw new TurnRecordReadError('INVALID_RECORD');
  let refs: TextRef[];
  try { refs = textRefsOf(body); } catch { throw new TurnRecordReadError('INVALID_RECORD'); }
  if (refs.length > limits.maxTextRefs) throw new TurnRecordReadError('LIMIT_EXCEEDED');
  if (refs.some(r => typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256) ||
      !Number.isSafeInteger(r.chars) || r.chars < 0)) throw new TurnRecordReadError('INVALID_RECORD');
  return refs;
}
function validReadLimits(limits: TurnRecordReadLimits): boolean {
  const keys: Array<keyof TurnRecordReadLimits> = ['maxRecordBytes', 'maxAuditBytes', 'maxTextBytes', 'maxTotalTextBytes', 'maxTextRefs'];
  return keys.every(key => Number.isInteger(limits[key]) && limits[key] > 0 && limits[key] <= 2_147_483_647);
}
function refsForRead(body: TurnRecordBody | null, limits?: TurnRecordReadLimits): TextRef[] {
  if (limits) return boundedRefs(body, limits);
  return body ? textRefsOf(body) : [];
}
function checkReferenceLengths(refs: TextRef[], texts: Map<string, string>, limits?: TurnRecordReadLimits): void {
  if (limits && refs.some(r => texts.has(r.sha256) && texts.get(r.sha256)!.length !== r.chars)) {
    throw new TurnRecordReadError('INVALID_RECORD');
  }
}

/**
 * Read a record, its chain row and its texts, within one tenant. Null when the
 * tenant has no record with that id. Reads only — the verdict is
 * verifyTurnRecord's, over exactly what this returns.
 */
export async function loadTurnRecord(
  q: Queryable, orgId: number, id: string, limits?: TurnRecordReadLimits,
): Promise<StoredTurnRecord | null> {
  if (limits !== undefined && (!limits || !validReadLimits(limits))) {
    throw new TurnRecordReadError('LIMIT_EXCEEDED');
  }
  const rec = (
    await q.query(
      `SELECT id, organization_id, thread_id, run_id, actor_user_id, outcome, started_at, ended_at,
              schema_version, record_sha256, created_at, octet_length(record_text) AS record_bytes,
              CASE WHEN $3::integer IS NULL OR octet_length(record_text) <= $3 THEN record_text END AS record_text
         FROM ana_turn_records
        WHERE organization_id = $1 AND id = $2`,
      [orgId, id, limits?.maxRecordBytes ?? null],
    )
  ).rows[0];
  if (!rec) return null;
  if (limits && Number(rec.record_bytes) > limits.maxRecordBytes) throw new TurnRecordReadError('LIMIT_EXCEEDED');
  const chainRow = (
    await q.query(
      `SELECT id, chain_seq, sha256_chain, payload_hash, hmac_seal, occurred_at,
              octet_length(new_values::text) AS audit_bytes,
              CASE WHEN $4::integer IS NULL OR octet_length(new_values::text) <= $4 THEN new_values END AS new_values
         FROM audit_logs
        WHERE tenant_id = $1 AND action = $2 AND record_id = $3
        ORDER BY occurred_at ASC
        LIMIT 1`,
      [orgId, TURN_RECORD_AUDIT_ACTION, id, limits?.maxAuditBytes ?? null],
    )
  ).rows[0];
  if (limits && chainRow && Number(chainRow.audit_bytes) > limits.maxAuditBytes) throw new TurnRecordReadError('LIMIT_EXCEEDED');
  const body = parseBody(rec.record_text);
  const refs = refsForRead(body, limits);
  const texts = await loadTexts(q, orgId, [...new Set(refs.map(r => r.sha256))], limits);
  checkReferenceLengths(refs, texts, limits);
  return storedRecordOf(rec, chainRow, texts);
}

function storedRecordOf(rec: Record<string, any>, chainRow: Record<string, any> | undefined, texts: Map<string, string>): StoredTurnRecord {
  return {
    id: rec.id,
    organizationId: Number(rec.organization_id),
    threadId: rec.thread_id ?? null,
    runId: rec.run_id ?? null,
    actorUserId: rec.actor_user_id == null ? null : Number(rec.actor_user_id),
    outcome: rec.outcome,
    startedAt: iso(rec.started_at),
    endedAt: iso(rec.ended_at),
    schemaVersion: rec.schema_version,
    recordText: rec.record_text,
    recordSha256: rec.record_sha256,
    createdAt: iso(rec.created_at),
    chain: chainRow ? chainOf(chainRow) : null,
    texts,
  };
}

/** The texts a record references, by hash, within one tenant. */
async function loadTexts(q: Queryable, orgId: number, refs: string[], limits?: TurnRecordReadLimits): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  if (refs.length === 0) return texts;
  if (limits) return loadBoundedTexts(q, orgId, refs, limits);
  const blobs = await q.query(
    `SELECT sha256, text FROM ana_record_blobs WHERE organization_id = $1 AND sha256 = ANY($2::text[])`,
    [orgId, refs],
  );
  for (const b of blobs.rows) texts.set(b.sha256, b.text);
  return texts;
}

/** Evaluate the entire blob budget in one SQL snapshot, before transporting
 * text. CASE masks all blob text if any per-blob or aggregate limit fails. */
async function loadBoundedTexts(q: Queryable, orgId: number, refs: string[], limits: TurnRecordReadLimits): Promise<Map<string, string>> {
  const { rows } = await q.query(`WITH selected AS MATERIALIZED (
      SELECT sha256, text, octet_length(text) AS bytes FROM ana_record_blobs
      WHERE organization_id=$1 AND sha256=ANY($2::text[])
    ), budget AS (SELECT coalesce(sum(bytes),0) AS total_bytes, coalesce(max(bytes),0) AS largest FROM selected)
    SELECT s.sha256, s.bytes, b.total_bytes, b.largest,
      CASE WHEN b.total_bytes <= $3 AND b.largest <= $4 THEN s.text END AS text
    FROM selected s CROSS JOIN budget b`, [orgId, refs, limits.maxTotalTextBytes, limits.maxTextBytes]);
  if (rows.some(r => Number(r.total_bytes) > limits.maxTotalTextBytes || Number(r.largest) > limits.maxTextBytes)) {
    throw new TurnRecordReadError('LIMIT_EXCEEDED');
  }
  if (rows.some(r => typeof r.text !== 'string')) throw new TurnRecordReadError('INVALID_RECORD');
  return new Map(rows.map(r => [r.sha256, r.text]));
}

function chainOf(row: Record<string, any>): NonNullable<StoredTurnRecord['chain']> {
  const details = row.new_values ?? null;
  return {
    auditLogId: String(row.id),
    chainSeq: row.chain_seq == null ? null : String(row.chain_seq),
    sha256Chain: row.sha256_chain ?? null,
    payloadHash: row.payload_hash ?? null,
    hmacSeal: row.hmac_seal ?? null,
    occurredAt: iso(row.occurred_at),
    details: typeof details === 'string' ? JSON.parse(details) : details,
  };
}

/** The verdict over a stored record, exactly as loadTurnRecord read it. */
export function verifyStoredTurnRecord(r: StoredTurnRecord): TurnRecordVerdict {
  return verifyTurnRecord({
    recordText: r.recordText,
    recordSha256: r.recordSha256,
    chainDetails: r.chain?.details ?? null,
    chainPayloadHash: r.chain ? r.chain.payloadHash : undefined,
    texts: r.texts,
  });
}

/** One row of a record listing. */
export interface ListedTurnRecord {
  id: string;
  threadId: string | null;
  /**
   * The assistant message the turn saved, by its chat_messages id: how a
   * reloaded conversation attaches each record to its message (S4). Null for a
   * turn that saved none (a failed one).
   */
  assistantMessageId: number | null;
  actorUserId: number | null;
  outcome: TurnOutcome;
  startedAt: string;
  endedAt: string;
  recordSha256: string;
}

/** A tenant's records, newest first, optionally one thread's or one person's. */
export async function listTurnRecords(
  q: Queryable,
  orgId: number,
  filter: { threadId?: string | null; runId?: string | null; actorUserId?: number | null; limit?: number },
): Promise<ListedTurnRecord[]> {
  const params: unknown[] = [orgId];
  const where = ['organization_id = $1'];
  if (filter.threadId) {
    params.push(filter.threadId);
    where.push(`thread_id = $${params.length}`);
  }
  if (filter.runId) {
    params.push(filter.runId);
    where.push(`run_id = $${params.length}`);
  }
  if (filter.actorUserId != null) {
    params.push(filter.actorUserId);
    where.push(`actor_user_id = $${params.length}`);
  }
  params.push(Math.min(Math.max(Math.trunc(filter.limit ?? 100), 1), 500));
  const { rows } = await q.query(
    `SELECT id, thread_id, assistant_message_id, actor_user_id, outcome, started_at, ended_at, record_sha256
       FROM ana_turn_records
      WHERE ${where.join(' AND ')}
      ORDER BY started_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id ?? null,
    assistantMessageId: r.assistant_message_id == null ? null : Number(r.assistant_message_id),
    actorUserId: r.actor_user_id == null ? null : Number(r.actor_user_id),
    outcome: r.outcome,
    startedAt: iso(r.started_at),
    endedAt: iso(r.ended_at),
    recordSha256: r.record_sha256,
  }));
}
