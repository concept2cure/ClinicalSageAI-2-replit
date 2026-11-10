/**
 * POST /api/regulatory-intelligence/readiness reads a null or absent projectId
 * as absent, and refuses one that is not a positive integer.
 *
 * What the route used to do (until 2026-10-15): `Number.isFinite(Number(x)) ?
 * Number(x) : undefined`. Number(null) and Number('') are 0, so a body with
 * `projectId: null` reached computeReadiness as project 0 — tying the template
 * check to a draft and reading signal reliability for a project that does not
 * exist. harmonizeIssueCount and openEscalations read null as 0 the same way:
 * "no issues" for a count nobody supplied.
 *
 * POST /interactions: since b8cee0745c a correction (non-empty correctionText)
 * is written by recordAuditedHumanCorrection inside one transaction on the
 * request's client, which re-reads the actor's active membership and re-admits
 * a stated project before the write; an outcome without correction text still
 * goes to recordInteraction. The fake `dbClient` stands in for the request
 * client production's authenticateToken attaches (establishRequestTenantScope).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const h = vi.hoisted(() => ({
  computeReadiness: vi.fn(), recordInteraction: vi.fn(), auditedCorrection: vi.fn(), activeActor: vi.fn(),
  projectAdmission: vi.fn(), requestQuery: vi.fn(), userId: 5 as number | null,
}));

vi.mock('../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));
vi.mock('../../services/intelligence/regulatory-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/intelligence/regulatory-intelligence.js')>()),
  computeReadiness: h.computeReadiness,
}));

vi.mock('../../services/intelligence/ana-failure-learning.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/intelligence/ana-failure-learning.js')>()),
  recordInteraction: h.recordInteraction,
  recordAuditedHumanCorrection: h.auditedCorrection,
}));
vi.mock('../../services/csr/project-scope.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/csr/project-scope.js')>()),
  readCsrProjectActor: h.activeActor,
}));
vi.mock('../c2c/project-access.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../c2c/project-access.js')>()),
  requireProjectAdmission: h.projectAdmission,
}));

import router from '../regulatory-intelligence';
import { ProjectAdmissionRefusal } from '../c2c/project-access';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { user: { id: h.userId, userId: h.userId, role: 'admin', organizationId: 7 }, userId: h.userId, dbClient: { query: h.requestQuery } });
  next();
});
app.use('/api/regulatory-intelligence', router);

const BASE = { submissionType: 'IND', presentSections: ['m1'] };
const post = (body: Record<string, unknown>) => request(app).post('/api/regulatory-intelligence/readiness').send(body);

beforeEach(() => {
  h.computeReadiness.mockReset().mockResolvedValue({ ok: true });
  h.userId = 5;
  h.projectAdmission.mockReset().mockResolvedValue(undefined);
  h.recordInteraction.mockReset().mockResolvedValue({ interactionId: 'interaction-1' });
  h.auditedCorrection.mockReset().mockResolvedValue({ interactionId: 'interaction-1', sourceAuditEventId: 'audit-1' });
  h.activeActor.mockReset().mockResolvedValue({ userId: 5, role: 'admin' });
  h.requestQuery.mockReset().mockResolvedValue({ rows: [] });
});

describe('POST /api/regulatory-intelligence/readiness', () => {
  it('passes a null projectId and null counts on as absent, not 0', async () => {
    const res = await post({ ...BASE, projectId: null, harmonizeIssueCount: null, openEscalations: null });
    expect(res.status).toBe(200);
    const input = h.computeReadiness.mock.calls[0][0];
    expect(input.projectId).toBeUndefined();
    expect(input.harmonizeIssueCount).toBeUndefined();
    expect(input.openEscalations).toBeUndefined();
  });

  it('passes a stated projectId on', async () => {
    await post({ ...BASE, projectId: 12 });
    expect(h.computeReadiness.mock.calls[0][0].projectId).toBe(12);
  });

  it('refuses a projectId that is not a positive integer, and computes nothing', async () => {
    for (const projectId of [0, 'abc', '', -3]) {
      const res = await post({ ...BASE, projectId });
      expect(res.status, JSON.stringify(projectId)).toBe(400);
    }
    expect(h.computeReadiness).not.toHaveBeenCalled();
  });
});


describe('authenticated correction attribution', () => {
  const correction = { agency: 'FDA', documentType: 'protocol', intent: 'review', outcome: 'edited', correctionText: 'Use the approved wording.' };
  const record = (over: Record<string, unknown> = {}) => request(app).post('/api/regulatory-intelligence/interactions').send({ ...correction, ...over });
  it('records the session actor and tenant despite forged body identity', async () => {
    expect((await record({ userId: 999, organizationId: 999, projectId: null })).status).toBe(201);
    expect(h.auditedCorrection).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, organizationId: 7, projectId: undefined }), expect.anything());
    const client = h.auditedCorrection.mock.calls[0][1];
    expect(h.activeActor).toHaveBeenCalledWith(client, 7, 5, { forShare: true });
    expect(h.requestQuery.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(h.recordInteraction).not.toHaveBeenCalled();
    expect(h.projectAdmission).not.toHaveBeenCalled();
  });
  it('requires current write admission for a stated project before recording', async () => {
    expect((await record({ projectId: 12 })).status).toBe(201);
    expect(h.projectAdmission).toHaveBeenCalledWith(expect.anything(), '12', true);
    expect(h.auditedCorrection).toHaveBeenCalledWith(expect.objectContaining({ projectId: 12, userId: 5 }), expect.anything());
    const client = h.auditedCorrection.mock.calls[0][1];
    expect(h.projectAdmission).toHaveBeenLastCalledWith(expect.anything(), '12', true, { executor: client });
    expect(h.projectAdmission.mock.invocationCallOrder.at(-1)).toBeLessThan(h.auditedCorrection.mock.invocationCallOrder[0]);
  });
  it('records an outcome without correction text directly, under the session actor and tenant', async () => {
    expect((await record({ outcome: 'accepted', correctionText: undefined, userId: 999, organizationId: 999 })).status).toBe(201);
    expect(h.recordInteraction).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, organizationId: 7, projectId: undefined }));
    expect(h.auditedCorrection).not.toHaveBeenCalled();
    expect(h.requestQuery).not.toHaveBeenCalled();
  });
  it('records nothing when project admission refuses', async () => {
    h.projectAdmission.mockRejectedValue(new ProjectAdmissionRefusal(403, 'PROJECT_MEMBERSHIP_REQUIRED', 'Project access is required.'));
    expect((await record({ projectId: 12 })).status).toBe(403);
    expect(h.recordInteraction).not.toHaveBeenCalled();
    expect(h.auditedCorrection).not.toHaveBeenCalled();
  });
  it('records nothing without a valid authenticated actor', async () => {
    h.userId = null;
    expect((await record({ userId: 5 })).status).toBe(401);
    expect(h.recordInteraction).not.toHaveBeenCalled();
    expect(h.auditedCorrection).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, '', 'not-a-project', true, [12], {}])('refuses invalid project %j without admission or correction write', async projectId => {
    expect((await record({ projectId })).status).toBe(400);
    expect(h.projectAdmission).not.toHaveBeenCalled();
    expect(h.recordInteraction).not.toHaveBeenCalled();
    expect(h.auditedCorrection).not.toHaveBeenCalled();
  });
});
