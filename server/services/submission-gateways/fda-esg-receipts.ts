import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { recordGovernedAction } from '../../routes/c2c/actions';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { classifyVerifiedAs2Delivery } from './as2-transport';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { readCsrProjectActor, CsrScopeError } from '../csr/project-scope';
import { writeChainedAuditRow } from '../auditService';
import { LAUNCH_SEQUENCE_MAX_BYTES, launchSequenceSizeRefusal } from '../ectd/ectd-regional-rules';

export class FdaAs2ReceiptRefusal extends Error {
  constructor(readonly code: string, readonly status: 400 | 403 | 404 | 409 | 422, message: string) { super(message); }
}
/** `environment` is the original send's, as its binding recorded it: a receipt from the agency's test environment files nothing (F1, row D7). */
export interface FdaAs2ReceiptResult { verified: true; recorded: true; status: 'received' | 'rejected'; duplicate: boolean; auditTrail: true; sequenceResolution: 'resolved' | 'already-resolved' | 'unreconciled'; environment: 'staging' | 'production' }
interface ReceiptBinding { messageId: string; mic: string; environment: 'staging' | 'production' }
function bindingOf(metadata: Record<string, unknown> | null): ReceiptBinding {
  const binding = metadata?.as2 as Partial<ReceiptBinding> | undefined;
  if (!binding || typeof binding.messageId !== 'string' || typeof binding.mic !== 'string' || !['staging', 'production'].includes(String(binding.environment))) {
    throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_BINDING_MISSING', 409, 'The original AS2 message binding is unavailable. This receipt cannot be attached by guessing.');
  }
  return binding as ReceiptBinding;
}

type ReceiptInput = { organizationId: number; transmittalId: number; userId: number; body: Buffer; contentType: string };

async function verifyUploadedReceipt(args: ReceiptInput) {
  if (![args.organizationId, args.transmittalId, args.userId].every(id => Number.isSafeInteger(id) && id > 0) || !Buffer.isBuffer(args.body) || !args.body.length || args.body.length > 8 * 1024 * 1024) throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_INVALID', 400, 'A bounded receipt file and authenticated tenant/actor are required.');
  const { rows } = await pool.query(`SELECT metadata, bundle_sha256 FROM submission_transmittals WHERE id = $1 AND organization_id = $2 AND region = 'fda' AND gateway = 'esg' AND transport = 'as2'`, [args.transmittalId, args.organizationId]);
  if (!rows.length) throw new FdaAs2ReceiptRefusal('TRANSMITTAL_NOT_FOUND', 404, 'This AS2 transmittal is not accessible.');
  const binding = bindingOf(rows[0].metadata);
  const prefix = binding.environment === 'production' ? 'FDA_ESG_' : 'FDA_ESG_STAGING_';
  const path = process.env[`${prefix}MDN_CERT_PATH`] || process.env[`${prefix}FDA_CERT_PATH`];
  if (!path) throw new FdaAs2ReceiptRefusal('AS2_MDN_CERTIFICATE_UNAVAILABLE', 409, 'The recorded environment has no pinned agency receipt certificate.');
  const outcome = await classifyVerifiedAs2Delivery({ ok: true, response: { httpStatus: 200, headers: { 'content-type': args.contentType }, body: args.body } }, binding.messageId, { agencyCertPem: await fs.readFile(path, 'utf8'), expectedMic: binding.mic });
  if (outcome.kind !== 'RECEIVED' && outcome.kind !== 'REFUSED_BY_AGENCY') throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_NOT_VERIFIED', 422, 'The receipt signature, original message or payload MIC did not establish a verified agency outcome. No status was changed.');
  const status: 'received' | 'rejected' = outcome.kind === 'RECEIVED' ? 'received' : 'rejected';
  const sha256 = createHash('sha256').update(args.body).digest('hex');
  return { binding, status, sha256 };
}

async function requireReceiptActor(client: PoolClient, args: ReceiptInput) {
    try {
      const actor = await readCsrProjectActor(client, args.organizationId, args.userId);
      if (!GOVERNED_WRITE_ROLES.has(String(actor.role ?? '').toLowerCase())) throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_WRITE_DENIED', 403, 'Current governed write permission is required to record a receipt.');
    } catch (err) {
      if (err instanceof CsrScopeError) throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_WRITE_DENIED', 403, 'Current active organization membership is required to record a receipt.');
      throw err;
    }
}

function nextReceiptStatus(currentStatus: string, status: 'received' | 'rejected') {
    const accepted = new Set(['received', 'ack1_received', 'ack2_received', 'ack3_received']);
    // Synchronous agency refusal can already have marked this transmittal
    // rejected while its sequence retains the ambiguous-delivery claim. The
    // same independently verified negative MDN may settle that exact attempt;
    // a conflicting positive receipt must still require separate reconciliation.
    const matchingRejected = status === 'rejected' && currentStatus === 'rejected';
    if (!matchingRejected && ((status === 'rejected' && accepted.has(currentStatus)) || !['in_transit', ...accepted].includes(currentStatus))) throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_STATE_CONFLICT', 409, 'This receipt conflicts with the retained transmittal state. Reconcile it before changing the record.');
    return accepted.has(currentStatus) && status === 'received' ? currentStatus : status;
}

