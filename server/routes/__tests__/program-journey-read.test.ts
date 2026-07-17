/**
 * GET /api/program-journey — concept-to-submission read contract.
 *
 * The v2 BiopharmaJourney surface adopts a program record only when it carries
 * the full display shape. Locks: 403 without org, the { data } envelope with
 * the display keys ({ seg, code, name, app, modality, indication, pathway,
 * sponsor, agency, readiness, current, target, overlay, modules, clock, haqs,
 * contra, blockers }, with current_stage → current and the nested JSONB
 * rehydrated), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import programJourneyRouter from '../program-journey.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/program-journey', programJourneyRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/program-journey', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/program-journey');
    expect(res.status).toBe(403);
  });

  it('returns programs shaped to the display contract (current_stage → current, nested JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          seg: 'pharma', code: 'BX-204', name: '', app: 'NDA 212345',
          modality: 'Small molecule · 505(b)(1)', indication: 'Oncology · pivotal ORR 38.6%, OS HR 0.62',
          pathway: 'NDA · 505(b)(1)', sponsor: 'Concept2Cure', agency: 'FDA',
          readiness: 88, current_stage: 'review',
          target: { label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA · 41 days out' },
          overlay: { assemble: ['done', 95], review: ['active', 60] },
          modules: [{ m: '5', label: 'Clinical reports', pct: 74, risk: true }],
          clock: [{ l: 'PDUFA goal date', day: '--', date: '04 Apr 2027', st: 'current' }],
          haqs: [{ conf: 91, t: 'Pediatric exclusion rationale' }],
          contra: { t: 'Exposure-response narrative', tag: 'err · blocks promotion', d: 'M2 §2.5.4 · M2 §2.7.2' },
          blockers: [{ sev: 'high', t: 'DS stability', m: 'M3 §3.2.S.7.3', who: 'AR', due: 'Day 9 of 14' }],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/program-journey');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of [
      'seg', 'code', 'name', 'app', 'modality', 'indication', 'pathway', 'sponsor', 'agency',
      'readiness', 'current', 'target', 'overlay', 'modules', 'clock', 'haqs', 'contra', 'blockers',
    ]) {
      expect(first).toHaveProperty(k);
    }
    expect(first.current).toBe('review');
    expect(first).not.toHaveProperty('current_stage');
    expect(first.target).toHaveProperty('v', '04 Apr 2027');
    expect(Array.isArray(first.modules)).toBe(true);
    expect(first.modules[0]).toHaveProperty('pct', 74);
    expect(Array.isArray(first.blockers)).toBe(true);
    expect(first.overlay).toHaveProperty('review');
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/program-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
