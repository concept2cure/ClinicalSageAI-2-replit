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
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const h = vi.hoisted(() => ({ computeReadiness: vi.fn() }));

vi.mock('../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));
vi.mock('../../services/intelligence/regulatory-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/intelligence/regulatory-intelligence.js')>()),
  computeReadiness: h.computeReadiness,
}));

import router from '../regulatory-intelligence';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { user: { id: 5, userId: 5, role: 'admin', organizationId: 7 }, userId: 5 });
  next();
});
app.use('/api/regulatory-intelligence', router);

const BASE = { submissionType: 'IND', presentSections: ['m1'] };
const post = (body: Record<string, unknown>) => request(app).post('/api/regulatory-intelligence/readiness').send(body);

beforeEach(() => {
  h.computeReadiness.mockReset().mockResolvedValue({ ok: true });
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
