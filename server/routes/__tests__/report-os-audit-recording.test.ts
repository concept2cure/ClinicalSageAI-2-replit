/**
 * Report OS runs, finalizations and PDF exports are events on the record
 * (21 CFR Part 11 §11.10(e)). Until 2026-09-30 none of them wrote an audit row:
 * a run, a seal and a PDF that left the system all left the audit trail as it
 * was.
 *
 * What is pinned here, per route:
 *   - POST /runs              → one chained row, `report_os.run_created`, after
 *     the run is written; when it cannot be written the answer is 503 saying
 *     the run exists and was not recorded — never a 201 that implies it was.
 *   - POST /runs/:id/finalize (review round 1, DP-47) → owners, admins and
 *     managers only, refused before any read; a run already final is refused
 *     (409 RUN_ALREADY_FINAL), so a seal is never overwritten; the status, the
 *     seal and `report_os.run_finalized` are written in ONE tenant-stamped
 *     transaction on one connection — all land or none (503, nothing changed).
 *     Since the reporting review of 2026-10-01 it is an electronic signature:
 *     a reason of at least 8 characters, a declared meaning and
 *     re-authentication, refused before anything is written; separation of
 *     duties against the run's requester; the sign ledger row and the
 *     electronic_signatures row on the same transaction. The ceremony's own
 *     edges (verifyReauth, the ledger writer, the signature writer) are
 *     replaced; separation of duties runs for real on the connection.
 *   - GET /runs/:id/export.pdf and GET /bundles/:bundleId/export.pdf (DP-50) →
 *     the entitlement gate, then a chained row carrying the hash of the exact
 *     bytes, written BEFORE anything is sent; 503 and no PDF when it cannot be.
 *   - POST /taxonomy/seed is gone: the registry has one writer, the generated
 *     migration (scripts/db/generate-report-type-registry-seed.ts).
 * Every chained row is written on a tenant-stamped transaction (BEGIN, the
 * organisation stamped, …, COMMIT; ROLLBACK on failure; connection released).
 *
 * The router's own imports are real; the database facade, the auth
 * middleware, the entitlement gate, the run computation and the audit writer
 * are replaced, because the contract under test is what the handlers do around
 * the audit row.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());

vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
/* The attempt limiter's budget is its own test's subject
   (middleware/__tests__/signing-attempt-limiter.test.ts); here it would refuse
   this suite's eleventh finalize. It passes through and records its scope. */
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => {
    h.limiterScopes.push(scope);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));
vi.mock('../c2c/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/actions')>()),
  verifyReauth: h.reauth,
  recordGovernedAction: h.ledger,
}));
vi.mock('../../services/part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/part11/signature-persistence')>()),
  persistGovernedSignSignature: h.signature,
}));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { buildSealedRecord, verifySeal } from '../../services/report-os/sealing/seal';
import type { RenderedReport } from '../../services/report-os/render/types';
import { deriveChainHash } from '../../services/audit/chain';
import { reportRuns, reportSnapshots } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  /* organizationId is what the real auth middleware sets; the router's write
     gate (requireEditorAccessForWrites) reads it. */
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = {
    id: 5, role: req.get('x-test-role') ?? 'manager', organizationId: 7,
  };
  next();
});
app.use('/api/report-os', reportOsRouter);

const STAMP = "SELECT set_config('app.current_tenant_id', $1, true)";
const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['program', 'project', 'submission'] };
const RUN = {
  id: 41, runUuid: '00000000-0000-4000-8000-000000000041', organizationId: 7, scopeType: 'submission', scopeId: 'sub-1',
  reportTypeId: TYPE.typeId, status: 'completed', confidence: 90, blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-09-30T12:00:00Z'), completedAt: new Date('2026-09-30T12:00:00Z'),
};

const auditEntry = () => h.audit.mock.calls[0]?.[1] as Record<string, any> | undefined;
const auditFails = () =>
  h.audit.mockImplementation(async () => {
    h.statements.push('<audit row>');
    throw new Error('audit_logs refused the row');
  });
const pdfBody = (r: request.Test) =>
  r.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

beforeEach(() => resetReportOsHarness(h));

