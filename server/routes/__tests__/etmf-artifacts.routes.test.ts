/**
 * eTMF HTTP contract: a study's filings over the mounted router (PGlite, faked
 * auth), as the Vault's Trial master file section calls it.
 *
 *   GET    /api/etmf/trials/:studyId/completeness?scope=   the assessment, with `study`
 *   GET    /api/etmf/trials/:studyId/artifacts             the study's live filings
 *   POST   /api/etmf/trials/:studyId/artifacts             { artifactCode, documentRef, reason }
 *   DELETE /api/etmf/artifacts/:id                         { reason }
 *   GET    /api/etmf/trials/:studyId/inspection-package    the ZIP, recorded
 *
 * `:studyId` is the study's own id string, as GET /api/study-design lists it.
 * Refusals answer `{ success: false, error: <CODE>, message }`.
 *
 * Until 2026-11-10 (eTMF convergence E2 and E3) this suite filed against a
 * trial name typed by hand ('T-1'), with no reason, and removed by DELETE.
 * The route, the persistence service and the SQL are real, on the columns the
 * real migration adds. Two things are doubled: whether the caller can open a
 * project (the Vault's rule, proved on PostgreSQL in
 * tests/db/etmf-study-binding.dbtest.ts) and the audit writer, which records
 * on the client it is handed so its row commits or rolls back with the change.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { createTmfRouteDb, DOC_A, DOC_B, PROGRAM_A, PROGRAM_B, type TmfRouteDb } from './_etmf-pglite-fixture';

const state = vi.hoisted(() => ({
  fixture: null as any,
  /** The projects the caller can open and write. */
  open: new Set<string>(),
  logAction: vi.fn(),
}));
vi.mock('../../db', () => ({
  get db() { return state.fixture.harness.db; },
  get pool() { return state.fixture.pool; },
  get transaction() { return state.fixture.transaction; },
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: state.logAction },
  writeChainedAuditRow: async (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, entry: any) => {
    await client.query('INSERT INTO tmf_test_audit (action, record_id, reason, details) VALUES ($1, $2, $3, $4)',
      [entry.action, String(entry.resourceId), entry.reason ?? null, JSON.stringify(entry.details ?? {})]);
  },
}));
vi.mock('../../services/c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  const admit = async (_q: unknown, input: { programId: string }) => {
    if (!state.open.has(input.programId)) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Private project.');
    return {};
  };
  return { ProgramReadAccessError, requireCurrentProgramAccess: admit };
});
vi.mock('../../services/vault/vault-write-authority', async () => {
  const { requireCurrentProgramAccess } = await import('../../services/c2c/current-program-access');
  return { requireCurrentVaultProgramWrite: requireCurrentProgramAccess };
});
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import etmfRouter from '../etmf.routes';

let fixture: TmfRouteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;
const WHY = 'Signed protocol received from the sponsor.';
const auditOf = async (recordId: string) =>
  (await fixture.query('SELECT action, reason, details FROM tmf_test_audit WHERE record_id = $1 ORDER BY seq', [recordId])).rows;

beforeAll(async () => {
  fixture = await createTmfRouteDb();
  state.fixture = fixture;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (currentUser) (req as any).user = currentUser; next(); });
  app.use('/api/etmf', etmfRouter);
});
beforeEach(() => {
  currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  state.open = new Set([PROGRAM_A, PROGRAM_B]);
  state.logAction.mockReset().mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});
afterAll(async () => { await fixture.harness.close(); });

/** The 'protocol' filing of STUDY-A, made by the first suite and followed through the others. */
let artifactId: string;

