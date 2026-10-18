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

export class FdaAs2ReceiptRefusal extends Error {
  constructor(readonly code: string, readonly status: 400 | 403 | 404 | 409 | 422, message: string) { super(message); }
}
export interface FdaAs2ReceiptResult { verified: true; recorded: true; status: 'received' | 'rejected'; duplicate: boolean; auditTrail: true; sequenceResolution: 'resolved' | 'already-resolved' | 'unreconciled' }
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
    if (history.some((entry: { sha256?: string }) => entry?.sha256 === sha256)) {
      const sequenceResolution = await resolveReceiptSequence(client, args.organizationId, current, status);
      await client.query('COMMIT'); return { verified: true, recorded: true, status, duplicate: true, auditTrail: true, sequenceResolution };
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
    await client.query('COMMIT'); return { verified: true, recorded: true, status, duplicate: false, auditTrail: true, sequenceResolution };
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
  const next = status === 'received' ? 'sent' : 'rejected';
  if (receipt) {
    const sequence = (await client.query(`SELECT id FROM ectd_sequences WHERE id=$1 AND organization_id=$2
      AND status='dispatched' AND deleted_at IS NULL FOR UPDATE`, [binding.sequenceId, organizationId])).rows[0];
    if (!sequence) return 'unreconciled';
    // A signed positive or negative MDN proves this wire attempt occurred.
    // Use the same one-use ledger as transmitSequence, inside this transaction,
    // so a released rejection can never re-authorize its original signature.
    const spent = await client.query(`SELECT action FROM audit_logs WHERE tenant_id=$1 AND table_name='ectd_sequence'
      AND record_id=$2 AND action IN ('SEQUENCE_FROZEN','SEQUENCE_DISPATCHED','ECTD_TRANSMITTED','GOVERNED_SIGNATURE_VOIDED')
      AND new_values::jsonb->>'signatureActionId'=$3 LIMIT 1`, [organizationId, String(binding.sequenceId), binding.signatureActionId]);
    if (!spent.rows.length) await writeChainedAuditRow(client, {
      organizationId, userId: receipt.userId, action: 'ECTD_TRANSMITTED', resourceType: 'ectd_sequence', resourceId: binding.sequenceId,
      details: { ...receipt, signatureActionId: binding.signatureActionId, transmitAttemptId: binding.attemptId,
        status, environment: (transmittal.metadata?.as2 as ReceiptBinding).environment, region: 'fda', gateway: 'esg', source: 'agency-signed-receipt-reconciliation' },
    });
    const changed = await client.query(`UPDATE ectd_sequences SET dispatch_status = $3, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND status = 'dispatched' AND deleted_at IS NULL
        AND dispatch_status = 'transmitting' AND transmit_signature_action_id = $4 AND transmit_attempt_id=$5::uuid RETURNING id`, [binding.sequenceId, organizationId, next, binding.signatureActionId, binding.attemptId]);
    if (changed.rows.length) return 'resolved';
  }
  const row = (await client.query(`SELECT dispatch_status FROM ectd_sequences WHERE id = $1 AND organization_id = $2
    AND deleted_at IS NULL AND transmit_signature_action_id = $3 AND transmit_attempt_id=$4::uuid`, [binding.sequenceId, organizationId, binding.signatureActionId, binding.attemptId])).rows[0];
  return row?.dispatch_status === next ? 'already-resolved' : 'unreconciled';
}
