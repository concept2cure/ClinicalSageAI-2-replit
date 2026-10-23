/** Renew the existing regional dispatch authorization after recorded identity changes. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ db: null as any, pglite: null as any, duringAssembly: null as (() => Promise<void>) | null }));
vi.mock('../../../db', () => {
  const query = async (raw: string | { text: string; values?: unknown[] }, params?: unknown[]) => {
    const text = typeof raw === 'string' ? raw : raw.text;
    const values = params ?? (typeof raw === 'string' ? undefined : raw.values);
    const result = await h.pglite.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { get db() { return h.db; }, pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
vi.mock('../../ectd/assess-dispatch-readiness', () => ({ assessSequenceDispatchReadiness: async () => ({
  gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] },
  dispatchGateOnSigning: { cleared: true, blockers: [] }, validationErrors: 0, unacknowledgedShadowCriticals: 0,
}) }));
vi.mock('../../ectd/assemble-from-core', async original => ({
  ...await original<object>(),
  assembleSequence: async (...args: unknown[]) => {
    const hook = h.duringAssembly; h.duringAssembly = null; if (hook) await hook();
    const actual = await original<typeof import('../../ectd/assemble-from-core')>();
    return actual.assembleSequence(...args as Parameters<typeof actual.assembleSequence>);
  },
}));
import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, FREEZE_SPONSOR_ID, ORG, USER, freezeGateHelpers } from './_freeze-gate-fixture';
import { canTransitionSequence, dispatchSequence, precheckGovernedStep, sequenceDispatchAuthorizationEligibility } from '../submission-service';
import * as audit from '../../auditService';

let db: IndPgliteDb;
let nextId = 9200;
const ctx = { organizationId: ORG, userId: USER };
const { sign } = freezeGateHelpers(() => db);
const q = (text: string, params?: unknown[]) => db.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (promise: Promise<unknown>) => promise.then(() => null, error => error);
async function dispatched(status: string | null = 'pending', region = 'fda') {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES ($1, 'Renew dispatch', 'ind', 'biotech', $2, $3, 2, $4)`, [id, region, ORG, FREEZE_PROGRAM_ID]);
  await q(`UPDATE submissions SET application_number = 'MARKET-123456' WHERE id = $1`, [id]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status, frozen_at)
    VALUES ($1, $1, $2, '0000', $3, 2, 'dispatched', $4, '2026-10-01T12:00:00Z')`, [id, region, ORG, status]);
  await q(`INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES ($1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, $2, 2)`, [id, ORG]);
  return id;
}
beforeAll(async () => {
  db = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, shadowReview: true });
  h.db = db.db; h.pglite = db.pglite;
  await db.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.pglite.exec(FREEZE_GATE_SEED_SQL);
  await q('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS application_number TEXT');
}, 120_000);
afterAll(async () => { await db?.close(); });

describe('FDA dispatch authorization renewal through the existing governed action', () => {
  it.each([null, 'pending', 'rejected'])('renews an unsent dispatched sequence (%s) with a fresh signature and audit, preserving frozen state', async status => {
    const id = await dispatched(status);
    const oldSignature = await sign(id, 'dispatch', 'release');
    const before = (await q(`SELECT bound_payload_digest FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [oldSignature])).rows[0];
    await q(`UPDATE ind_sponsors SET contact_name = $1 WHERE id = $2`, [`Updated contact ${id}`, FREEZE_SPONSOR_ID]);
    const precheck = await precheckGovernedStep(id, 'dispatch', ctx);
    expect(precheck).toMatchObject({ cleared: true, refusal: null });
    const fresh = await sign(id, 'dispatch', 'release');
    const result = await dispatchSequence(id, ctx, fresh);
    expect(result).toMatchObject({ status: 'dispatched', dispatchStatus: status });
    expect(new Date(result.frozenAt!).toISOString()).toBe('2026-10-01T12:00:00.000Z');
    const audit = (await q(`SELECT new_values::jsonb AS value FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows[0]?.value;
    expect(audit).toMatchObject({ reauthorized: true, from: 'dispatched', to: 'dispatched', signatureActionId: fresh,
      previousDispatchStatus: status, recordedPackageIdentity: { version: 1, identity: { contact: { name: `Updated contact ${id}` } } } });
    expect((await q(`SELECT bound_payload_digest FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [oldSignature])).rows[0]).toEqual(before);
    expect(canTransitionSequence('dispatched', 'dispatched')).toBe(false);
    expect(await outcome(dispatchSequence(id, ctx, fresh))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
  }, 120_000);

  it.each(['transmitting', 'sent', 'acknowledged'])('refuses %s before signing or recording another dispatch', async status => {
    const id = await dispatched(status);
    expect(await precheckGovernedStep(id, 'dispatch', ctx)).toMatchObject({ cleared: false, refusal: expect.stringMatching(/flight|transmitted/i) });
    const error = await outcome(dispatchSequence(id, ctx, await sign(id, 'dispatch', 'release')));
    expect(error).toMatchObject({ code: 'INVALID_STATE' });
    expect((await q(`SELECT dispatch_status FROM ectd_sequences WHERE id = $1`, [id])).rows[0].dispatch_status).toBe(status);
    expect((await q(`SELECT id FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows).toEqual([]);
  }, 120_000);

  it('refuses a send claimed during the renewal checks without resetting its in-flight status', async () => {
    const id = await dispatched();
    const signature = await sign(id, 'dispatch', 'release');
    h.duringAssembly = async () => { await q(`UPDATE ectd_sequences SET dispatch_status = 'transmitting' WHERE id = $1`, [id]); };
    const error = await outcome(dispatchSequence(id, ctx, signature));
    expect(error).toMatchObject({ code: 'INVALID_STATE' });
    expect((await q(`SELECT dispatch_status FROM ectd_sequences WHERE id = $1`, [id])).rows[0].dispatch_status).toBe('transmitting');
    expect((await q(`SELECT id FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows).toEqual([]);
  }, 120_000);

  it.each(['jp', 'eu'].flatMap(region => [null, 'pending', 'rejected'].map(status => ({ region, status }))))('renews an unsent $region release ($status) over current recorded applicant facts', async ({ region, status }) => {
    const id = await dispatched(status, region);
    const oldSignature = await sign(id, 'dispatch', 'release');
    const before = (await q(`SELECT bound_payload_digest FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [oldSignature])).rows[0];
    await q(`UPDATE ind_sponsors SET name = $1 WHERE id = $2`, [`Applicant ${id}`, FREEZE_SPONSOR_ID]);
    expect(await outcome(dispatchSequence(id, ctx, oldSignature))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(await precheckGovernedStep(id, 'dispatch', ctx)).toMatchObject({ cleared: true, refusal: null });
    const fresh = await sign(id, 'dispatch', 'release');
    const result = await dispatchSequence(id, ctx, fresh);
    expect(result).toMatchObject({ status: 'dispatched', dispatchStatus: status });
    expect(new Date(result.frozenAt!).toISOString()).toBe('2026-10-01T12:00:00.000Z');
    const row = (await q(`SELECT new_values::jsonb AS value FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows[0]?.value;
    expect(row).toMatchObject({ reauthorized: true, signatureActionId: fresh, previousDispatchStatus: status,
      recordedPackageIdentity: { version: 1, identity: { applicationNumber: 'MARKET-123456', applicantName: `Applicant ${id}`,
        applicantId: null, contact: { name: null, phone: null, email: null } } } });
    expect((await q(`SELECT bound_payload_digest FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [oldSignature])).rows[0]).toEqual(before);
    expect(await outcome(dispatchSequence(id, ctx, fresh))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    expect(canTransitionSequence('dispatched', 'dispatched')).toBe(false);
  }, 120_000);

  it.each(['jp', 'eu', 'unrecognized'])('withholds %s renewal for unconfirmed/attempted dispatch states', region => {
    for (const dispatchStatus of [undefined, 'unknown', 'transmitting', 'sent', 'acknowledged']) {
      expect(sequenceDispatchAuthorizationEligibility({ status: 'dispatched', region, dispatchStatus }).eligible).toBe(false);
    }
    if (region === 'unrecognized') expect(sequenceDispatchAuthorizationEligibility({ status: 'dispatched', region, dispatchStatus: 'pending' }).eligible).toBe(false);
  });

  it('rolls renewal back when its chained audit cannot be recorded', async () => {
    const id = await dispatched('rejected');
    const before = (await q(`SELECT status, dispatch_status, updated_at::text AS changed_at FROM ectd_sequences WHERE id = $1`, [id])).rows[0];
    const signature = await sign(id, 'dispatch', 'release');
    const write = vi.spyOn(audit, 'writeChainedAuditRow').mockRejectedValueOnce(new Error('audit unavailable'));
    try {
      expect(await outcome(dispatchSequence(id, ctx, signature))).toBeInstanceOf(Error);
      expect((await q(`SELECT status, dispatch_status, updated_at::text AS changed_at FROM ectd_sequences WHERE id = $1`, [id])).rows[0]).toEqual(before);
      expect((await q(`SELECT id FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows).toEqual([]);
    } finally { write.mockRestore(); }
  }, 120_000);

  it('refuses a dispatch signature another renewal spent while this request was assembling', async () => {
    const id = await dispatched();
    const signature = await sign(id, 'dispatch', 'release');
    h.duringAssembly = async () => {
      await audit.writeChainedAuditRow({ query: q }, { organizationId: ORG, userId: USER,
        action: 'SEQUENCE_DISPATCHED', resourceType: 'ectd_sequence', resourceId: id,
        details: { signatureActionId: signature, reauthorized: true } });
    };
    const error = await outcome(dispatchSequence(id, ctx, signature));
    expect(error).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/already.*used|already.*spent/i) });
    const rows = (await q(`SELECT new_values::jsonb AS value FROM audit_logs WHERE action = 'SEQUENCE_DISPATCHED' AND record_id = $1`, [String(id)])).rows;
    expect(rows).toHaveLength(1);
  }, 120_000);
});