describe('eTMF artifact persistence', () => {
  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(res.status).toBe(401);
  });

  it('POST file → 201 against the study (org and actor from the session); 400 for an unknown artifact code', async () => {
    const ok = await request(app).post('/api/etmf/trials/STUDY-A/artifacts')
      .send({ artifactCode: 'protocol', documentRef: 'doc-1', reason: WHY, organizationId: 2, userId: 99, studyRef: 3 });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body).toMatchObject({ organizationId: 1, createdBy: 9, trialId: 'STUDY-A', studyRef: 1, zoneNumber: 2, documentRef: 'doc-1',
      meta: { auditTrail: { persisted: true, chained: true } } }); // protocol is Zone 2; STUDY-A is study row 1
    artifactId = ok.body.id;
    expect(await auditOf(artifactId)).toMatchObject([{ action: 'TMF_ARTIFACT_FILED', reason: WHY,
      details: { study: { id: 1, studyId: 'STUDY-A', protocolId: 'PROT-A' }, artifactCode: 'protocol', documentRef: 'doc-1', outcome: 'filed' } }]);

    const bad = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'not_a_real_artifact', reason: WHY });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ success: false, error: 'UNKNOWN_ARTIFACT' });
    expect(typeof bad.body.message).toBe('string');
    const none = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ reason: WHY });
    expect(none.status).toBe(400);
    expect(none.body).toMatchObject({ success: false, error: 'VALIDATION' });
  });

  it('refuses a filing with no reason (400 REASON_REQUIRED), and files nothing', async () => {
    for (const body of [{ artifactCode: 'sample_crf' }, { artifactCode: 'sample_crf', reason: 'short' }]) {
      const res = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
    }
    const list = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(list.body.map((a: any) => a.artifactCode)).toEqual(['protocol']);
  });

  it('refuses a trial name that is no study the caller can open (404 STUDY_NOT_FOUND) on every route', async () => {
    state.open = new Set([PROGRAM_A]); // project B is private to someone else
    for (const name of ['T-1', '1', 'STUDY-Z', 'STUDY-B']) {
      const base = `/api/etmf/trials/${name}`;
      for (const res of [
        await request(app).get(`${base}/artifacts`),
        await request(app).get(`${base}/completeness`),
        await request(app).get(`${base}/inspection-package`),
        await request(app).post(`${base}/artifacts`).send({ artifactCode: 'protocol', reason: WHY }),
        await request(app).post(`${base}/artifacts/bulk`).send({ artifacts: [{ artifactCode: 'protocol' }], reason: WHY }),
      ]) {
        expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(404);
        expect(res.body).toMatchObject({ success: false, error: 'STUDY_NOT_FOUND' });
      }
      expect((await fixture.query('SELECT 1 FROM tmf_artifact_filings WHERE trial_id = $1', [name])).rows).toEqual([]);
    }
    expect(state.logAction).not.toHaveBeenCalled();
  });

  it('refuses a Vault document of another project (409 DOCUMENT_NOT_IN_PROJECT); files one of the study\'s own', async () => {
    const other = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'sample_crf', documentRef: `vault://${DOC_B}`, reason: WHY });
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ success: false, error: 'DOCUMENT_NOT_IN_PROJECT' });
    const own = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'sample_crf', documentRef: `vault://${DOC_A}`, reason: WHY });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect(own.body.documentRef).toBe(`vault://${DOC_A}`);
  });

  it('GET artifacts says what each filing\'s document is, and null where the reference is not a Vault document of the project', async () => {
    // A row the route refuses to make, laid directly: filed against project B's document.
    await fixture.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, study_ref)
       VALUES (1, 'STUDY-A', 'sample_icf', 2, $1, 1)`, [`vault://${DOC_B}`]);
    const list = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(list.status).toBe(200);
    expect(list.body.map((a: any) => [a.artifactCode, a.document])).toEqual([
      ['protocol', null], // filed against 'doc-1', an off-platform reference
      ['sample_crf', { id: DOC_A, title: 'Sample case report form', version: '2.0', current: true }],
      ['sample_icf', null], // another project's document is not named
    ]);
    expect(JSON.stringify(list.body)).not.toContain('A document of project B');
    await fixture.query(`DELETE FROM tmf_artifact_filings WHERE artifact_code = 'sample_icf'`);
  });

  it('re-filing the same artifact updates the one row, and records the document it replaced', async () => {
    const again = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'protocol', documentRef: 'doc-1-v2', reason: 'Amendment 1 supersedes the first protocol.' });
    expect(again.body.id).toBe(artifactId);
    const list = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(list.body.filter((a: any) => a.artifactCode === 'protocol')).toHaveLength(1);
    expect((await auditOf(artifactId))[1]).toMatchObject({ action: 'TMF_ARTIFACT_FILED',
      details: { outcome: 'refiled', documentRef: 'doc-1-v2', replacedDocumentRef: 'doc-1' } });
  });

});