/** Import an actual signed MDN, never a caller-selected ACK or center-acceptance stage. */
export async function ingestFdaAs2Receipt(args: ReceiptInput): Promise<FdaAs2ReceiptResult> {
  const { binding, status, sha256 } = await verifyUploadedReceipt(args);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await setTenantContextTx(client, args.organizationId);
    await requireReceiptActor(client, args);
    const current = (await client.query(`SELECT status, metadata, bundle_sha256 FROM submission_transmittals WHERE id = $1 AND organization_id = $2 AND region = 'fda' AND gateway = 'esg' AND transport = 'as2' FOR UPDATE`, [args.transmittalId, args.organizationId])).rows[0];
    if (!current) throw new FdaAs2ReceiptRefusal('TRANSMITTAL_NOT_FOUND', 404, 'This AS2 transmittal is not accessible.');
    const liveBinding = bindingOf(current.metadata);
    if (liveBinding.messageId !== binding.messageId || liveBinding.mic !== binding.mic || liveBinding.environment !== binding.environment) throw new FdaAs2ReceiptRefusal('AS2_RECEIPT_BINDING_CHANGED', 409, 'The original AS2 binding changed during verification. Nothing was recorded.');
    const history = Array.isArray(current.metadata?.as2ReceiptHistory) ? current.metadata.as2ReceiptHistory : [];
    const contradicted = contradictedSettlement(current.metadata, status);
    if (history.some((entry: { sha256?: string; contradicts?: string }) => entry?.sha256 === sha256 && entry.contradicts)) {
      throw contradictionRefusal(current.metadata, status);
    }
    if (contradicted) {
      await keepContradictingReceipt(client, args, current, { sha256, status, messageId: binding.messageId, history });
      await client.query('COMMIT');
      throw contradictionRefusal(current.metadata, status);
    }
    if (history.some((entry: { sha256?: string }) => entry?.sha256 === sha256)) {
      const sequenceResolution = await resolveReceiptSequence(client, args.organizationId, current, status);
      await client.query('COMMIT'); return { verified: true, recorded: true, status, duplicate: true, auditTrail: true, sequenceResolution, environment: binding.environment };
    }
    const nextStatus = nextReceiptStatus(current.status, status);
    const observedAt = new Date().toISOString();
    const receipt = { sha256, bodyBase64: args.body.toString('base64'), contentType: args.contentType, receivedAt: observedAt, verified: true, submittedBy: args.userId, source: 'agency-signed-upload', status };
    const metadata = { ...current.metadata, as2Receipt: receipt, as2ReceiptHistory: [...history, receipt] };
    const sequenceResolution = await resolveReceiptSequence(client, args.organizationId, current, status, {
      userId: args.userId, transmittalId: args.transmittalId, receiptSha256: sha256, originalMessageId: binding.messageId,
    });
    await client.query(`UPDATE submission_transmittals SET status = $3, metadata = $4::jsonb, mdn_raw = $5,
      ack_received_at = CASE WHEN $3 = 'received' THEN COALESCE(ack_received_at, $6::timestamptz) ELSE ack_received_at END,
      transmission_id = COALESCE(transmission_id, $7), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [args.transmittalId, args.organizationId, nextStatus, JSON.stringify(metadata), args.body.toString('utf8'), observedAt, binding.messageId]);
    await recordGovernedAction(client, { orgId: args.organizationId, userId: args.userId, command: 'transition', target: `submission-transmittal:${args.transmittalId}`, reason: 'Recorded cryptographically verified FDA AS2 receipt', domain: 'regulatory', surface: 'gateway-transmittals',
      payload: { receiptSha256: sha256, from: current.status, to: nextStatus, receiptKind: 'AS2-MDN', originalMessageId: binding.messageId, micVerified: status === 'received', sequenceResolution },
    });
    await client.query('COMMIT'); return { verified: true, recorded: true, status, duplicate: false, auditTrail: true, sequenceResolution, environment: binding.environment };
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

type ReceiptTransmittal = { metadata: Record<string, unknown> | null; bundle_sha256: string };
interface DispatchBinding { organizationId: number; sequenceId: number; signatureActionId: string; attemptId: string; bundleSha256: string }
function dispatchBindingOf(transmittal: ReceiptTransmittal, organizationId: number): DispatchBinding | null {
  const binding = transmittal.metadata?.dispatchBinding as Partial<DispatchBinding> | undefined;
  if (!binding || binding.organizationId !== organizationId || !Number.isSafeInteger(binding.sequenceId) || !binding.sequenceId || binding.sequenceId <= 0 || typeof binding.signatureActionId !== 'string' || !binding.signatureActionId || typeof binding.attemptId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(binding.attemptId) || binding.bundleSha256 !== transmittal.bundle_sha256) return null;
  return binding as DispatchBinding;
}
async function resolveReceiptSequence(client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> }, organizationId: number, transmittal: ReceiptTransmittal, status: 'received' | 'rejected', receipt?: { userId: number; transmittalId: number; receiptSha256: string; originalMessageId: string }): Promise<FdaAs2ReceiptResult['sequenceResolution']> {
  const binding = dispatchBindingOf(transmittal, organizationId);
  if (!binding) return 'unreconciled';
  // F1 (row D7, 2026-11-01): only a production receipt files the sequence. One
  // from the agency's test environment settles the attempt it binds to
  // 'pending', never 'sent' or 'rejected': the test environment's verdict is not
  // FDA's, and the sequence can still be filed (submission-service.ts
  // toDispatchStatus). `!==`, so an environment that is neither files nothing.
  const environment = (transmittal.metadata?.as2 as Partial<ReceiptBinding> | undefined)?.environment;
  const next = environment !== 'production' ? 'pending' : status === 'received' ? 'sent' : 'rejected';
  if (receipt) {
    const sequence = (await client.query(`SELECT id FROM ectd_sequences WHERE id=$1 AND organization_id=$2
      AND status='dispatched' AND deleted_at IS NULL FOR UPDATE`, [binding.sequenceId, organizationId])).rows[0];
    if (!sequence) return 'unreconciled';
    // A signed positive or negative MDN proves this wire attempt occurred.
    // Use the same one-use ledger as transmitSequence, inside this transaction,
    // so a released rejection can never re-authorize its original signature.
    await spendTransmitSignature(client as Queryable, {
      organizationId, userId: receipt.userId, sequenceId: binding.sequenceId, signatureActionId: binding.signatureActionId,
      details: { ...receipt, transmitAttemptId: binding.attemptId, status, environment, region: 'fda', gateway: 'esg', source: 'agency-signed-receipt-reconciliation' },
    });
    const changed = await client.query(`UPDATE ectd_sequences SET dispatch_status = $3, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'dispatched' AND deleted_at IS NULL
        AND dispatch_status = 'transmitting' AND transmit_signature_action_id = $4 AND transmit_attempt_id=$5::uuid RETURNING id`, [binding.sequenceId, organizationId, next, binding.signatureActionId, binding.attemptId]);
    if (changed.rows.length) return 'resolved';
  }
  const row = (await client.query(`SELECT dispatch_status FROM ectd_sequences WHERE id = $1 AND organization_id = $2
    AND deleted_at IS NULL AND transmit_signature_action_id = $3 AND transmit_attempt_id=$4::uuid`, [binding.sequenceId, organizationId, binding.signatureActionId, binding.attemptId])).rows[0];
  return row?.dispatch_status === next || agreesWithFiledSequence(status, environment, row?.dispatch_status) ? 'already-resolved' : 'unreconciled';
}
/** P-92 (§3.3): after a signed settlement recorded the send as received, a positive production MDN agrees with it,
 *  whether the settlement read an Ack2 ('sent') or an Ack3 ('acknowledged'). */
function agreesWithFiledSequence(status: 'received' | 'rejected', environment: unknown, dispatchStatus: unknown): boolean {
  return status === 'received' && environment === 'production' && (dispatchStatus === 'sent' || dispatchStatus === 'acknowledged');
}

// ── P-92: a held FDA send, settled by a signed act (founder 2026-11-02; P-108 1(b); design §3, §10.3, §10.4) ──────

type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
/** Every act that spends a signature on a sequence, as Gate 1 reads it (submission-service.ts signatureSpentBy). */
const SIGNATURE_SPENDING_ACTIONS = ['SEQUENCE_FROZEN', 'SEQUENCE_DISPATCHED', 'ECTD_TRANSMITTED', 'GOVERNED_SIGNATURE_VOIDED', 'TRANSMIT_BLOCKED',
  'SHADOW_REVIEW_WAIVED', 'SHADOW_FINDING_DISPOSITIONED', 'ECTD_SEQUENCE_RETIRED', 'ECTD_HELD_SEND_SETTLED'];

/** Spend a transmit signature S, once: the receipt path and the settlement share this (§3.3), so S never authorizes a second send. */
export async function spendTransmitSignature(client: Queryable, p: {
  organizationId: number; userId: number; sequenceId: number; signatureActionId: string; details: Record<string, unknown>;
}): Promise<void> {
  const spent = await client.query(`SELECT action FROM audit_logs WHERE tenant_id = $1 AND table_name = 'ectd_sequence' AND record_id = $2
      AND action = ANY($3::text[]) AND new_values::jsonb->>'signatureActionId' = $4 LIMIT 1`,
  [p.organizationId, String(p.sequenceId), SIGNATURE_SPENDING_ACTIONS, p.signatureActionId]);
  if (spent.rows.length) return;
  await writeChainedAuditRow(client as PoolClient, {
    organizationId: p.organizationId, userId: p.userId, action: 'ECTD_TRANSMITTED', resourceType: 'ectd_sequence', resourceId: p.sequenceId,
    details: { ...p.details, signatureActionId: p.signatureActionId },
  });
}

/** How long a send with no finishing write must be quiet before it can be settled (E5(b)). */
export const HELD_SEND_QUIET_PERIOD_MS = 24 * 60 * 60 * 1000;
export const HELD_SEND_OUTCOMES = ['received', 'not-received'] as const;
export const HELD_SEND_EVIDENCE_KINDS = ['ack2', 'ack3', 'fda-non-receipt-confirmation', 'platform-proof'] as const;
export type HeldSendOutcome = typeof HELD_SEND_OUTCOMES[number];
export type HeldSendEvidenceKind = typeof HELD_SEND_EVIDENCE_KINDS[number];
/** The platform's own proof that nothing left (E9, E9′). */
export type PlatformProof = 'no-as2-message' | 'sftp-client-never-shipped';
export interface HeldSendSequence { id: number; sequenceNumber: string; dispatchStatus: string | null; transmitSignatureActionId: string | null; transmitAttemptId: string | null }
export interface HeldSendTransmittal {
  id: number; transport: string; status: string; environment: string | null; as2Environment: string | null; as2MessageId: string | null;
  verifiedReceipt: boolean; hasReceipt: boolean; httpStatus: number | null; transmissionId: string | null; errorMessage: string | null;
  acknowledged: boolean; hasMdn: boolean; submittedAt: string; updatedAt: string; settlement: Record<string, unknown> | null; bundleSizeBytes: number | null;
}
export interface HeldSendFacts { sequence: HeldSendSequence; transmittal: HeldSendTransmittal | null; now: number }

function as2Facts(m: Record<string, any>) {
  const as2 = m.as2 && typeof m.as2.messageId === 'string' ? m.as2 : null;
  return { as2MessageId: as2 ? String(as2.messageId) : null, as2Environment: as2 && typeof as2.environment === 'string' ? String(as2.environment) : null };
}
function transmittalFacts(r: Record<string, any>): HeldSendTransmittal {
  const m = (r.metadata ?? {}) as Record<string, any>;
  const settlement = m.heldSendSettlement && typeof m.heldSendSettlement === 'object' ? m.heldSendSettlement as Record<string, unknown> : null;
  return {
    id: Number(r.id), transport: String(r.transport ?? ''), status: String(r.status ?? ''),
    environment: typeof m.environment === 'string' ? m.environment : null, ...as2Facts(m),
    verifiedReceipt: m.as2Receipt?.verified === true, hasReceipt: Boolean(m.as2Receipt),
    httpStatus: r.http_status == null ? null : Number(r.http_status), transmissionId: r.transmission_id ?? null, errorMessage: r.error_message ?? null,
    acknowledged: r.ack_received_at != null, hasMdn: r.has_mdn === true,
    submittedAt: new Date(r.submitted_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(), settlement,
    bundleSizeBytes: r.bundle_size_bytes == null ? null : Number(r.bundle_size_bytes),
  };
}

/** E2: the one FDA ESG transmittal bound to this attempt (A) and its signature (S). Two throw: fail closed, as slice 1's fold. */
export async function readHeldSend(q: Queryable, organizationId: number, seq: HeldSendSequence, opts: { lock?: boolean } = {}): Promise<HeldSendFacts> {
  const now = Date.now();
  if (!seq.transmitSignatureActionId || !seq.transmitAttemptId) return { sequence: seq, transmittal: null, now };
  const params = [organizationId, String(seq.id), seq.transmitAttemptId];
  // Two literal statements, the act's under FOR UPDATE: no SQL text is built from an expression (ci:sql-interpolation).
  const { rows } = opts.lock
    ? await q.query(`SELECT id, transport, status, metadata, bundle_sha256, bundle_size_bytes, http_status, transmission_id, error_message,
      ack_received_at, mdn_raw IS NOT NULL AS has_mdn, submitted_at, updated_at FROM submission_transmittals
    WHERE organization_id = $1 AND region = 'fda' AND gateway = 'esg' AND metadata->'dispatchBinding'->>'sequenceId' = $2::text
      AND lower(metadata->'dispatchBinding'->>'attemptId') = lower($3) ORDER BY id FOR UPDATE`, params)
    : await q.query(`SELECT id, transport, status, metadata, bundle_sha256, bundle_size_bytes, http_status, transmission_id, error_message,
      ack_received_at, mdn_raw IS NOT NULL AS has_mdn, submitted_at, updated_at FROM submission_transmittals
    WHERE organization_id = $1 AND region = 'fda' AND gateway = 'esg' AND metadata->'dispatchBinding'->>'sequenceId' = $2::text
      AND lower(metadata->'dispatchBinding'->>'attemptId') = lower($3) ORDER BY id`, params);
  const bound = rows.filter((r) => dispatchBindingOf(r as ReceiptTransmittal, organizationId)?.signatureActionId === seq.transmitSignatureActionId);
  if (bound.length > 1) throw new Error(`Two FDA transmittals are bound to one attempt of sequence ${seq.sequenceNumber}`);
  return { sequence: seq, transmittal: bound[0] ? transmittalFacts(bound[0]) : null, now };
}

/** "3 November 2026 at 14:05 UTC": how a held send's date is said. */
export function heldSendWhen(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()} at ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
const NOTHING = 'Nothing was changed.';
const settledWords = (t: HeldSendTransmittal) => `${t.settlement?.outcome === 'received' ? 'recorded as received' : 'released'} on ${heldSendWhen(String(t.settlement?.settledAt ?? t.updatedAt))}`;
const ended = (t: HeldSendTransmittal, now: number) =>
  t.status === 'received' || t.status === 'rejected' || t.errorMessage !== null || now - Date.parse(t.updatedAt) >= HELD_SEND_QUIET_PERIOD_MS;

/** E1–E5: what keeps a held send from being settled either way, in words; null when it may be settled. */
export function heldSendBlocker(f: HeldSendFacts): string | null {
  const n = f.sequence.sequenceNumber;
  if (f.sequence.dispatchStatus !== 'transmitting') return `Sequence ${n} has no held send to settle. ${NOTHING}`;
  if (!f.sequence.transmitSignatureActionId || !f.sequence.transmitAttemptId) {
    return `Sequence ${n}'s held send was claimed before the platform bound each send to its signature, so which transmission it was cannot be read, and it is not settled by guess. ${NOTHING}`;
  }
  const t = f.transmittal;
  if (!t) return `No FDA transmission is recorded for sequence ${n}'s held send, so there is no FDA answer to settle it with. Only a held send to FDA is settled here. ${NOTHING}`;
  if (t.environment === 'staging' || t.as2Environment === 'staging') return `Sequence ${n}'s held send went to FDA's test environment, which is not a filing, so it is not settled here. ${NOTHING}`;
  if (t.environment !== 'production') return `Where sequence ${n}'s held send went is not recorded, so it is not settled here. ${NOTHING}`;
  if (t.settlement) return `Sequence ${n}'s held send is already settled (${settledWords(t)}). ${NOTHING}`;
  if (t.status === 'received' || t.verifiedReceipt || !['pending', 'in_transit', 'rejected'].includes(t.status)) {
    return "FDA's signed answer to this send is already kept on the platform, so it is not settled by a signature here. On Gateway transmittals, " +
      "download FDA's answer from this send's row and record it with 'Record agency MDN', which checks FDA's signature on it and records the send by " +
      `FDA's own answer. ${NOTHING}`;
  }
  if (!ended(t, f.now)) {
    return `This send of sequence ${n} may still be in progress, so it is not settled yet. ${NOTHING} If the platform hears nothing more of it, ` +
      `it can be settled after ${heldSendWhen(new Date(Date.parse(t.updatedAt) + HELD_SEND_QUIET_PERIOD_MS).toISOString())}.`;
  }
  return null;
}