describe('POST /runs never computes a prediction (reporting review 2026-10-01)', () => {
  it('refuses a prediction-family type with 422 before the plan gate, the computation or any write', async () => {
    h.queued.select.push([{ typeId: 'prediction.regulatory_forecast', label: 'Predictive Regulatory Forecast', family: 'prediction', allowedScopes: ['program', 'project', 'submission'] }]);
    const res = await request(app)
      .post('/api/report-os/runs')
      .send({ scopeType: 'submission', scopeId: 'sub-1', reportTypeId: 'prediction.regulatory_forecast' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PREDICTION_NOT_A_RUN');
    expect(res.body.error).toMatch(/not computed by the report run/);
    expect(h.gate).not.toHaveBeenCalled();
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
});

/**
 * Reporting review 2026-10-01, SECURITY-10: the run, its snapshot and its
 * dependencies were three inserts committed before the chain row was tried, so
 * a refused row left a run that was listed, bundlable and finalizable but never
 * recorded, and a retry made a second. All four now share one transaction.
 */
describe('POST /runs records the run on the audit chain, in the same transaction as the run', () => {
  const post = () =>
    request(app).post('/api/report-os/runs').send({ scopeType: 'submission', scopeId: 'sub-1', reportTypeId: TYPE.typeId });
  const INSERTS = [/^insert into "report_runs"/, /^insert into "report_snapshots"/];

  beforeEach(() => {
    h.queued.select.push([TYPE]);
    const snapshot = { id: 9, runId: RUN.id, organizationId: 7, scopeType: 'submission', scopeId: 'sub-1', snapshotVersion: 1, isLatest: true };
    h.respond.fn = (sql, arrayMode) =>
      !arrayMode ? [] : /"report_runs"/.test(sql) ? [driverRow(reportRuns, RUN)] : /"report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, snapshot)] : [];
  });

  it('writes the run, its snapshot and report_os.run_created on one tenant-stamped transaction, and answers 201', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(res.body.data.run).toMatchObject({ id: 41, runUuid: RUN.runUuid });
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.run_created',
      resourceType: 'report_run',
      resourceId: '41',
      details: { runUuid: RUN.runUuid, reportTypeId: TYPE.typeId, scopeType: 'submission', scopeId: 'sub-1', status: 'completed' },
    });
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    INSERTS.forEach((re, i) => expect(h.statements[2 + i]).toMatch(re));
    expect(h.statements.slice(4)).toEqual(['<audit row>', 'COMMIT', '<released>']);
  });

  it('rolls the run back with the row when the row cannot be written: 503, nothing saved, no run id', async () => {
    auditFails();
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_RUN_NOT_RECORDED' } });
    expect(res.body.data).toBeUndefined();
    expect(res.body.error.message).toMatch(/was not created.*nothing was saved/i);
    expect(JSON.stringify(res.body)).not.toContain('audit_logs refused');
    INSERTS.forEach((re, i) => expect(h.statements[2 + i]).toMatch(re));
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('a failed insert is an error, not "not recorded": rolled back, nothing recorded', async () => {
    h.respond.fn = (sql) => {
      if (/insert into "report_snapshots"/.test(sql)) throw new Error('snapshot insert refused');
      return /insert into "report_runs"/.test(sql) ? [driverRow(reportRuns, RUN)] : [];
    };
    const res = await post();
    expect(res.status).toBe(500);
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });
});

const SIGNED = { reason: 'Issued for the board pack', meaning: 'authorship', reauth: { password: 'correct horse' } };
const finalize = (role = 'manager', body: Record<string, unknown> = SIGNED) =>
  request(app).post(`/api/report-os/runs/${RUN.id}/finalize`).set('x-test-role', role).send(body);
const eligible = (status = 'completed') => h.queued.select.push([{ ...RUN, status }], [{ label: TYPE.label, truthfulnessRules: {} }]);
/** The connection answers the run reads with `locked` and requester 5 (the session user), and the snapshot read with one snapshot. */
const lockedAs = (locked: string, requestedBy: number | null = 5) => {
  h.respond.fn = (sql) =>
    /FROM report_runs/.test(sql)
      ? [{ status: locked, requested_by: requestedBy }]
      : /FROM report_snapshots/.test(sql) ? [{ id: 3, snapshot_metadata: { reportTypeId: TYPE.typeId } }] : [];
};
const nothingWritten = () => {
  expect(h.statements.filter((x) => /^UPDATE/.test(x))).toEqual([]);
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.ledger).not.toHaveBeenCalled();
  expect(h.signature).not.toHaveBeenCalled();
};

describe('POST /runs/:id/finalize (DP-47)', () => {

  it.each(['member', 'viewer'])('refuses a %s with 403 before reading anything', async (role) => {
    eligible();
    const res = await finalize(role);
    expect(res.status).toBe(403);
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'manager'])('lets the %s finalize: status, seal, chain row and signature commit together', async (role) => {
    eligible();
    lockedAs('completed');
    const res = await finalize(role);
    expect(res.status).toBe(200);
    const seal = res.body.data.seal;
    expect(seal.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.data.signature).toEqual({ signatureId: 'sig_1', signedAt: '2026-10-01T09:00:00.000Z', meaning: 'authorship' });
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.run_finalized',
      resourceType: 'report_run',
      resourceId: '41',
      details: {
        reportTypeId: TYPE.typeId, sealHash: seal.contentHash, algorithm: 'sha256', atomCount: seal.atomCount,
        reason: SIGNED.reason, meaning: 'authorship', priorStatus: 'completed',
      },
    });
    expect(h.reauth).toHaveBeenCalledWith(5, { password: 'correct horse' });
    expect(h.ledger.mock.calls[0][1]).toMatchObject({
      orgId: 7, userId: 5, command: 'sign', target: 'report-run:41', reason: SIGNED.reason, domain: 'report_os',
      payload: { finalized: true, sealHash: seal.contentHash, priorStatus: 'completed', meaning: 'authorship' },
    });
    // One connection, one transaction: the lock, both writes and the row sit between BEGIN and COMMIT.
    const s = h.statements;
    expect(s.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(s.slice(-2)).toEqual(['COMMIT', '<released>']);
    const at = (re: RegExp) => s.findIndex((x) => re.test(x));
    expect(at(/FROM report_runs .*FOR UPDATE/)).toBeGreaterThan(1);
    expect(at(/^UPDATE report_runs SET status = 'final'/)).toBeGreaterThan(at(/FOR UPDATE/));
    expect(at(/^UPDATE report_snapshots SET snapshot_metadata/)).toBeGreaterThan(at(/^UPDATE report_runs/));
    expect(at(/<audit row>/)).toBeGreaterThan(at(/^UPDATE report_snapshots/));
    expect(at(/<sign ledger>/)).toBeGreaterThan(at(/<audit row>/));
    expect(at(/<signature row>/)).toBeGreaterThan(at(/<sign ledger>/));
    expect(at(/COMMIT/)).toBeGreaterThan(at(/<signature row>/));
    expect(h.reads.select, 'the run and its type are read before the transaction; nothing else').toBe(2);
  });

});

describe('POST /runs/:id/finalize is an electronic signature (reporting review 2026-10-01)', () => {
  it('limits signing attempts on finalize (11.300(d))', () => {
    expect(h.limiterScopes).toContain('report-finalize');
  });

  it.each([
    ['no reason', { ...SIGNED, reason: undefined }],
    ['a reason under 8 characters', { ...SIGNED, reason: 'ok' }],
  ])('refuses %s with 400 REASON_REQUIRED before reading anything', async (_label, body) => {
    eligible();
    const res = await finalize('manager', body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'REASON_REQUIRED' }, field: 'reason' });
    expect(h.reads.select).toBe(0);
    expect(h.reauth).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('refuses a password that is not accepted with 401, before any transaction', async () => {
    eligible();
    lockedAs('completed');
    h.reauth.mockResolvedValue({ ok: false, error: 'REAUTH_PASSWORD_INVALID' });
    const res = await finalize();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'REAUTH_PASSWORD_INVALID' } });
    expect(res.body.error.message).toMatch(/Nothing was signed/);
    expect(h.statements).toEqual([]);
    nothingWritten();
  });

  it('refuses a meaning a finalize cannot carry', async () => {
    eligible();
    const res = await finalize('manager', { ...SIGNED, meaning: 'release' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEANING_NOT_ALLOWED');
    nothingWritten();
  });

});