describe('eTMF reads are the study\'s', () => {
  it('GET completeness reflects stored artifacts (not ready until all essentials filed), and names the study', async () => {
    const res = await request(app).get('/api/etmf/trials/STUDY-A/completeness');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.summary.totalMissing).toBeGreaterThan(0);
    expect(res.body.study).toEqual({ id: 1, studyId: 'STUDY-A', programId: PROGRAM_A, protocolId: 'PROT-A', title: 'Study A',
      phase: 'Phase II', indication: 'Hypertension', status: 'draft' });
    /* 2026-10-15: this asserted that zone 2's `present` held 'protocol', filed
       against 'doc-1-v2' — an off-platform reference nothing can check. A
       filing row is not a document, so it is listed as filed but unverified. */
    const zone2 = res.body.zones.find((z: any) => z.number === 2);
    expect(zone2.present).not.toContain('protocol');
    expect(zone2.unverified).toContainEqual({ code: 'protocol', evidence: 'unverifiable' });
    // The Vault document of the study's own project is the one that counts.
    expect(zone2.present).toContain('sample_crf');
  });

  it('does not serve another org\'s study, or this study to another org', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    state.open = new Set(['0c000000-0000-4000-8000-00000000000c', PROGRAM_A]);
    const theirs = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(theirs.status).toBe(404);
    expect(theirs.body).toMatchObject({ success: false, error: 'STUDY_NOT_FOUND' });
    expect((await request(app).get('/api/etmf/trials/STUDY-Z/artifacts')).body).toEqual([]);
    expect((await request(app).delete(`/api/etmf/artifacts/${artifactId}`).send({ reason: WHY })).status).toBe(404);
  });

  it('streams the inspection package as a recorded download, and sends nothing when it cannot be recorded', async () => {
    const res = await request(app).get('/api/etmf/trials/STUDY-A/inspection-package?scope=all').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="tmf-inspection-STUDY-A.zip"');
    expect(res.headers['x-export-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers['x-tmf-sha256']).toBe(res.headers['x-export-sha256']);
    expect(res.headers['x-tmf-ready']).toBe('false');
    const manifest = JSON.parse(await (await JSZip.loadAsync(res.body as Buffer)).file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({ trialId: 'STUDY-A', scope: 'all', study: { id: 1, studyId: 'STUDY-A' } });
    expect(state.logAction).toHaveBeenCalledTimes(1);
    expect(state.logAction.mock.calls[0][0]).toMatchObject({ organizationId: 1, userId: 9, action: 'EXPORT_GENERATED',
      resourceType: 'tmf_inspection_package', resourceId: '1',
      details: { sha256: res.headers['x-export-sha256'], sourceType: 'export_zip', filename: 'tmf-inspection-STUDY-A.zip',
        backendRoute: '/api/etmf/trials/:trialId/inspection-package', studyRef: 1, studyId: 'STUDY-A', scope: 'all' } });

    state.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'SENTINEL audit store detail' });
    const refused = await request(app).get('/api/etmf/trials/STUDY-A/inspection-package');
    expect(refused.status).toBe(503);
    expect(refused.body).toMatchObject({ success: false, error: 'UNAUDITED_EXPORT_REFUSED' });
    expect(JSON.stringify(refused.body)).not.toContain('SENTINEL');
    expect(refused.headers['content-disposition']).toBeUndefined();
    expect(refused.headers['x-tmf-sha256']).toBeUndefined();
  });

});

describe('eTMF removal keeps the record', () => {
  it('DELETE needs a reason; with one → 204, the filing is listed no more and stays on record; unknown id → 404', async () => {
    const unreasoned = await request(app).delete(`/api/etmf/artifacts/${artifactId}`);
    expect(unreasoned.status).toBe(400);
    expect(unreasoned.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
    const del = await request(app).delete(`/api/etmf/artifacts/${artifactId}`).send({ reason: 'Filed against the wrong study.' });
    expect(del.status).toBe(204);
    expect(del.headers['x-audit-row-persisted']).toBe('true');
    const list = await request(app).get('/api/etmf/trials/STUDY-A/artifacts');
    expect(list.body.map((a: any) => a.id)).not.toContain(artifactId);
    const kept = await fixture.query('SELECT removed_by, removal_reason, removed_at IS NOT NULL AS removed, document_ref FROM tmf_artifact_filings WHERE id = $1', [artifactId]);
    expect(kept.rows).toEqual([{ removed_by: 9, removal_reason: 'Filed against the wrong study.', removed: true, document_ref: 'doc-1-v2' }]);
    expect((await auditOf(artifactId))[2]).toMatchObject({ action: 'TMF_ARTIFACT_REMOVED', reason: 'Filed against the wrong study.',
      details: { study: { studyId: 'STUDY-A' }, artifactCode: 'protocol', documentRef: 'doc-1-v2' } });
    const missing = await request(app).delete('/api/etmf/artifacts/00000000-0000-0000-0000-000000000000').send({ reason: WHY });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: 'NOT_FOUND' });
    expect((await request(app).delete(`/api/etmf/artifacts/${artifactId}`).send({ reason: WHY })).status).toBe(404);
  });

  it('files the removed artifact again on the same row', async () => {
    const res = await request(app).post('/api/etmf/trials/STUDY-A/artifacts').send({ artifactCode: 'protocol', documentRef: `vault://${DOC_A}`, reason: WHY });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.id).toBe(artifactId);
    expect((await fixture.query('SELECT count(*)::int AS n FROM tmf_artifact_filings WHERE trial_id = $1 AND artifact_code = $2', ['STUDY-A', 'protocol'])).rows).toEqual([{ n: 1 }]);
    expect((await auditOf(artifactId))[3]).toMatchObject({ details: { outcome: 'filed_after_removal',
      clearedRemoval: { removedBy: 9, reason: 'Filed against the wrong study.', documentRef: 'doc-1-v2' } } });
  });
});