/** E5b: "received" needs a send that left, and that FDA's endpoint did not refuse when it was made. */
export function receivedRefusal(t: HeldSendTransmittal): string | null {
  if (t.transport !== 'as2' || !t.as2MessageId || t.status === 'pending') {
    return `The platform's record shows this send never left the platform, so an FDA acknowledgement cannot be for it. ${NOTHING}`;
  }
  if (t.status === 'rejected' && t.httpStatus !== null && t.httpStatus >= 400 && t.httpStatus < 500) {
    return `FDA's AS2 endpoint refused this send when it was made, so FDA did not unpack it and an acknowledgement cannot be for it. ${NOTHING}`;
  }
  return null;
}

/** E9 and E9′: the platform's own proof that nothing left, or null. AS2 only for the first, SFTP only for the second (B1 (d)). */
export function platformProofOf(t: HeldSendTransmittal): PlatformProof | null {
  if (t.transport === 'as2') return t.as2MessageId ? null : 'no-as2-message';
  if (t.transport !== 'sftp') return null;
  const nothingCameBack = !t.as2MessageId && !t.hasReceipt && !t.transmissionId && !t.acknowledged && !t.hasMdn;
  return nothingCameBack && ['pending', 'in_transit', 'rejected'].includes(t.status) ? 'sftp-client-never-shipped' : null;
}
export function platformProofRefusal(t: HeldSendTransmittal): string {
  return t.transport === 'as2' && t.as2MessageId
    ? `The platform's record does not prove this send never left: an AS2 message was formed for it. Only FDA's written confirmation of non-receipt releases it. ${NOTHING}`
    : `The platform's record does not prove this send never left: it holds an answer or an identifier from the far side. Only FDA's written confirmation of non-receipt releases it. ${NOTHING}`;
}

