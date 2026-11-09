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
import { qualifyServedModels, type QualifiedServedModel } from '../ai-governance/approved-models.js';
import { servedModelsOf } from './turn-record-models.js';
import { z } from 'zod';
import { openTenantPayload } from '../security/field-encryption';
import { admitRunCoordination, readCoordinationKey, requireRunOwnerContext, parseOwnerPrivacyMetadata,
  ownerPrivateReceiptForHistory, readOwnerPrivateMarkers, type RunOwnerPrivacyMetadata } from './run-control';
import { verifySequencedRow } from '../audit/chain-row';
import type { CoordinationScope, CoordinationPool } from './run-events';
import {
  sha256Hex,
  TURN_RECORD_AUDIT_ACTION,
  TURN_RECORD_RESOURCE,
  type Queryable,
  type TextRef,
  type TurnOutcome,
  type TurnRecordBody,
  OWNER_PRIVATE_TURN_SCHEMA,
} from './turn-record.js';

export interface OwnerPrivateReadScope { organizationId: number; userId: number; runId?: string; threadId?: string | null; projectId?: number | null }
const privateBoxSchema = z.object({ schema: z.literal('owner-private-text/1'), privacy: z.unknown().transform(parseOwnerPrivacyMetadata), keyArn: z.string(),
  ciphertext: z.string().max(24000000), ciphertextSha256: z.string().regex(/^[a-f0-9]{64}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), chars: z.number().int().min(0).max(16000000),
  context: z.object({ purpose: z.literal('owner_private_turn'), organizationId: z.number().int().positive(), ownerUserId: z.number().int().positive(),
    projectId: z.number().int().positive().nullable(), runId: z.string(), threadId: z.string().nullable(), recordId: z.string().uuid(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/), policyVersion: z.number().int().positive() }).strict() }).strict();
export async function openOwnerPrivateText(q: Queryable, raw: unknown, actor: OwnerPrivateReadScope): Promise<string> {
  await requireRunOwnerContext(q, actor);
  const box = privateBoxSchema.parse(raw), marker = box.privacy;
  const pairs = [[marker.organizationId,actor.organizationId],[marker.ownerUserId,actor.userId],[box.context.organizationId,marker.organizationId],
    [box.context.ownerUserId,marker.ownerUserId],[box.context.projectId,marker.projectId],[box.context.runId,marker.runId],
    [box.context.threadId,marker.threadId],[box.context.sourceHash,box.sha256],[box.context.policyVersion,marker.keyVersion],[box.keyArn,marker.keyArn]];
  if (!pairs.every(([a,b]) => a === b) || actor.runId !== undefined && actor.runId !== marker.runId ||
      actor.threadId !== undefined && actor.threadId !== marker.threadId || actor.projectId !== undefined && actor.projectId !== marker.projectId) throw new Error('OWNER_PRIVATE_SCOPE_MISMATCH');
  await ownerPrivateReceiptForHistory(q, { ...actor, runId: marker.runId, threadId: marker.threadId, projectId: marker.projectId });
  const markers = await readOwnerPrivateMarkers(q, marker);
  if (!markers.some(item => item.markerId === marker.markerId && item.markerHash === marker.markerHash) || sha256Hex(box.ciphertext) !== box.ciphertextSha256) throw new Error('OWNER_PRIVATE_CIPHERTEXT_INVALID');
  const plaintext = await openTenantPayload(box.ciphertext, box.context, box.keyArn);
  if (sha256Hex(plaintext) !== box.sha256 || plaintext.length !== box.chars) throw new Error('OWNER_PRIVATE_CIPHERTEXT_INVALID');
  await requireRunOwnerContext(q, actor);
  await ownerPrivateReceiptForHistory(q, { ...actor, runId: marker.runId, threadId: marker.threadId, projectId: marker.projectId });
  return plaintext;
}

/** Only the current owner, with current project access, can open a peer body.
 * Generic turn-record text resolution never follows these encrypted refs. */
