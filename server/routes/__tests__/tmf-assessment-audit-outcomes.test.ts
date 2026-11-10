/** The audit row of a governed act, in its two forms.
 *
 * A TMF filing or removal (eTMF convergence E3, 2026-11-10) writes its audit
 * row in the transaction that makes the change: when the audit row cannot be
 * written, the change is not made, and a retry makes both. Until then this
 * suite pinned the opposite for the TMF: the filing committed first, the audit
 * was attempted after, and a lost row was reported beside a filing that stood
 * with no record of it.
 *
 * A recorded assessment snapshot keeps the ancillary form: the business row
 * survives an audit failure and the outcome is reported.
 *
 * The audit boundary is controlled; the mounted routes and migration-shaped
 * stores run. For the TMF the audit writer is a double that records on the
 * client it is handed, so its row commits or rolls back with the change; the
 * real chain is proved on PostgreSQL (tests/db/etmf-governed-filing.dbtest.ts). */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { expandRoleClaims } from '../../middleware/auth';
import { createTmfRouteDb, type TmfRouteDb } from './_etmf-pglite-fixture';

const state = vi.hoisted(() => ({ fixture: null as any, logAction: vi.fn(), tmfAudit: vi.fn() }));
vi.mock('../../db', () => ({
  get db() { return state.fixture.harness.db; },
  get pool() { return state.fixture.pool; },
  get transaction() { return state.fixture.transaction; },
}));
vi.mock('../../services/auditService', () => ({ default: { logAction: state.logAction }, writeChainedAuditRow: state.tmfAudit }));
vi.mock('../../services/c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {}
  return { ProgramReadAccessError, requireCurrentProgramAccess: vi.fn(async () => ({})) };
});
vi.mock('../../services/vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: vi.fn(async () => ({})) }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
import tmfRouter from '../etmf.routes';
import assessmentsRouter from '../regulatory-assessments.routes';

const LOST = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
const RECORDED = { persisted: true, chained: true };
const SENTINEL = 'SYNTHETIC secret database target and driver detail';
const WHY = 'Filed for the audit outcome proof.';
let fixture: TmfRouteDb;
let app: express.Express;
let role = 'member';
let serial = 0;

/** The TMF audit writer's double: one row on the client it is handed, inside that client's transaction. */
const recordOnTheClient = async (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, entry: any) => {
  await client.query('INSERT INTO tmf_test_audit (action, record_id, reason, details) VALUES ($1, $2, $3, $4)',
    [entry.action, String(entry.resourceId), entry.reason ?? null, JSON.stringify(entry.details ?? {})]);
};
const stored = async (artifactCode: string) =>
  (await fixture.query("SELECT id, document_ref, removed_at FROM tmf_artifact_filings WHERE trial_id = 'STUDY-A' AND artifact_code = $1", [artifactCode])).rows;
const audited = async () => (await fixture.query('SELECT action, record_id FROM tmf_test_audit ORDER BY seq')).rows;

beforeAll(async () => {
  fixture = await createTmfRouteDb();
  state.fixture = fixture;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 9, organizationId: 1, role, roles: expandRoleClaims(role, undefined) } as typeof req.user; next(); });
  app.use('/api/etmf', tmfRouter);
  app.use('/api/regulatory-assessments', assessmentsRouter);
});
beforeEach(async () => {
  state.logAction.mockReset(); state.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true }); role = 'member';
  state.tmfAudit.mockReset(); state.tmfAudit.mockImplementation(recordOnTheClient);
  await fixture.query('DELETE FROM tmf_test_audit');
  await fixture.query('DELETE FROM tmf_artifact_filings');
});
afterAll(async () => { await fixture.harness.close(); });

const file = (artifactCode = 'protocol', reason: unknown = WHY) => request(app).post('/api/etmf/trials/STUDY-A/artifacts')
  .send({ artifactCode, documentRef: 'external-archive-reference', reason });
const list = () => request(app).get('/api/etmf/trials/STUDY-A/artifacts');