/** E7: the kind fits the outcome. */
export function evidenceKindRefusal(outcome: HeldSendOutcome, kind: unknown): string | null {
  const fits = outcome === 'received' ? kind === 'ack2' || kind === 'ack3' : kind === 'fda-non-receipt-confirmation' || kind === 'platform-proof';
  return fits ? null : "An Ack2 or Ack3 records a send as received; FDA's written confirmation of non-receipt, or the platform's own proof that nothing left, releases it.";
}

const RISK = (n: string) => `If FDA did receive the first send after all, sending sequence ${n} again files it twice: FDA would hold two copies of sequence ${n}, and may refuse the second or require it to be corrected.`;
/** The one source of a settlement's words (§3.4, §10.3 A.1, §10.4 (c)): the precheck answers it, the payload binds it, the act repeats it. */
export function heldSendStatement(p: {
  outcome: HeldSendOutcome; kind: HeldSendEvidenceKind; sequenceNumber: string; sentAt: string; as2MessageId: string | null; proof: PlatformProof | null; bundleSizeBytes: number | null;
}): string {
  const n = p.sequenceNumber;
  const when = heldSendWhen(p.sentAt);
  const id = p.as2MessageId ? ` (AS2 message ID ${p.as2MessageId})` : '; no AS2 message was formed for this send';
  // §10.3 A.2: a legacy SFTP send was over the launch ceiling; its release says the resend is refused as it is (P-93).
  const over = p.bundleSizeBytes !== null && p.bundleSizeBytes > LAUNCH_SEQUENCE_MAX_BYTES ? launchSequenceSizeRefusal(p.bundleSizeBytes) : null;
  const again = `Releasing the send lets sequence ${n} be sent again, under a new signature.${over ? ` Sequence ${n} cannot be sent as it is: ${over}.` : ''}`;
  if (p.kind === 'ack2') {
    return `FDA's Ack2 for the send of sequence ${n} on ${when}${id} is the document chosen from this project's Vault. It shows that FDA unpacked sequence ${n} and delivered it to the center. ` +
      `Sequence ${n} is recorded as received by FDA: it is on file with FDA and is not sent again. No Ack3 for this send is on the platform. If one arrives and does not accept sequence ${n}, ` +
      'it is recorded as a technical rejection. The platform did not verify this acknowledgement; the record rests on this document and this signature.';
  }
  if (p.kind === 'ack3') {
    return `FDA's Ack3 for the send of sequence ${n} on ${when}${id} is the document chosen from this project's Vault. It reports the center's validation result for sequence ${n}, and that result accepts it. ` +
      `Sequence ${n} is recorded as received by FDA and acknowledged by the center: it is on file with FDA and is not sent again. The platform did not verify this acknowledgement; the record rests on this document and this signature.`;
  }
  if (p.kind === 'fda-non-receipt-confirmation') {
    return `FDA has confirmed in writing that it did not receive the send of sequence ${n} on ${when}${id}; that confirmation is the document chosen from this project's Vault. ${again} ${RISK(n)} Release it only on FDA's written confirmation.`;
  }
  const ground = p.proof === 'sftp-client-never-shipped'
    ? `The send of sequence ${n} on ${when} used the SFTP route to FDA, and no connection to FDA could be made for it: the platform never shipped the SFTP client that route needed.`
    : `The platform's own record shows that the send of sequence ${n} on ${when} never left this platform: no AS2 message was formed for it, and this platform forms that message before any byte is sent.`;
  return `${ground} FDA cannot confirm a send it never received, so no FDA document is cited. ${again} ${RISK(n).replace('If FDA did receive the first send after all', 'If this record is wrong and FDA did receive the first send')}`;
}

