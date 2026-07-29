/**
 * GET /api/decision-lineage — governed decision-trail read contract.
 *
 * The v2 DecisionLineage surface adopts this list only when each row carries
 * the full LineageGraph display shape. Locks: 403 without org, the { data }
 * envelope with the display keys ({ rootEntityType, rootEntityId,
 * artifactLabel, nodes, edges, metadata }, mapped from the snake_case columns),
 * and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

beforeEach(() => query.mockReset());

describe('GET /api/decision-lineage', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/decision-lineage');
    expect(res.status).toBe(403);
  });

  it('returns graphs shaped to the display contract (snake_case → camelCase)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          root_entity_type: 'artifact',
          root_entity_id: 4025,
          artifact_label: 'BX-204 · §2.5 Clinical Overview (BLA 761123)',
          nodes: [{ id: 'n1', nodeType: 'document_state', action: 'created' }],
          edges: [{ from: 'n1', to: 'n2', relationship: 'preceded' }],
          metadata: { totalDecisions: 2, chainVerified: true },
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/decision-lineage');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['rootEntityType', 'rootEntityId', 'artifactLabel', 'nodes', 'edges', 'metadata']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.rootEntityType).toBe('artifact');
    expect(first.rootEntityId).toBe(4025);
    expect(Array.isArray(first.nodes)).toBe(true);
    expect(first.nodes[0].id).toBe('n1');
    expect(first.edges[0].relationship).toBe('preceded');
    expect(first.metadata.chainVerified).toBe(true);
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/decision-lineage');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