export async function openCoordinationText(q: Pick<CoordinationPool, 'query'>, scope: CoordinationScope, raw: unknown): Promise<string> {
  await requireRunOwnerContext(q, scope);
  const admitted = await admitRunCoordination(q, scope);
  if (admitted.ownerId !== scope.userId) throw new Error('COORDINATION_OWNER_REQUIRED');
  const ref = z.object({ blobSha256: z.string().regex(/^[a-f0-9]{64}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    chars: z.number().int().min(1).max(2000), keyArn: z.string(), context: z.object({ purpose: z.literal('run_coordination'),
      organizationId: z.number().int(), projectId: z.number().int(), ownerUserId: z.number().int().positive(), derivativeId: z.string().uuid(), sourceHash: z.string(),
      policyVersion: z.number().int(), expiresAt: z.string().datetime() }).strict() }).strict().parse(raw);
  if (ref.context.organizationId !== scope.organizationId || ref.context.projectId !== admitted.projectId || ref.context.ownerUserId !== scope.userId) throw new Error('COORDINATION_CONTENT_HELD');
  const rows = await q.query('SELECT text FROM ana_record_blobs WHERE organization_id=$1 AND sha256=$2', [scope.organizationId, ref.blobSha256]);
  const ciphertext = rows.rows[0]?.text;
  if (typeof ciphertext !== 'string' || sha256Hex(ciphertext) !== ref.blobSha256) throw new Error('COORDINATION_CONTENT_HELD');
  const currentKey = await readCoordinationKey(q, scope.organizationId);
  if (currentKey.keyArn !== ref.keyArn || currentKey.version !== ref.context.policyVersion) throw new Error('COORDINATION_CONTENT_HELD');
  const plaintext = await openTenantPayload(ciphertext, ref.context, ref.keyArn);
  if (sha256Hex(plaintext) !== ref.sha256 || plaintext.length !== ref.chars) throw new Error('COORDINATION_CONTENT_HELD');
  await admitRunCoordination(q, scope);
  await requireRunOwnerContext(q, scope);
  return plaintext;
}

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
async function loadTurnRecordRows(
  q: Queryable, orgId: number, id: string, limits?: TurnRecordReadLimits,
) {
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
  return { rec, chainRow };
}
export async function loadTurnRecord(q: Queryable, orgId: number, id: string, limits?: TurnRecordReadLimits): Promise<StoredTurnRecord | null> {
  const rows = await loadTurnRecordRows(q, orgId, id, limits);
  if (!rows) return null;
  const { rec, chainRow } = rows;
  if (rec.schema_version === OWNER_PRIVATE_TURN_SCHEMA) throw new Error('OWNER_PRIVATE_RECORD');
  const body = parseBody(rec.record_text);
  const refs = refsForRead(body, limits);
  const texts = await loadTexts(q, orgId, [...new Set(refs.map(r => r.sha256))], limits);
  checkReferenceLengths(refs, texts, limits);
  return storedRecordOf(rec, chainRow, texts);
}
export interface OwnerPrivateTurnRecord {
  stored: StoredTurnRecord; decoded: { recordText: string; recordSha256: string; body: TurnRecordBody; texts: Map<string,string> };
  verification: { ok: boolean; outerRecordIntact: boolean; outerChainCarriesHash: boolean; outerChainPayloadIntact: boolean;
    outerChainLinked: boolean; innerRecordIntact: boolean; textsIntact: boolean }; privacy: RunOwnerPrivacyMetadata;
}
const privateContainerSchema = z.object({ schema: z.literal(OWNER_PRIVATE_TURN_SCHEMA), privacy: z.unknown().transform(parseOwnerPrivacyMetadata),
  originalRecordSha256: z.string().regex(/^[a-f0-9]{64}$/), bundle: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), chars: z.number().int().positive().max(24000000) }).strict() }).strict();
const privateBundleSchema = z.object({ schema: z.literal('owner-private-bundle/1'), recordText: z.string().max(16000000), recordSha256: z.string().regex(/^[a-f0-9]{64}$/),
  blobs: z.array(z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),text:z.string(),chars:z.number().int().nonnegative()}).strict()).max(20000) }).strict();