/** The transmittal's record of its settlement, set once, on the status that was judged (§3.3 afterUpdate (1)). */
export async function markHeldSendSettled(client: Queryable, p: { organizationId: number; transmittalId: number; fromStatus: string; toStatus: string; settlement: Record<string, unknown> }): Promise<void> {
  const res = await client.query(`UPDATE submission_transmittals SET status = $4, metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('heldSendSettlement', $5::jsonb),
      updated_at = now() WHERE id = $1 AND organization_id = $2 AND status = $3 AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'heldSendSettlement') RETURNING id`,
  [p.transmittalId, p.organizationId, p.fromStatus, p.toStatus, JSON.stringify(p.settlement)]);
  if (!res.rows.length) throw new Error('The transmission changed while this settlement was recorded.');
}

/** A verified receipt that contradicts a signed settlement, or null: FDA's positive answer after a release, its refusal after "received". */
function contradictedSettlement(metadata: Record<string, any> | null, status: 'received' | 'rejected'): 'received' | 'not-received' | null {
  const outcome = metadata?.heldSendSettlement?.outcome;
  if (outcome === 'not-received' && status === 'received') return 'not-received';
  if (outcome === 'received' && status === 'rejected') return 'received';
  return null;
}
function contradictionRefusal(metadata: Record<string, any> | null, status: 'received' | 'rejected'): FdaAs2ReceiptRefusal {
  const settlement = (metadata?.heldSendSettlement ?? {}) as Record<string, unknown>;
  const n = typeof settlement.sequenceNumber === 'string' ? settlement.sequenceNumber : 'this sequence';
  const on = heldSendWhen(String(settlement.settledAt ?? new Date().toISOString()));
  const sentence = status === 'received'
    ? `FDA's signed receipt shows it received this send of sequence ${n}, which was released as not received on ${on}. The receipt is kept with the send's record. Sequence ${n} is not sent again: FDA may already hold it. Contact FDA before anything else is done with it.`
    : `FDA's signed answer refuses this send of sequence ${n}, which was recorded as received on ${on}. The answer is kept with the send's record, and the sequence stays recorded as received until that is decided.`;
  return new FdaAs2ReceiptRefusal('AS2_RECEIPT_CONTRADICTS_SETTLEMENT', 409, sentence);
}
/** Keep FDA's contradicting answer beside the signed record: history only; the status, as2Receipt, mdn_raw and the settlement are untouched. */
async function keepContradictingReceipt(client: PoolClient, args: ReceiptInput, current: { status: string; metadata: Record<string, any> },
  r: { sha256: string; status: 'received' | 'rejected'; messageId: string; history: unknown[] }) {
  const contradicts = contradictedSettlement(current.metadata, r.status);
  const entry = { sha256: r.sha256, bodyBase64: args.body.toString('base64'), contentType: args.contentType, receivedAt: new Date().toISOString(),
    verified: true, submittedBy: args.userId, source: 'agency-signed-upload', status: r.status, contradicts };
  await client.query(`UPDATE submission_transmittals SET metadata = jsonb_set(metadata, '{as2ReceiptHistory}', $3::jsonb), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [args.transmittalId, args.organizationId, JSON.stringify([...r.history, entry])]);
  await recordGovernedAction(client, { orgId: args.organizationId, userId: args.userId, command: 'transition', target: `submission-transmittal:${args.transmittalId}`,
    reason: 'Kept a cryptographically verified FDA AS2 receipt that contradicts a signed settlement', domain: 'regulatory', surface: 'gateway-transmittals',
    payload: { receiptSha256: r.sha256, from: current.status, to: current.status, receiptKind: 'AS2-MDN', originalMessageId: r.messageId, contradicts },
  });
}

/** While FDA's verified receipt contradicts a release, the sequence is not sent again (§3.3): the sentence, or null. */
export async function releasedSendReceivedRefusal(q: Queryable, organizationId: number, sequenceId: number): Promise<string | null> {
  // Only markHeldSendSettled writes heldSendSettlement, and only on an FDA ESG row, so the record itself names the gateway.
  const { rows } = await q.query(`SELECT metadata FROM submission_transmittals WHERE organization_id = $1 AND region = 'fda'
      AND metadata->'dispatchBinding'->>'sequenceId' = $2::text AND metadata->'heldSendSettlement'->>'outcome' = 'not-received'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(metadata->'as2ReceiptHistory', '[]'::jsonb)) e
                   WHERE e->>'contradicts' = 'not-received' AND e->>'verified' = 'true')
    ORDER BY id DESC LIMIT 1`, [organizationId, String(sequenceId)]);
  const s = rows[0]?.metadata?.heldSendSettlement as Record<string, unknown> | undefined;
  if (s?.outcome !== 'not-received') return null;
  const n = typeof s.sequenceNumber === 'string' ? `sequence ${s.sequenceNumber}` : 'this sequence';
  const when = typeof s.sentAt === 'string' && Number.isFinite(Date.parse(s.sentAt)) ? ` of ${heldSendWhen(s.sentAt)}` : '';
  return `FDA's signed receipt shows it already received ${n}'s send${when}, which was released as not received. ${n[0].toUpperCase()}${n.slice(1)} is not sent again. Nothing was signed or sent.`;
}

// ── P-92 C3: a settlement FDA's verified answer contradicts, re-opened on that answer (design §10.5 E (i)) ───────

/** FDA's verified answer kept beside a settlement (keepContradictingReceipt). */
export interface KeptAnswer {
  sha256: string; status: 'received' | 'rejected'; contradicts: 'received' | 'not-received';
  bodyBase64: string | null; contentType: string | null; receivedAt: string | null; submittedBy: number | null;
}
export interface ReopenSequence { id: number; sequenceNumber: string; status: string | null; dispatchStatus: string | null; transmitAttemptId: string | null }
export interface ReopenFacts {
  sequence: ReopenSequence;
  /** The settled transmittal of this sequence with an answer of FDA's against it not yet re-opened; null when none. */
  settled: { id: number; status: string; submittedAt: string; settlement: Record<string, any>; binding: DispatchBinding; answer: KeptAnswer } | null;
  /** A settlement of this sequence already re-opened on FDA's answer. */
  reopened: boolean;
}

function keptAnswerOf(m: Record<string, any>): KeptAnswer | null {
  const outcome = m.heldSendSettlement?.outcome;
  const e = (Array.isArray(m.as2ReceiptHistory) ? m.as2ReceiptHistory : []).find((x: any) => x?.verified === true && x.contradicts && x.contradicts === outcome);
  if (!e || typeof e.sha256 !== 'string') return null;
  return { sha256: e.sha256, status: e.status, contradicts: e.contradicts, bodyBase64: e.bodyBase64 ?? null, contentType: e.contentType ?? null,
    receivedAt: e.receivedAt ?? null, submittedBy: typeof e.submittedBy === 'number' ? e.submittedBy : null };
}

/** The sequence's settled transmittal with FDA's contradicting answer, read (and locked, under the act) by the binding. Two throw. */
export async function readReopenFacts(q: Queryable, organizationId: number, seq: ReopenSequence, opts: { lock?: boolean } = {}): Promise<ReopenFacts> {
  const params = [organizationId, String(seq.id)];
  const { rows } = opts.lock
    ? await q.query(`SELECT id, status, metadata, bundle_sha256, submitted_at FROM submission_transmittals WHERE organization_id = $1 AND region = 'fda'
        AND metadata->'dispatchBinding'->>'sequenceId' = $2::text AND metadata ? 'heldSendSettlement' ORDER BY id FOR UPDATE`, params)
    : await q.query(`SELECT id, status, metadata, bundle_sha256, submitted_at FROM submission_transmittals WHERE organization_id = $1 AND region = 'fda'
        AND metadata->'dispatchBinding'->>'sequenceId' = $2::text AND metadata ? 'heldSendSettlement' ORDER BY id`, params);
  const reopened = rows.some((r) => r.metadata?.heldSendSettlement?.reopenedBy);
  const open = rows.filter((r) => !r.metadata?.heldSendSettlement?.reopenedBy && keptAnswerOf(r.metadata ?? {}));
  if (open.length > 1) throw new Error(`Two settled transmissions of sequence ${seq.sequenceNumber} carry an answer of FDA's against them`);
  const r = open[0];
  const binding = r ? dispatchBindingOf(r as ReceiptTransmittal, organizationId) : null;
  if (!r || !binding) return { sequence: seq, settled: null, reopened };
  return { sequence: seq, reopened, settled: { id: Number(r.id), status: String(r.status), submittedAt: new Date(r.submitted_at).toISOString(),
    settlement: r.metadata.heldSendSettlement, binding, answer: keptAnswerOf(r.metadata) as KeptAnswer } };
}

