import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const m = vi.hoisted(() => ({ resume: vi.fn(), run: vi.fn() }));
vi.mock('../../services/submission-orchestrator-continuation.js', () => ({ continueOrchestratorRun: m.resume, requireOrchestratorProgramAccess: vi.fn(), OrchestratorContinuationRefusal: class extends Error {} }));
vi.mock('../../services/submission-package-orchestrator.js', () => ({ runOrchestrator: m.run, getRun: vi.fn(), getRunAudit: vi.fn(), regenerateAffected: vi.fn(), loadSubmissionFkBySubmissionIdText: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn() }, db: {} }));
vi.mock('../../services/auditService.js', () => ({ default: { logAction: vi.fn() } }));
import router from '../submission-orchestrator';
const RUN = '22e4f86d-4b76-48ac-87e3-8bce8804c324';
function app(user: unknown = { id: 7, role: 'manager', organizationId: 42 }) {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => { (req as any).user = user; next(); }); a.use('/api/submission-orchestrator', router); return a;
}
beforeEach(() => { vi.clearAllMocks(); m.resume.mockResolvedValue({ continuation: 'waiting', run: { runId: RUN, organizationId: 42, status: 'awaiting-async', steps: [] } }); });
describe('production continuation route', () => {
  it('continues the same recorded run with the authenticated tenant and actor, ignoring body-supplied scope or inputs', async () => {
    const res = await request(app()).post(`/api/submission-orchestrator/runs/${RUN}/resume`).send({ organizationId: 999, userId: 888, cmcSources: [{ forged: true }] });
    expect(res.status).toBe(200); expect(m.resume).toHaveBeenCalledWith(RUN, 42, 7); expect(m.run).not.toHaveBeenCalled(); expect(res.body.continuation).toBe('waiting');
  });
  it('requires authentication before attempting continuation', async () => {
    const res = await request(app(null)).post(`/api/submission-orchestrator/runs/${RUN}/resume`).send({});
    expect(res.status).toBe(401); expect(m.resume).not.toHaveBeenCalled();
  });
  it.each(['/runs', '/runs/for-program', `/runs/${RUN}/resume`, `/runs/${RUN}/regenerate`])('denies a current viewer before mutating through %s', async path => {
    const res = await request(app({ id: 7, role: 'viewer', organizationId: 42 })).post(`/api/submission-orchestrator${path}`).send({});
    expect(res.status).toBe(403); expect(m.resume).not.toHaveBeenCalled(); expect(m.run).not.toHaveBeenCalled();
  });
});