type StoredRows = NonNullable<Awaited<ReturnType<typeof loadTurnRecordRows>>>;
function privateRecordIntegrityRefused(): never { throw new Error('OWNER_PRIVATE_RECORD_INTEGRITY'); }
async function verifyPrivateOuter(q: Queryable, orgId:number,id:string,ownerId:number,rows:StoredRows) {
  const {rec,chainRow}=rows;
  if(rec.schema_version!==OWNER_PRIVATE_TURN_SCHEMA||Number(rec.actor_user_id)!==ownerId||!chainRow)throw new Error('OWNER_PRIVATE_RECORD');
  const outerRecordIntact=sha256Hex(rec.record_text)===rec.record_sha256;
  const outerChainCarriesHash=chainRow.new_values?.recordSha256===rec.record_sha256;
  const outerChainPayloadIntact=hashPayload(chainRow.new_values)===chainRow.payload_hash;
  const link=await verifySequencedRow(q,{action:TURN_RECORD_AUDIT_ACTION,actor_id:ownerId,target:`${TURN_RECORD_RESOURCE}:${id}`,
    payload_hash:chainRow.payload_hash,occurred_at:chainRow.occurred_at,tenant_id:orgId,sha256_chain:chainRow.sha256_chain,hmac_seal:chainRow.hmac_seal,chain_seq:chainRow.chain_seq});
  const outerChainLinked=link.link==='linked'&&['valid','no-key'].includes(link.seal);
  if(![outerRecordIntact,outerChainCarriesHash,outerChainPayloadIntact,outerChainLinked].every(Boolean))return privateRecordIntegrityRefused();
  return {outerRecordIntact,outerChainCarriesHash,outerChainPayloadIntact,outerChainLinked};
}
async function openPrivateBundle(q:Queryable,actor:{orgId:number;ownerId:number},rows:StoredRows,container:z.infer<typeof privateContainerSchema>,limits?:TurnRecordReadLimits) {
  const {orgId,ownerId}=actor;
  const ciphertexts=await loadTexts(q,orgId,[container.bundle.sha256],limits),boxText=ciphertexts.get(container.bundle.sha256);
  if(!boxText||sha256Hex(boxText)!==container.bundle.sha256||boxText.length!==container.bundle.chars)return privateRecordIntegrityRefused();
  const box=privateBoxSchema.parse(JSON.parse(boxText));
  if(box.privacy.markerHash!==container.privacy.markerHash)return privateRecordIntegrityRefused();
  const raw=await openOwnerPrivateText(q,box,{organizationId:orgId,userId:ownerId,runId:rows.rec.run_id,threadId:rows.rec.thread_id});
  return {ciphertexts,bundle:privateBundleSchema.parse(JSON.parse(raw))};
}
function verifyPrivateInner(rows:StoredRows,ownerId:number,container:z.infer<typeof privateContainerSchema>,bundle:z.infer<typeof privateBundleSchema>,limits?:TurnRecordReadLimits) {
  const body=parseBody(bundle.recordText);
  if(!body)return privateRecordIntegrityRefused();
  const pairs=[[body.turn.organizationId,Number(rows.rec.organization_id)],[body.turn.actorUserId,ownerId],
    [body.turn.runId,rows.rec.run_id],[body.turn.threadId,rows.rec.thread_id]];
  if(!pairs.every(([actual,expected])=>actual===expected))return privateRecordIntegrityRefused();
  const texts=new Map(bundle.blobs.map(blob=>[blob.sha256,blob.text]));
  const innerRecordIntact=sha256Hex(bundle.recordText)===bundle.recordSha256&&bundle.recordSha256===container.originalRecordSha256;
  const refs=refsForRead(body,limits);
  const textsIntact=texts.size===bundle.blobs.length&&bundle.blobs.every(blob=>sha256Hex(blob.text)===blob.sha256&&blob.text.length===blob.chars)
    &&refs.every(ref=>texts.has(ref.sha256)&&texts.get(ref.sha256)?.length===ref.chars);
  if(!innerRecordIntact||!textsIntact)return privateRecordIntegrityRefused();
  return {decoded:{recordText:bundle.recordText,recordSha256:bundle.recordSha256,body,texts},innerRecordIntact,textsIntact};
}
export async function loadOwnerPrivateTurnRecord(q: Queryable, orgId: number, id: string, ownerId: number, limits?: TurnRecordReadLimits): Promise<OwnerPrivateTurnRecord | null> {
  await requireRunOwnerContext(q,{organizationId:orgId,userId:ownerId});
  const rows=await loadTurnRecordRows(q,orgId,id,limits);
  if(!rows)return null;
  const outer=await verifyPrivateOuter(q,orgId,id,ownerId,rows);
  const container=privateContainerSchema.parse(JSON.parse(rows.rec.record_text));
  const {ciphertexts,bundle}=await openPrivateBundle(q,{orgId,ownerId},rows,container,limits);
  const {decoded,innerRecordIntact,textsIntact}=verifyPrivateInner(rows,ownerId,container,bundle,limits);
  return {stored:storedRecordOf(rows.rec,rows.chainRow,ciphertexts),decoded,
    verification:{ok:true,...outer,innerRecordIntact,textsIntact},privacy:container.privacy};
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
  /**
   * Every model that served the turn, with RULE 2's verdict on each, read from
   * the stored record text when it still matches its hash (SEC-A-7, door 3).
   * Only when the caller asks (`withServedBy`); absent when the text does not
   * match or does not parse, never guessed.
   *
   * This is what a RELOADED conversation needs to decide "Open as document"
   * and the editor's insert: the live stream hands the same list to the turn
   * it serves (`turn-record.ts`), and without it a reopened draft was refused
   * as "this page has no record of which model wrote this answer". It is the
   * browser's offer, not the authority: the hash check here does not walk the
   * audit chain, so a record forged consistently with its hash still lists, and
   * every server door re-reads the record in full (`servedModelsForTurn`,
   * `verifyMachineText`) before it credits model prose.
   *
   * Only for a turn that finished (`answered`): a stopped or failed turn's saved
   * text is not a whole answer, and its record says nothing that should open a
   * door. And only for a record of at most 256 KiB, so a 500-row listing cannot
   * pull 500 large bodies; a larger one lists without it, and the gate refuses.
   */
  servedBy?: QualifiedServedModel[];
}

