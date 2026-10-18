/**
 * GET /api/authoring-actions/contradiction-context/:projectId reads the
 * caller's organization's decisions, and a failed read fails the request.
 *
 * The route asked for the contradiction-aware decision status with no
 * organization — so the decisions were read across every tenant and the
 * contradictions for organization 1 — and caught any failure into
 * `contradictionAwareStatus: null` beside a context that read as complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({ aware: vi.fn(), context: vi.fn() }));

vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: { buildPreflightContradictionContext: H.context },
}));
vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: { computeContradictionAwareStatus: H.aware },
}));

import authoringActionsRouter from '../authoring-actions';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).tenantId = 3; (req as any).userId = 7; next(); });
app.use('/api/authoring-actions', authoringActionsRouter);

beforeEach(() => {
  vi.clearAllMocks();
  H.context.mockResolvedValue({ unresolvedCount: 0, blockingCount: 0, overlayActiveCount: 0 });
  H.aware.mockResolvedValue({ summary: 'No pending decisions or contradictions' });
});

describe('GET /contradiction-context/:projectId', () => {
  it("asks for this organization's decision status", async () => {
    const res = await request(app).get('/api/authoring-actions/contradiction-context/42');
    expect(res.status).toBe(200);
    expect(H.aware).toHaveBeenCalledWith('42', expect.objectContaining({ organizationId: 3 }));
  });

  it('fails, rather than answering with a null status, when the status cannot be read', async () => {
    H.aware.mockRejectedValue(new Error('contradiction engine unavailable'));
    const res = await request(app).get('/api/authoring-actions/contradiction-context/42');
    expect(res.status).toBe(500);
  });
});