describe('POST /runs/:id/finalize: separation of duties and the signature row', () => {
  it('refuses an approval from the run\'s own requester (separation of duties) and rolls back', async () => {
    eligible();
    lockedAs('completed', 5);
    const res = await finalize('manager', { ...SIGNED, meaning: 'approval' });
    expect(res.status).toBe(403);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    nothingWritten();
  });

  it('refuses an authorship signature from someone who did not request the run', async () => {
    eligible();
    lockedAs('completed', 99);
    const res = await finalize();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_AN_AUTHOR');
    expect(res.body.error.message).toMatch(/not an author of this report/);
    nothingWritten();
  });

  it('answers 503 with nothing changed when the signature row cannot be written', async () => {
    eligible();
    lockedAs('completed');
    h.signature.mockImplementation(async () => {
      h.statements.push('<signature row>');
      throw new Error('electronic_signatures refused the row');
    });
    const res = await finalize();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'REPORT_FINALIZE_NOT_RECORDED' } });
    expect(JSON.stringify(res.body)).not.toContain('electronic_signatures refused');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  });

  it('refuses a run that is already final with 409 RUN_ALREADY_FINAL and writes nothing', async () => {
    eligible('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RUN_ALREADY_FINAL' } });
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent finalize won the lock, and rolls back', async () => {
    eligible();
    lockedAs('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RUN_ALREADY_FINAL');
    expect(h.statements.filter((x) => /^UPDATE/.test(x))).toEqual([]);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('answers 503 with nothing changed when the chain row cannot be written: the writes roll back with it', async () => {
    eligible();
    lockedAs('completed');
    auditFails();
    const res = await finalize();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_FINALIZE_NOT_RECORDED' }, data: { runId: 41 } });
    expect(res.body.error.message).toMatch(/not finalized/i);
    expect(res.body.error.message).toMatch(/Nothing was changed/);
    expect(JSON.stringify(res.body)).not.toContain('audit_logs refused');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('records nothing when the truthfulness gate refuses the finalize', async () => {
    h.queued.select.push(
      [{ ...RUN, blockers: ['missing CSR'] }],
      [{ label: TYPE.label, truthfulnessRules: { requireBlockers: true, allowPartial: true } }],
    );
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('the seal is stored with what it sealed (reporting review 2026-10-01)', () => {
  it('stores the exact sealed document beside its seal on the snapshot', async () => {
    eligible();
    lockedAs('completed');
    const res = await finalize();
    expect(res.status).toBe(200);
    const i = h.statements.findIndex((x) => /^UPDATE report_snapshots SET snapshot_metadata/.test(x));
    const stored = JSON.parse(String(h.params[i][1]));
    expect(stored.seal.contentHash).toBe(res.body.data.seal.contentHash);
    expect(stored.sealedDocument.sections.length).toBeGreaterThan(0);
    // What is stored is what was sealed: the document hashes to the stored seal.
    expect(verifySeal(stored.sealedDocument, stored.seal).ok).toBe(true);
    expect(verifySeal({ ...stored.sealedDocument, status: 'partial' }, stored.seal).ok).toBe(false);
    // The chain row records that the document was stored, so its later removal reads as a mismatch.
    expect(auditEntry()?.details).toMatchObject({ documentStored: true, sealHash: stored.seal.contentHash });
    expect(stored.sealedDocument.status).toBe('final');
    // The document is stamped with the run's computation time, not the moment of sealing.
    expect(stored.sealedDocument.generatedAt).toBe(RUN.createdAt.toISOString());
  });

  it('refuses a run with no snapshot to hold its seal, and rolls back', async () => {
    eligible();
    h.respond.fn = (sql) => (/FROM report_runs/.test(sql) ? [{ status: 'completed', requested_by: 5 }] : []);
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RUN_HAS_NO_SNAPSHOT');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.ledger).not.toHaveBeenCalled();
  });
});

const sealedDocument: RenderedReport = { reportTypeId: TYPE.typeId, scopeType: 'submission', scopeId: 'sub-1', generatedAt: '2026-09-30T12:00:00.000Z', status: 'final', sections: [{ id: 'as-sealed', title: 'As sealed', blocks: [] }] };
const seal = buildSealedRecord(sealedDocument, '2026-09-30T13:00:00.000Z');
/**
 * On the record: the snapshot holds `metadata`; finalize's chain row (documentStored,
 * payload-bound, linked from genesis) and its signature exist; the run reads `status`
 * inside the transaction.
 */
const sealedOnRecord = (metadata: Record<string, unknown>, status = 'final') => {
  const nv = JSON.stringify({ sealHash: seal.contentHash, sealedAt: seal.sealedAt, atomCount: seal.atomCount, algorithm: seal.algorithm, canonVersion: seal.canonVersion, documentStored: true });
  const linked = { action: 'report_os.run_finalized', actor_id: 5, target: `report_run:${RUN.id}`, payload_hash: createHash('sha256').update(nv).digest('hex'), occurred_at: new Date('2026-09-30T13:00:01Z') };
  const row = { ...linked, nv, tenant_id: 7, chain_seq: 3, sha256_chain: deriveChainHash(linked, '0'.repeat(64)), hmac_seal: null };
  const signature = { signer_name: 'Dana Reyes', signed_at: new Date(), signature_meaning: 'approval', manifest: JSON.stringify({ act: { sealHash: seal.contentHash } }) };
  h.respond.fn = (sql) =>
    /FROM report_runs/.test(sql) ? [{ status }]
      : /FROM report_snapshots/.test(sql) ? [{ snapshot_metadata: metadata }]
        : /run_finalized/.test(sql) ? [row]
          : /FROM electronic_signatures/.test(sql) ? [signature] : [];
};

describe('GET /runs/:id/rendered', () => {
  const rendered = () => request(app).get(`/api/report-os/runs/${RUN.id}/rendered`);

  it('shows a final run as what was sealed, not a re-render', async () => {
    h.queued.select.push([{ ...RUN, status: 'final' }], [{ label: TYPE.label, truthfulnessRules: {} }]);
    sealedOnRecord({ seal, sealedDocument });
    const res = await rendered();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: sealedDocument, sealed: true });
  });

  it('refuses a stored copy that no longer matches its seal, and never shows it as the sealed record', async () => {
    h.queued.select.push([{ ...RUN, status: 'final' }], [{ label: TYPE.label, truthfulnessRules: {} }]);
    sealedOnRecord({ seal, sealedDocument: { ...sealedDocument, sections: [{ id: 'as-sealed', title: 'Edited after sealing', blocks: [] }] } });
    const res = await rendered();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEALED_DOCUMENT_MISMATCH');
    expect(JSON.stringify(res.body)).not.toContain('Edited after sealing');
  });

  it.each([
    ['its sealed document was removed after a finalize that stored it', 'final', { seal }],
    ['its status was rewritten after the chain recorded its finalization', 'completed', { seal, sealedDocument }],
  ])('refuses a run whose record contradicts the chain (%s), and renders nothing', async (_label, status, metadata) => {
    h.queued.select.push([{ ...RUN, status }], [{ label: TYPE.label, truthfulnessRules: {} }]);
    sealedOnRecord(metadata, status);
    const res = await rendered();
    expect([res.status, res.body.error?.code, res.body.data?.sections]).toEqual([409, 'SEALED_DOCUMENT_MISMATCH', undefined]);
  });

  it('renders a final run with no stored document as final, never partial', async () => {
    h.queued.select.push([{ ...RUN, status: 'final' }], [{ label: TYPE.label, truthfulnessRules: { allowPartial: true } }]);
    const res = await rendered();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('final');
  });

  it('stamps a render with the run\'s computation time, so two renders of one run are one document', async () => {
    h.queued.select.push([RUN], [{ label: TYPE.label, truthfulnessRules: {} }], [RUN], [{ label: TYPE.label, truthfulnessRules: {} }]);
    const a = await rendered();
    const b = await rendered();
    expect(a.body.data.generatedAt).toBe(RUN.createdAt.toISOString());
    expect(b.body.data).toEqual(a.body.data);
  });
});

describe('GET /runs/:id/export.pdf records the export before anything is sent', () => {
  const exportPdf = () => pdfBody(request(app).get(`/api/report-os/runs/${RUN.id}/export.pdf`));
  const typeRow = { label: TYPE.label, family: TYPE.family, truthfulnessRules: {} };
  const pdfText = async (bytes: Buffer) => {
    const { PDFParse } = (await import('pdf-parse')) as unknown as { PDFParse: new (o: { data: Buffer }) => { getText(): Promise<{ text: string }> } };
    return (await new PDFParse({ data: bytes }).getText()).text.replace(/\s+/g, ' ');
  };

  beforeEach(() => {
    h.queued.select.push([RUN], [typeRow]);
  });

  it('writes report_os.run_exported carrying the hash of the bytes sent and the export id they print, then sends the PDF', async () => {
    const res = await exportPdf();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      action: 'report_os.run_exported',
      resourceType: 'report_run',
      resourceId: '41',
      details: { reportTypeId: TYPE.typeId, status: 'completed', sealVerdict: null, format: 'pdf', filename: 'report-run-41.pdf', byteLength: body.length, sha256: createHash('sha256').update(body).digest('hex') },
    });
    const text = await pdfText(body);
    expect(text).toContain(`Export ${auditEntry()?.details.exportId} · Exported ${auditEntry()?.details.exportedAt} (UTC)`);
    expect(text).toContain('NOT FINAL (COMPLETED)');
    expect(h.statements.slice(-5)).toEqual(['BEGIN', STAMP, '<audit row>', 'COMMIT', '<released>']);
  });

  it('exports a final run as its verified sealed document, with the signature and the verdict', async () => {
    h.queued.select.splice(0, 2, [{ ...RUN, status: 'final' }], [typeRow]);
    sealedOnRecord({ seal, sealedDocument });
    const res = await exportPdf();
    const text = await pdfText(res.body as Buffer);
    for (const line of ['As sealed', 'Final. Signed by Dana Reyes as approval', 'Seal verification at export: intact.']) expect(text).toContain(line);
    expect(text).not.toMatch(/NOT FINAL/);
    expect(auditEntry()?.details).toMatchObject({ status: 'final', sealVerdict: 'intact' });
  });

  it('refuses a record that does not verify against the audit chain: 409, no PDF, nothing recorded', async () => {
    h.queued.select.splice(0, 2, [{ ...RUN, status: 'final' }], [typeRow]);
    sealedOnRecord({ seal, sealedDocument: { ...sealedDocument, sections: [{ id: 'as-sealed', title: 'Edited after sealing', blocks: [] }] } });
    const res = await exportPdf();
    expect([res.status, JSON.parse((res.body as Buffer).toString('utf8')).error.code]).toEqual([409, 'SEALED_DOCUMENT_MISMATCH']);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('answers 503 and sends no PDF when the export cannot be recorded', async () => {
    auditFails();
    const res = await exportPdf();
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ success: false, error: { code: 'REPORT_EXPORT_NOT_RECORDED' } });
    expect(body.error.message).toMatch(/Nothing was exported/);
  });
});

