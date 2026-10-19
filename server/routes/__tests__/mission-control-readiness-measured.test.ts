/**
 * A program's readiness is what its own records measure, and nothing else.
 *
 * GET /programs/:id/readiness scored nine dimensions. Four measured nothing:
 * routeFit was a constant 70, complianceIntegrity 85 or 50 by whether any
 * provenance row existed, and authorityConfidence / timelineConfidence were
 * 100 less invented per-risk penalties. The other five divided by
 * `length || 1` and gave invented partial credit, and a weighted "overall
 * confidence" of all nine read 66% for a program with no records at all.
 * Only the store is replaced, with an in-memory one.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rows: [] as Array<{ sub: string; data: Record<string, unknown> }> }));
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({
    async query(_org: number, sub?: string, filter?: (e: any) => boolean) {
      const all = h.rows.filter((r) => !sub || r.sub === sub).map((r, i) => ({ ...r.data, id: i + 1 }));
      return filter ? all.filter(filter) : all;
    },
    async getById() { return null; },
    async insert(_o: number, _s: string, _t: string, data: unknown) { return data; },
    async update() { return null; },
  }),
}));

import router from '../mission-control';

function readiness() {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 5 };
    next();
  });
  a.use('/api/mission-control', router);
  return request(a).get('/api/mission-control/programs/1/readiness');
}
const row = (sub: string, data: Record<string, unknown>) => h.rows.push({ sub, data: { programId: 1, ...data } });

beforeEach(() => {
  h.rows.length = 0;
});

describe('GET /api/mission-control/programs/:id/readiness', () => {
  it('scores nothing for a program with no records, and invents no overall figure', async () => {
    row('provenance', { action: 'created' });
    const r = await readiness();
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(Object.values(d.readiness).filter((v) => v !== null)).toEqual([]);
    expect(d.overallConfidence).toBeUndefined();
    expect(d.readiness).not.toHaveProperty('routeFit');
    expect(d.readiness).not.toHaveProperty('complianceIntegrity');
    expect(d.notMeasured).toEqual(['routeFit', 'authorityConfidence', 'complianceIntegrity', 'timelineConfidence']);
    // Not "Only 0/1 artifacts approved": there are no artifacts to count.
    expect(d.blockers).toEqual([]);
  });

  it('measures each dimension as a share of the program’s own records', async () => {
    row('artifact', { lifecycleState: 'approved' });
    row('artifact', { lifecycleState: 'drafting' });
    row('artifact', { lifecycleState: 'in-review' });
    row('artifact', { lifecycleState: 'exported' });
    row('evidence', { strengthLevel: 'strong' });
    row('evidence', { strengthLevel: 'moderate' });
    row('review', { status: 'approved' });
    row('review', { status: 'open' });
    row('dependency', { isStale: true });
    row('dependency', { isStale: false });
    row('dependency', { isStale: false });
    row('risk', { severity: 'critical', status: 'open' });
    const d = (await readiness()).body.data;
    expect(d.readiness).toEqual({
      artifactCompleteness: 50, // approved + exported, of 4 — no half credit for a draft
      approvalMaturity: 25,
      evidenceAdequacy: 50, // rated strong, of 2 — no 0.6 credit for moderate
      reviewMaturity: 50,
      consistencyIntegrity: 67,
    });
    expect(d.blockers.map((b: { type: string }) => b.type)).toEqual(['approval-gap', 'stale-dependencies', 'critical-risks']);
    expect(d.blockers.find((b: { type: string }) => b.type === 'approval-gap').message).toBe('Only 1/4 artifacts approved');
  });
});