/** Why there is nothing to re-open now, in words, or null. */
export function reopenBlocker(f: ReopenFacts): string | null {
  const n = f.sequence.sequenceNumber;
  if (!f.settled) {
    return f.reopened ? `Sequence ${n}'s settlement is already re-opened on FDA's answer. Nothing was changed.`
      : `Nothing FDA has answered contradicts a settlement of sequence ${n}, so there is nothing to re-open. Nothing was changed.`;
  }
  const s = f.sequence;
  const released = f.settled.answer.contradicts === 'not-received';
  const where = released
    ? s.status === 'dispatched' && s.dispatchStatus === 'pending' && !s.transmitAttemptId
    : ['sent', 'acknowledged'].includes(String(s.dispatchStatus)) && String(s.transmitAttemptId ?? '').toLowerCase() === f.settled.binding.attemptId.toLowerCase();
  if (where) return null;
  return `Sequence ${n} is no longer where its ${released ? 'release' : 'settlement'} left it: it was sent again, or its record changed since. ` +
    `FDA may hold two copies of it. This is for a person and FDA, not an act: follow the runbook's escalation. Nothing was changed.`;
}

/** The statement the signer signs, one source, by arm. */
export function reopenStatement(f: ReopenFacts): string {
  const t = f.settled as NonNullable<ReopenFacts['settled']>;
  const n = f.sequence.sequenceNumber;
  const kept = t.answer.receivedAt ? heldSendWhen(t.answer.receivedAt).replace(/ at .*$/, '') : 'an unrecorded day';
  const settledOn = heldSendWhen(String(t.settlement.settledAt ?? t.submittedAt)).replace(/ at .*$/, '');
  if (t.answer.contradicts === 'not-received') {
    return `FDA's signed receipt for the send of sequence ${n} on ${heldSendWhen(t.submittedAt)}, kept on ${kept}, shows that FDA received it. ` +
      `The release of ${settledOn} is re-opened on FDA's answer. Sequence ${n} is recorded as received by FDA: it is on file with FDA and is not sent again. ` +
      'The release stays on the record beside FDA\'s answer.';
  }
  return `FDA's signed answer for the send of sequence ${n} on ${heldSendWhen(t.submittedAt)}, kept on ${kept}, refuses it. ` +
    `The record of ${settledOn} that FDA received it is re-opened on FDA's answer. Sequence ${n} is recorded as rejected by FDA, and it can be sent again under a new signature. ` +
    'The settlement stays on the record beside FDA\'s answer.';
}

