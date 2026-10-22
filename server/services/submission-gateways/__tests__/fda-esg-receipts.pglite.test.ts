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
import { ingestFdaAs2Receipt } from '../fda-esg-receipts';
import { as2CmsFixture, receiptReport } from './support/as2-cms-fixture';
let fixture: ReturnType<typeof as2CmsFixture>;
const MESSAGE = '<retained@sponsor>', MIC = createHash('sha256').update('retained-bundle').digest('base64'), SHA = 'b'.repeat(64);
beforeAll(async () => {
  fixture = as2CmsFixture(); state.pg = new PGlite();
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
  const metadata = { as2: { messageId: MESSAGE, mic: MIC, environment: 'staging' }, dispatchBinding: { organizationId: 42, sequenceId: 88, signatureActionId: 'act_original', attemptId: 'a0000000-0000-4000-8000-000000000001', bundleSha256: SHA } };
  await state.pg!.query(`INSERT INTO submission_transmittals(id,organization_id,region,gateway,transport,status,metadata,bundle_sha256) VALUES(1,42,'fda','esg','as2','in_transit',$1::jsonb,$2)`, [JSON.stringify(metadata), SHA]);
  await state.pg!.exec(`INSERT INTO ectd_sequences VALUES(88,42,'dispatched','transmitting','act_original','a0000000-0000-4000-8000-000000000001',NULL,now());`);
});
afterAll(async () => { vi.unstubAllEnvs(); fixture?.cleanup(); await state.pg?.close(); });
function args(message = MESSAGE, mic = MIC, disposition = 'processed') {
  const signed = fixture.signedReceipt(receiptReport(message, mic, disposition));
  return { organizationId: 42, transmittalId: 1, userId: 7, ...signed };
}
async function read() { return (await state.pg!.query<any>('SELECT * FROM submission_transmittals WHERE id=1')).rows[0]; }
describe('actual agency-signed MDN ingestion and governed scope/atomicity', () => {
  it('records exact receipt bytes/audit and resolves only the retained matching sequence claim', async () => {
    const input = args(); const result = await ingestFdaAs2Receipt(input);
    expect(result).toMatchObject({ verified: true, recorded: true, status: 'received', auditTrail: true, sequenceResolution: 'resolved' });
    const row = await read(); expect(row.status).toBe('received'); expect(Buffer.from(row.metadata.as2Receipt.bodyBase64, 'base64')).toEqual(input.body);
    expect((await state.pg!.query<any>('SELECT dispatch_status FROM ectd_sequences')).rows[0].dispatch_status).toBe('sent');
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
