import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
const state = vi.hoisted(() => ({ pg: undefined as PGlite | undefined, auditFail: false }));
vi.mock('../../../db', () => {
  const query = async <R = any>(sql: string, args?: unknown[]) => { const result = await state.pg!.query<R>(sql, args); return { ...result, rowCount: result.affectedRows }; };
  return { pool: { query, connect: async () => ({ query, release: vi.fn() }) }, db: {} };
});
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: async (client: any, args: any) => {
  if (state.auditFail) throw new Error('audit unavailable');
  await client.query('INSERT INTO receipt_audit(organization_id,user_id,receipt_sha256) VALUES($1,$2,$3)', [args.orgId, args.userId, args.payload.receiptSha256]);
} }));
import { ingestFdaAs2Receipt, releasedSendReceivedRefusal } from '../fda-esg-receipts';
import { as2CmsFixture, receiptReport } from './support/as2-cms-fixture';
let fixture: ReturnType<typeof as2CmsFixture>;
const MESSAGE = '<retained@sponsor>', MIC = createHash('sha256').update('retained-bundle').digest('base64'), SHA = 'b'.repeat(64);
// What the transmit guard recorded the send carried (F1, 2026-11-01): the fold reads it once the receipt settles the sequence.
const SENT_LEAVES = [{ ctdSection: '3.2.S.1', fileName: 'general.pdf', href: 'm3/general.pdf', md5: 'a'.repeat(32), operation: 'new' }];
// Each case's transmittal is a PRODUCTION send unless it says otherwise: only a
// production receipt files the sequence (F1, row D7, 2026-11-01). Both
// environments pin the agency's receipt certificate.
beforeAll(async () => {
  fixture = as2CmsFixture(); state.pg = new PGlite();
  vi.stubEnv('FDA_ESG_MDN_CERT_PATH', join(fixture.directory, 'agency.pem'));
  vi.stubEnv('FDA_ESG_STAGING_MDN_CERT_PATH', join(fixture.directory, 'agency.pem'));
  await state.pg.exec(`CREATE TABLE users(id int PRIMARY KEY,status text); CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    INSERT INTO users VALUES(7,'active'); INSERT INTO organizations VALUES(42,'active'); INSERT INTO organization_users VALUES(42,7,'member');
    CREATE TABLE submission_transmittals(id int PRIMARY KEY,organization_id int,region text,gateway text,transport text,status text,metadata jsonb,bundle_sha256 text,mdn_raw text,ack_received_at timestamptz,transmission_id text,updated_at timestamptz);
    CREATE TABLE ectd_sequences(id int PRIMARY KEY,organization_id int,status text,dispatch_status text,transmit_signature_action_id text,transmit_attempt_id uuid,deleted_at timestamptz,updated_at timestamptz);
    CREATE TABLE receipt_audit(id serial PRIMARY KEY,organization_id int,user_id int,receipt_sha256 text);`);
  await state.pg.exec(AUDIT_LOGS_PGLITE_DDL);
}, 30_000);
beforeEach(async () => {
  state.auditFail = false;
  await state.pg!.exec(`DELETE FROM submission_transmittals; DELETE FROM ectd_sequences; DELETE FROM receipt_audit; DELETE FROM audit_logs; UPDATE organization_users SET role='member';`);
  const metadata = { as2: { messageId: MESSAGE, mic: MIC, environment: 'production' }, dispatchBinding: { organizationId: 42, sequenceId: 88, signatureActionId: 'act_original', attemptId: 'a0000000-0000-4000-8000-000000000001', bundleSha256: SHA }, leafManifest: SENT_LEAVES };
  await state.pg!.query(`INSERT INTO submission_transmittals(id,organization_id,region,gateway,transport,status,metadata,bundle_sha256) VALUES(1,42,'fda','esg','as2','in_transit',$1::jsonb,$2)`, [JSON.stringify(metadata), SHA]);
  await state.pg!.exec(`INSERT INTO ectd_sequences VALUES(88,42,'dispatched','transmitting','act_original','a0000000-0000-4000-8000-000000000001',NULL,now());`);
});
afterAll(async () => { vi.unstubAllEnvs(); fixture?.cleanup(); await state.pg?.close(); });
function args(message = MESSAGE, mic = MIC, disposition = 'processed') {
  const signed = fixture.signedReceipt(receiptReport(message, mic, disposition));
  return { organizationId: 42, transmittalId: 1, userId: 7, ...signed };
}
async function read() { return (await state.pg!.query<any>('SELECT * FROM submission_transmittals WHERE id=1')).rows[0]; }
/** The transmittal as a send to the agency's test environment. */
async function sentToTestEnvironment() { await state.pg!.exec(`UPDATE submission_transmittals SET metadata = jsonb_set(metadata, '{as2,environment}', '"staging"')`); }
async function sequenceRow() { return (await state.pg!.query<any>('SELECT dispatch_status, transmit_signature_action_id, transmit_attempt_id::text AS transmit_attempt_id FROM ectd_sequences WHERE id=88')).rows[0]; }
describe('actual agency-signed MDN ingestion and governed scope/atomicity', () => {
  it('records exact receipt bytes/audit and resolves only the retained matching sequence claim', async () => {
    const input = args(); const result = await ingestFdaAs2Receipt(input);
    expect(result).toMatchObject({ verified: true, recorded: true, status: 'received', auditTrail: true, sequenceResolution: 'resolved' });
    const row = await read(); expect(row.status).toBe('received'); expect(Buffer.from(row.metadata.as2Receipt.bodyBase64, 'base64')).toEqual(input.body);
    // A production receipt files the sequence (unchanged).
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('sent');
    expect(result.environment).toBe('production');
    // The receipt merges into the row: what was sent, and the attempt it binds, stay on it.
    expect(row.metadata.leafManifest).toEqual(SENT_LEAVES);
    expect(row.metadata.dispatchBinding).toMatchObject({ sequenceId: 88, attemptId: 'a0000000-0000-4000-8000-000000000001' });
    expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(1);
    expect((await ingestFdaAs2Receipt(input))).toMatchObject({ duplicate: true, sequenceResolution: 'already-resolved' });
    expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(1);
  });
  it('records a verified receipt while keeping a newer signature claim explicitly unreconciled', async () => {
    await state.pg!.exec("UPDATE ectd_sequences SET transmit_signature_action_id='act_newer'");
    expect((await ingestFdaAs2Receipt(args())).sequenceResolution).toBe('unreconciled');
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
  });
  it('never guesses a legacy sequence binding by its number', async () => {
    await state.pg!.exec("UPDATE submission_transmittals SET metadata=metadata-'dispatchBinding'");
    expect((await ingestFdaAs2Receipt(args())).sequenceResolution).toBe('unreconciled');
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
  });
  it('uses a tied authenticated refusal only for rejected transport state, never center acknowledgement', async () => {
    const result = await ingestFdaAs2Receipt(args(MESSAGE, MIC, 'failed'));
    expect(result.status).toBe('rejected'); expect((await read()).status).toBe('rejected');
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('rejected');
    const spent = (await state.pg!.query<any>(`SELECT action,new_values,sha256_chain FROM audit_logs WHERE tenant_id=42 AND table_name='ectd_sequence' AND record_id='88' AND new_values::jsonb->>'signatureActionId'='act_original'`)).rows;
    expect(spent).toHaveLength(1); expect(spent[0].action).toBe('ECTD_TRANSMITTED'); expect(spent[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/);
  });
  it('reconciles a retained synchronous agency rejection without authorizing its signature again', async () => {
    await state.pg!.exec("UPDATE submission_transmittals SET status='rejected'");
    const input = args(MESSAGE, MIC, 'failed');
    const result = await ingestFdaAs2Receipt(input);
    expect(result).toMatchObject({ verified: true, recorded: true, status: 'rejected', sequenceResolution: 'resolved' });
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('rejected');
    expect((await state.pg!.query<any>("SELECT * FROM audit_logs WHERE action='ECTD_TRANSMITTED'")).rows).toHaveLength(1);
    expect((await ingestFdaAs2Receipt(input))).toMatchObject({ duplicate: true, sequenceResolution: 'already-resolved' });
    expect((await state.pg!.query<any>("SELECT * FROM audit_logs WHERE action='ECTD_TRANSMITTED'")).rows).toHaveLength(1);
  });
  it('refuses a positive receipt that conflicts with a retained rejected transmittal', async () => {
    await state.pg!.exec("UPDATE submission_transmittals SET status='rejected'");
    await expect(ingestFdaAs2Receipt(args())).rejects.toMatchObject({ code: 'AS2_RECEIPT_STATE_CONFLICT', status: 409 });
    expect((await read()).status).toBe('rejected');
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
    expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(0);
    expect((await state.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
  });
  it('cannot resolve a newer attempt with the same signature using re-encoded original receipt bytes', async () => {
    const original = args(MESSAGE, MIC, 'failed');
    await ingestFdaAs2Receipt(original);
    // Model a competing caller that passed its signature verdict before the
    // first receipt committed. Attempt identity must still distinguish B.
    await state.pg!.exec("UPDATE ectd_sequences SET dispatch_status='transmitting',transmit_attempt_id='b0000000-0000-4000-8000-000000000002'; UPDATE submission_transmittals SET status='in_transit'");
    const boundary = original.contentType.match(/boundary="([^"]+)"/)![1];
    const reframed = { ...original, body: Buffer.from(original.body.toString('ascii').split(boundary).join(`${boundary}-reframed`), 'ascii'), contentType: original.contentType.replace(boundary, `${boundary}-reframed`) };
    expect(reframed.body.equals(original.body)).toBe(false);
    expect((await ingestFdaAs2Receipt(reframed)).sequenceResolution).toBe('unreconciled');
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
    expect((await state.pg!.query<any>("SELECT * FROM audit_logs WHERE action='ECTD_TRANSMITTED'")).rows).toHaveLength(1);
  });
  it.each(['message', 'MIC', 'tenant', 'viewer'])('refuses wrong %s without changing receipt, sequence or audit', async bad => {
    const input = args(bad === 'message' ? '<another@sponsor>' : MESSAGE, bad === 'MIC' ? createHash('sha256').update('wrong').digest('base64') : MIC);
    if (bad === 'tenant') input.organizationId = 99;
    if (bad === 'viewer') await state.pg!.exec("UPDATE organization_users SET role='viewer'");
    await expect(ingestFdaAs2Receipt(input)).rejects.toMatchObject({ status: bad === 'tenant' ? 404 : bad === 'viewer' ? 403 : 422 });
    expect((await read()).status).toBe('in_transit'); expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(0);
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
    expect((await state.pg!.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
  });
  it('rolls back receipt and sequence changes together if the canonical audit fails', async () => {
    state.auditFail = true;
    await expect(ingestFdaAs2Receipt(args())).rejects.toThrow('audit unavailable');
    expect((await read()).status).toBe('in_transit'); expect((await read()).metadata.as2Receipt).toBeUndefined();
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('transmitting');
  });
});
/* F1 (row D7, 2026-11-01): a receipt from the agency's test environment is
   not a filing. It is recorded on the transmittal as any receipt is, and it
   settles the attempt it binds to 'pending', never to 'sent' or 'rejected':
   the test environment's verdict is not FDA's. */
describe("a receipt from the agency's test environment (F1, row D7)", () => {
  it("a test environment's positive receipt records the receipt and settles the claim to pending, never sent", async () => {
    await sentToTestEnvironment();
    const input = args(); const result = await ingestFdaAs2Receipt(input);
    // Only dispatch_status: the columns still name the attempt the test receipt settled.
    expect(await sequenceRow(), 'a test receipt filed the sequence').toEqual({ dispatch_status: 'pending', transmit_signature_action_id: 'act_original', transmit_attempt_id: 'a0000000-0000-4000-8000-000000000001' });
    expect(result).toMatchObject({ verified: true, recorded: true, status: 'received', sequenceResolution: 'resolved' });
    expect((await read()).status).toBe('received');
    // The wire attempt happened: its signature is spent by the one-use ledger (P-23), naming the test environment.
    const spent = (await state.pg!.query<any>(`SELECT action, new_values::jsonb->>'environment' AS environment FROM audit_logs WHERE new_values::jsonb->>'signatureActionId'='act_original'`)).rows;
    expect(spent).toEqual([{ action: 'ECTD_TRANSMITTED', environment: 'staging' }]);
    expect((await ingestFdaAs2Receipt(input))).toMatchObject({ duplicate: true, sequenceResolution: 'already-resolved' });
    expect((await sequenceRow()).dispatch_status).toBe('pending');
    // The result names the environment, so the person can be told a test receipt files nothing.
    expect(result.environment).toBe('staging');
  });
  it("a test environment's refusal settles the claim to pending, never rejected", async () => {
    await sentToTestEnvironment();
    const result = await ingestFdaAs2Receipt(args(MESSAGE, MIC, 'failed'));
    expect((await sequenceRow()).dispatch_status, "the test environment's refusal was recorded as FDA's").toBe('pending');
    expect(result).toMatchObject({ status: 'rejected', sequenceResolution: 'resolved' });
    expect((await read()).status).toBe('rejected');
    expect(result.environment).toBe('staging');
  });
  it('a test receipt for an attempt whose claim was released and whose signature was voided moves no sequence and spends nothing', async () => {
    // What transmitSequence leaves after a test send failed after the wire: claim released, signature void.
    await sentToTestEnvironment();
    await state.pg!.exec(`UPDATE ectd_sequences SET dispatch_status='pending', transmit_signature_action_id=NULL, transmit_attempt_id=NULL;
      INSERT INTO audit_logs (id, tenant_id, table_name, record_id, action, new_values) VALUES ('void-1', 42, 'ectd_sequence', '88', 'GOVERNED_SIGNATURE_VOIDED', '{"signatureActionId":"act_original","step":"transmit"}');`);
    const result = await ingestFdaAs2Receipt(args());
    expect(await sequenceRow()).toEqual({ dispatch_status: 'pending', transmit_signature_action_id: null, transmit_attempt_id: null });
    expect(result).toMatchObject({ verified: true, recorded: true, status: 'received', sequenceResolution: 'unreconciled' });
    expect((await read()).status).toBe('received');
    expect((await state.pg!.query("SELECT * FROM audit_logs WHERE action='ECTD_TRANSMITTED'")).rows).toHaveLength(0);
    expect(result.environment).toBe('staging');
  });
});

/* P-92 T7 (design §3.3, P-108 1(c)): a verified FDA receipt that contradicts a signed settlement is KEPT beside it,
   never thrown away and never written over it; the call answers 409 with the contradiction; and while FDA's receipt
   contradicts a release, the sequence is not sent again. Re-opening the settlement is C3's second signed act. */
describe('P-92 T7: a late FDA receipt after a signed settlement', () => {
  const settled = async (outcome: 'received' | 'not-received') => {
    const meta = { heldSendSettlement: { outcome, kind: outcome === 'received' ? 'ack2' : 'fda-non-receipt-confirmation', verified: false, settledAt: '2026-11-03T14:05:00.000Z', signatureActionId: 'act_settle', sequenceNumber: '0001' } };
    await state.pg!.query(`UPDATE submission_transmittals SET status = $1, metadata = metadata || $2::jsonb`, [outcome === 'received' ? 'ack2_received' : 'rejected', JSON.stringify(meta)]);
    await state.pg!.exec(outcome === 'received'
      ? "UPDATE ectd_sequences SET dispatch_status = 'sent'"
      : "UPDATE ectd_sequences SET dispatch_status = 'pending', transmit_signature_action_id = NULL, transmit_attempt_id = NULL");
  };
  const history = async () => ((await read()).metadata.as2ReceiptHistory ?? []) as Array<{ contradicts?: string; verified?: boolean }>;

  it("after a release, FDA's positive receipt is kept with the send's record, answers 409, and holds the resend", async () => {
    await settled('not-received');
    const input = args();
    await expect(ingestFdaAs2Receipt(input)).rejects.toMatchObject({ code: 'AS2_RECEIPT_CONTRADICTS_SETTLEMENT', status: 409, message: expect.stringMatching(/shows it received this send of sequence/) });
    const row = await read();
    expect(row.status).toBe('rejected');
    expect(row.metadata.as2Receipt).toBeUndefined();
    expect(row.metadata.heldSendSettlement).toMatchObject({ outcome: 'not-received' });
    expect(await history()).toEqual([expect.objectContaining({ verified: true, contradicts: 'not-received' })]);
    expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(1);
    // The same bytes again: the same answer, and nothing more is written.
    await expect(ingestFdaAs2Receipt(input)).rejects.toMatchObject({ code: 'AS2_RECEIPT_CONTRADICTS_SETTLEMENT' });
    expect(await history()).toHaveLength(1);
    expect((await state.pg!.query('SELECT * FROM receipt_audit')).rows).toHaveLength(1);
    // While it stands, the sequence is not sent again.
    expect(await releasedSendReceivedRefusal(state.pg! as never, 42, 88)).toMatch(/already received sequence .* which was released as not received\. .* is not sent again/);
  });

  it("after a release, FDA's refusal agrees with it: recorded, no sequence moves, no resend hold", async () => {
    await settled('not-received');
    const result = await ingestFdaAs2Receipt(args(MESSAGE, MIC, 'failed'));
    expect(result).toMatchObject({ status: 'rejected' });
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('pending');
    expect(await releasedSendReceivedRefusal(state.pg! as never, 42, 88)).toBeNull();
  });

  it("after 'received', FDA's refusal is kept with the record and answers 409; the sequence stays recorded as received", async () => {
    await settled('received');
    await expect(ingestFdaAs2Receipt(args(MESSAGE, MIC, 'failed'))).rejects.toMatchObject({ code: 'AS2_RECEIPT_CONTRADICTS_SETTLEMENT', message: expect.stringMatching(/refuses this send of sequence .* which was recorded as received/) });
    expect((await read()).status).toBe('ack2_received');
    expect(await history()).toEqual([expect.objectContaining({ contradicts: 'received' })]);
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('sent');
  });

  it('a transmittal with no settlement takes exactly today\'s path', async () => {
    expect((await ingestFdaAs2Receipt(args())).sequenceResolution).toBe('resolved');
    expect(await releasedSendReceivedRefusal(state.pg! as never, 42, 88)).toBeNull();
  });
});