describe('a TMF filing or removal is not made without its audit row', () => {

  it('files nothing when the audit row cannot be written, says so without the store\'s text, and a retry files both', async () => {
    state.tmfAudit.mockRejectedValueOnce(new Error(SENTINEL));
    const refused = await file();
    expect(refused.status).toBe(500);
    expect(refused.body).toEqual({ success: false, error: 'INTERNAL', message: 'eTMF request failed.' });
    expect(JSON.stringify(refused.body)).not.toContain(SENTINEL);
    // The filing was rolled back with the audit row it could not have.
    expect(await stored('protocol')).toEqual([]);
    expect((await list()).body).toEqual([]);
    expect(await audited()).toEqual([]);
    const retried = await file();
    expect(retried.status).toBe(201);
    expect(retried.body).toMatchObject({ organizationId: 1, trialId: 'STUDY-A', artifactCode: 'protocol', meta: { auditTrail: RECORDED } });
    expect(await audited()).toEqual([{ action: 'TMF_ARTIFACT_FILED', record_id: retried.body.id }]);
    const listed = (await list()).body;
    expect(listed).toMatchObject([{ id: retried.body.id, documentRef: 'external-archive-reference' }]);
    expect(listed[0]).not.toHaveProperty('auditTrail');
    // The ancillary, after-commit writer is not used for a filing any more.
    expect(state.logAction).not.toHaveBeenCalled();
  });

  it('keeps a re-filing\'s previous document when the re-filing\'s audit row cannot be written', async () => {
    const first = await file();
    state.tmfAudit.mockRejectedValueOnce(new Error(SENTINEL));
    const refiled = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'protocol', documentRef: 'a-second-reference', reason: WHY });
    expect(refiled.status).toBe(500);
    expect(await stored('protocol')).toMatchObject([{ id: first.body.id, document_ref: 'external-archive-reference' }]);
    expect(await audited()).toHaveLength(1);
  });

  it('removes nothing when the removal\'s audit row cannot be written; a retry removes and records', async () => {
    const created = await file();
    state.tmfAudit.mockRejectedValueOnce(new Error(SENTINEL));
    const refused = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`).send({ reason: 'Filed against the wrong study.' });
    expect(refused.status).toBe(500);
    expect(JSON.stringify(refused.body)).not.toContain(SENTINEL);
    expect(refused.headers['x-audit-row-persisted']).toBeUndefined();
    expect(await stored('protocol')).toMatchObject([{ id: created.body.id, removed_at: null }]);
    expect((await list()).body.map((f: { id: string }) => f.id)).toEqual([created.body.id]);
    const removed = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`).send({ reason: 'Filed against the wrong study.' });
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');
    expect(removed.headers['x-audit-row-persisted']).toBe('true');
    expect(removed.headers['x-audit-row-chained']).toBe('true');
    expect(removed.headers['x-audit-row-code']).toBeUndefined();
    expect((await list()).body).toEqual([]);
    expect((await audited()).map((a) => a.action)).toEqual(['TMF_ARTIFACT_FILED', 'TMF_ARTIFACT_REMOVED']);
    const calls = state.tmfAudit.mock.calls.length;
    const retry = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`).send({ reason: 'Filed against the wrong study.' });
    expect(retry.status).toBe(404);
    expect(retry.headers['x-audit-row-persisted']).toBeUndefined();
    expect(state.tmfAudit.mock.calls).toHaveLength(calls);
  });

});

describe('a TMF batch records each filing it makes, and makes none it cannot record', () => {
  it('reports each item of a batch; an invalid item is refused and the rest are filed and recorded', async () => {
    const response = await request(app).post('/api/etmf/trials/STUDY-A/artifacts/bulk').send({ reason: WHY, artifacts: [
      { artifactCode: 'protocol' }, { artifactCode: 'invalid-artifact' }, { artifactCode: 'investigators_brochure' }, {},
    ] });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ filed: 2, total: 4, meta: { auditTrail: RECORDED }, results: [
      { artifactCode: 'protocol', ok: true, auditTrail: RECORDED },
      { artifactCode: 'invalid-artifact', ok: false, error: 'UNKNOWN_ARTIFACT' },
      { artifactCode: 'investigators_brochure', ok: true, auditTrail: RECORDED },
      { artifactCode: '', ok: false },
    ] });
    expect(state.tmfAudit).toHaveBeenCalledTimes(2);
    expect(await audited()).toHaveLength(2);
  });

  it('stops a batch at an item whose audit row cannot be written: that item is not filed, and the rest are not attempted', async () => {
    state.tmfAudit.mockImplementationOnce(recordOnTheClient).mockRejectedValueOnce(new Error(SENTINEL));
    const response = await request(app).post('/api/etmf/trials/STUDY-A/artifacts/bulk').send({ reason: WHY, artifacts: [
      { artifactCode: 'protocol' }, { artifactCode: 'investigators_brochure' }, { artifactCode: 'sample_crf' },
    ] });
    expect(response.status).toBe(207);
    expect(response.body).toMatchObject({ partial: true, filed: 1, total: 3, meta: { auditTrail: RECORDED }, results: [
      { artifactCode: 'protocol', ok: true, auditTrail: RECORDED },
      { artifactCode: 'investigators_brochure', ok: false, error: 'TMF_ARTIFACT_WRITE_UNCONFIRMED', completion: 'unconfirmed' },
      { artifactCode: 'sample_crf', ok: false, error: 'NOT_ATTEMPTED', completion: 'not-attempted' },
    ] });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
    // What the read-back the response points to shows: one filing, the one that was recorded.
    expect(response.body.recovery).toMatchObject({ method: 'GET', url: '/api/etmf/trials/STUDY-A/artifacts' });
    expect((await request(app).get(response.body.recovery.url)).body.map((f: { artifactCode: string }) => f.artifactCode)).toEqual(['protocol']);
    expect(await audited()).toHaveLength(1);
  });

  it('does not fabricate an audit receipt for an all-invalid bulk request', async () => {
    const response = await request(app).post('/api/etmf/trials/STUDY-A/artifacts/bulk').send({ reason: WHY, artifacts: [{ artifactCode: 'unknown' }, {}] });
    expect(response.status).toBe(200);
    expect(response.body.filed).toBe(0);
    expect(response.body).not.toHaveProperty('meta');
    expect(state.tmfAudit).not.toHaveBeenCalled();
  });

  it('does not attempt an audit when a filing is refused, has no reason, or a viewer submits it', async () => {
    expect((await file('unknown')).status).toBe(400);
    expect((await file('protocol', '')).status).toBe(400);
    expect((await request(app).post('/api/etmf/trials/no-such-study/artifacts').send({ artifactCode: 'protocol', reason: WHY })).status).toBe(404);
    role = 'viewer';
    expect((await file()).status).toBe(403);
    expect(state.tmfAudit).not.toHaveBeenCalled();
    expect(state.logAction).not.toHaveBeenCalled();
    expect(await stored('protocol')).toEqual([]);
  });
});

describe('assessment ancillary audit outcome transport', () => {
  it.each(['lost', 'thrown', 'healthy'] as const)('preserves the recorded snapshot and reports %s audit outcome', async mode => {
    if (mode === 'lost') state.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: SENTINEL });
    if (mode === 'thrown') state.logAction.mockRejectedValueOnce(new Error(SENTINEL));
    const submissionId = 1000 + ++serial;
    const response = await request(app).post('/api/regulatory-assessments').send({ submissionId, assessmentType: 'recorded-snapshot', ready: false, result: { source: 'synthetic contract proof' } });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ organizationId: 1, submissionId, ready: false,
      meta: { auditTrail: mode === 'healthy' ? { persisted: true, chained: true } : LOST } });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
    const stored = await request(app).get(`/api/regulatory-assessments/${response.body.id}`);
    expect(stored.body).toMatchObject({ id: response.body.id, result: { source: 'synthetic contract proof' } });
    expect(stored.body).not.toHaveProperty('meta');
    expect(state.logAction).toHaveBeenCalledTimes(1);
  });

  it('does not audit malformed business input or viewer-denied creation', async () => {
    expect((await request(app).post('/api/regulatory-assessments').send({ submissionId: 1 })).status).toBe(400);
    role = 'viewer';
    expect((await request(app).post('/api/regulatory-assessments').send({ submissionId: 1, assessmentType: 'recorded', result: {} })).status).toBe(403);
    expect(state.logAction).not.toHaveBeenCalled();
  });
});