describe('GET /bundles/:bundleId/export.pdf (DP-50)', () => {
  const BUNDLE_ID = '11111111-1111-4111-8111-111111111111';
  const item = (runId: number, reportTypeId: string) => ({
    runId, runUuid: `run-${runId}`, reportTypeId, reportTypeLabel: reportTypeId, scopeType: 'project', scopeId: '12',
    status: 'completed', confidence: 80, blockers: [], createdAt: '2026-09-30T12:00:00.000Z',
  });
  const BUNDLE = {
    bundleId: BUNDLE_ID, organizationId: 7, name: 'Board pack', createdAt: '2026-09-30T12:00:00.000Z',
    projectIds: [12], runIds: [41, 42], items: [item(41, TYPE.typeId), item(42, 'portfolio.board_pack')],
  };
  const exportBundle = () => pdfBody(request(app).get(`/api/report-os/bundles/${BUNDLE_ID}/export.pdf`));

  beforeEach(() => {
    h.queued.select.push(
      [{ title: `bundle:${BUNDLE_ID}`, content: JSON.stringify({ bundleRecord: BUNDLE }), createdAt: new Date() }],
      [{ typeId: TYPE.typeId, family: 'readiness' }, { typeId: 'portfolio.board_pack', family: 'portfolio' }],
    );
  });

  it('refuses with the run export gate when a report in the bundle is above the plan, and sends nothing', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'standard', feature: 'report_families', requiredTier: 'standard' });
    const res = await exportBundle();
    expect(res.status).toBe(403);
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ requiredTier: 'enterprise', feature: 'portfolio_rollup', tier: 'standard' });
    expect(h.audit).not.toHaveBeenCalled();
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('writes report_os.bundle_exported carrying the hash of the bytes sent, then sends the PDF', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', feature: 'report_families', requiredTier: 'standard' });
    const res = await exportBundle();
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.bundle_exported',
      resourceType: 'report_bundle',
      resourceId: BUNDLE_ID,
      details: { runIds: [41, 42], format: 'pdf', byteLength: body.length, sha256: createHash('sha256').update(body).digest('hex') },
    });
    expect(h.statements).toEqual(['BEGIN', STAMP, '<audit row>', 'COMMIT', '<released>']);
  });

  it('answers 503 and sends no PDF when the bundle export cannot be recorded', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', feature: 'report_families', requiredTier: 'standard' });
    auditFails();
    const res = await exportBundle();
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ success: false, error: { code: 'REPORT_EXPORT_NOT_RECORDED' } });
  });
});

describe('the registry has one writer', () => {
  it('POST /taxonomy/seed no longer exists: the generated migration seeds the registry', async () => {
    const res = await request(app).post('/api/report-os/taxonomy/seed');
    expect(res.status).toBe(404);
  });
});
