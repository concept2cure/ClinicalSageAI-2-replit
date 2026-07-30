/**
 * GET /api/decision-lineage — the converged governed decision-trail list read.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape the
 * envelope. It reads ONLY the real workflow + audit store (via
 * decisionLineageService.getLineageGraph) — no legacy/seed blob and no fallback — so an
 * org with no recorded trail gets an honest empty list. (The enumeration + real-graph
 * assembly is proven in decision-lineage-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgDecisionLineage = vi.fn();
vi.mock('../../services/workflow/decision-lineage-view-assembler', () => ({
  assembleOrgDecisionLineage: (...a: unknown[]) => assembleOrgDecisionLineage(...a),
}));

import lineageRouter from '../decision-lineage.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/decision-lineage', lineageRouter);
  return app;
}

beforeEach(() => assembleOrgDecisionLineage.mockReset());

describe('GET /api/decision-lineage', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/decision-lineage');
    expect(res.status).toBe(403);
    expect(assembleOrgDecisionLineage).not.toHaveBeenCalled();
  });

  it('returns the real governed trails for the acting org, source = decision_lineage_service', async () => {
    assembleOrgDecisionLineage.mockResolvedValue([
      {
        rootEntityType: 'artifact', rootEntityId: 4025,
        artifactLabel: 'BX-204 · §2.5 Clinical Overview (BLA 761123)',
        nodes: [{ id: 'n1', nodeType: 'document_state', action: 'created' }],
        edges: [{ from: 'n1', to: 'n2', relationship: 'preceded' }],
        metadata: { totalDecisions: 2, chainVerified: true },
      },
    ]);
    const res = await request(appWith(7)).get('/api/decision-lineage');
    expect(res.status).toBe(200);
    expect(assembleOrgDecisionLineage).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('decision_lineage_service');
    const first = res.body.data[0];
    for (const k of ['rootEntityType', 'rootEntityId', 'artifactLabel', 'nodes', 'edges', 'metadata']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.rootEntityId).toBe(4025);
    expect(first.nodes[0].id).toBe('n1');
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no recorded trail — no fallback data', async () => {
    assembleOrgDecisionLineage.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/decision-lineage');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });
});