/** RULE 2's verdict on each model a stored record names, when its text still matches its hash. */
function listedServedBy(recordText: unknown, recordSha256: string): QualifiedServedModel[] | undefined {
  if (typeof recordText !== 'string' || sha256Hex(recordText) !== recordSha256) return undefined;
  const body = parseBody(recordText);
  return body ? qualifyServedModels(servedModelsOf(body.model)) : undefined;
}

/** A tenant's records, newest first, optionally one thread's or one person's. */
export async function listTurnRecords(
  q: Queryable,
  orgId: number,
  filter: {
    threadId?: string | null; runId?: string | null; actorUserId?: number | null; limit?: number;
    /** Read each record's text to say which models served it (the record listing route). */
    withServedBy?: boolean;
  },
): Promise<ListedTurnRecord[]> {
  // $2 is whether to read each record's text (bound, never spliced into the SQL).
  const params: unknown[] = [orgId, filter.withServedBy === true];
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
    `SELECT id, thread_id, assistant_message_id, actor_user_id, outcome, started_at, ended_at, record_sha256,
            CASE WHEN $2::boolean AND outcome = 'answered' AND octet_length(record_text) <= 262144
                 THEN record_text END AS record_text
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
    ...(filter.withServedBy ? withServed(listedServedBy(r.record_text, r.record_sha256)) : {}),
  }));
}

const withServed = (servedBy: QualifiedServedModel[] | undefined) => (servedBy ? { servedBy } : {});
