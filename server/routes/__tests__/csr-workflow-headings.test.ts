/**
 * CSR slice 3: the csr-workflow board is the build's progress view. It shows a
 * job's sections against the whole canonical ICH E3 tree (every depth), each
 * with its recorded review state; an unwritten heading reads "not drafted".
 */
import express from 'express';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { flattenICHE3Sections, getICHE3Structure } from '../../services/csr-builder.js';

const h = vi.hoisted(() => ({ job: null as Record<string, unknown> | null, outputs: [] as Record<string, unknown>[] }));
vi.mock('../../db.js', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => (h.job ? [h.job] : []) }) }) }) }) } }));
vi.mock('../../services/csr/csr-job-runner.js', () => ({ getCSRSectionOutputs: async () => h.outputs }));
vi.mock('../../services/csr/project-scope', () => ({
  CsrScopeError: class extends Error {}, readCsrProjectActor: async () => ({ userId: 5 }),
  resolveCsrScope: async () => ({ projectId: 11, programId: 'p' }),
}));
import createCsrWorkflowRoutes from '../csr-workflow-routes';

const app = express();
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
app.use('/api/csr-workflow', createCsrWorkflowRoutes());
const TREE = flattenICHE3Sections(getICHE3Structure());
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('csr-workflow board headings', () => {
  it('lists every heading of the canonical tree as not drafted when no build exists', async () => {
    h.job = null;
    const res = await request(app).get('/api/csr-workflow/board?projectId=11');
    expect(res.status).toBe(200);
    expect(res.body.data.headings).toHaveLength(TREE.length);
    expect(TREE.length).toBeGreaterThan(100);
    expect(res.body.data.headings.every((x: { state: string }) => x.state === 'not_drafted')).toBe(true);
    expect(res.body.data.headings.find((x: { num: string }) => x.num === '16.1.1')).toMatchObject({ manual: true, depth: 3 });
  });

  it('shows each saved heading with its review state, and a redrafted approval as a draft', async () => {
    h.job = { id: 3, projectId: 11, studyId: 'NCT05330182', status: 'complete', progress: 100, updatedAt: new Date('2026-10-29'),
      studyInfoSnapshot: { studyInfo: { title: 'LMN-201' }, evidenceSource: { runId: 'run-42' } } };
    h.outputs = [
      { sectionNumber: '11.4.1', content: 'Source-checked efficacy draft', contentHash: sha('Source-checked efficacy draft'), reviewStatus: 'approved', reviewedContentHash: sha('Source-checked efficacy draft'), reviewerId: 6, reviewDecidedAt: new Date('2026-10-29T10:00:00Z'), reviewReason: null },
      { sectionNumber: '10.1', content: 'Redrafted disposition text', contentHash: sha('Redrafted disposition text'), reviewStatus: 'approved', reviewedContentHash: sha('Old disposition text'), reviewerId: 6, reviewDecidedAt: new Date('2026-10-29T09:00:00Z'), reviewReason: null },
      { sectionNumber: '12.2', content: 'Review-pending safety text', contentHash: sha('Review-pending safety text'), reviewStatus: 'in_review', reviewedContentHash: sha('Review-pending safety text'), reviewerId: 5, reviewDecidedAt: new Date('2026-10-29T08:00:00Z'), reviewReason: null },
    ];
    const res = await request(app).get('/api/csr-workflow/board?projectId=11');
    const byNum = new Map(res.body.data.headings.map((x: { num: string }) => [x.num, x]));
    expect(byNum.get('11.4.1')).toMatchObject({ state: 'approved', reviewerId: 6, decidedAt: '2026-10-29T10:00:00.000Z', contentHash: sha('Source-checked efficacy draft') });
    expect(byNum.get('10.1')).toMatchObject({ state: 'draft', staleApproval: true });
    expect(byNum.get('12.2')).toMatchObject({ state: 'in_review' });
    expect(byNum.get('9.1')).toMatchObject({ state: 'not_drafted' });
    expect(res.body.data.meta).toMatchObject({ jobId: 3, sourceRunId: 'run-42' });
  });

  it('refuses to show a prior approval for tampered or unverifiable saved section bytes', async () => {
    h.job = { id: 3, projectId: 11, studyId: 'NCT05330182', status: 'complete', progress: 100,
      updatedAt: new Date('2026-10-29'), studyInfoSnapshot: { studyInfo: { title: 'Synthetic CSR' } } };
    const original = 'Original approved clinical text';
    h.outputs = [
      { sectionNumber: '11.4.1', content: 'Tampered after approval',
        contentHash: sha(original), reviewStatus: 'approved', reviewedContentHash: sha(original), reviewerId: 6 },
      { sectionNumber: '12.2', contentHash: sha('Unavailable body'), reviewStatus: 'approved',
        reviewedContentHash: sha('Unavailable body'), reviewerId: 6 },
    ];
    const res = await request(app).get('/api/csr-workflow/board?projectId=11');
    expect(res.status).toBe(200);
    const byNum = new Map(res.body.data.headings.map((x: { num: string }) => [x.num, x]));
    for (const code of ['11.4.1', '12.2']) {
      expect(byNum.get(code)).toMatchObject({ state: 'draft', integrityFailure: true });
      expect(byNum.get(code)).not.toHaveProperty('reviewerId', 6);
    }
  });
});