/** Apply FDA's answer to the transmittal as the receipt path would have, and mark the settlement re-opened, once. */
export async function markHeldSendReopened(q: Queryable, p: { organizationId: number; transmittalId: number; answer: KeptAnswer; reopenedBy: Record<string, unknown> }): Promise<void> {
  const receipt = { sha256: p.answer.sha256, bodyBase64: p.answer.bodyBase64, contentType: p.answer.contentType, receivedAt: p.answer.receivedAt,
    verified: true, submittedBy: p.answer.submittedBy, source: 'agency-signed-upload', status: p.answer.status };
  // FDA's MDN as the receipt path keeps it, a receipt or a refusal alike (ingestFdaAs2Receipt writes mdn_raw for both).
  const mdn = p.answer.bodyBase64 ? Buffer.from(p.answer.bodyBase64, 'base64').toString('utf8') : null;
  const r = await q.query(
    `UPDATE submission_transmittals
        SET status = $3::text,
            metadata = jsonb_set(metadata || jsonb_build_object('as2Receipt', $4::jsonb), '{heldSendSettlement,reopenedBy}', $5::jsonb),
            mdn_raw = COALESCE($6::text, mdn_raw),
            ack_received_at = CASE WHEN $3::text = 'received' THEN COALESCE(ack_received_at, $7::timestamptz) ELSE ack_received_at END,
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND NOT (metadata->'heldSendSettlement' ? 'reopenedBy')`,
    [p.transmittalId, p.organizationId, p.answer.status, JSON.stringify(receipt), JSON.stringify(p.reopenedBy), mdn, p.answer.receivedAt],
  );
  if ((r.rowCount ?? r.rows?.length ?? 0) === 0) throw new Error('The re-opening could not be written to its transmission; nothing was recorded.');
}
