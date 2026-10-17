/**
 * A request body cannot name the organisation whose precedent library it reads
 * or writes.
 *
 * Every POST under /api/regulatory-precedent-intelligence built its argument
 * as { organizationId: <session>, ...req.body }, so a body carrying
 * organizationId searched, created or resolved another organisation's
 * records; and a request with no organisation fell back to a shared tenant
 * named 'default'. Every POST route of the router is walked here; only the
 * services are replaced.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as Array<{ route: string; args: unknown[] }>, route: '' }));
vi.mock('../../services/regulatory-precedent-intelligence', () => {
  const service = () => new Proxy({}, {
    get: (_t, fn) => async (...args: unknown[]) => {
      h.calls.push({ route: h.route, args });
      return String(fn).startsWith('search') || String(fn).startsWith('get') ? [] : { id: 'x' };
    },
  });
  return {
    crlTriggerService: service(), rtfTriggerService: service(), emaQuestionTaxonomyService: service(),
    advisoryCommitteeService: service(), confidenceCalibrationService: service(), crossJurisdictionalService: service(),
  };
});

import router from '../regulatory-precedent-intelligence';

function app(organizationId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = organizationId === null ? { id: 17 } : { id: 17, organizationId };
    next();
  });
  a.use('/api/regulatory-precedent-intelligence', router);
  return a;
}

const POSTS: string[] = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> })
  .stack.filter((l) => l.route?.methods.post).map((l) => l.route!.path.replace(/:\w+/g, '0b7e1d2a-1111-4222-8333-944455556666'));

/** Every organizationId any service received, from any argument. */
function orgsSeen(): unknown[] {
  return h.calls.flatMap((c) => c.args.flatMap((a) =>
    a && typeof a === 'object' && 'organizationId' in a ? [(a as { organizationId: unknown }).organizationId] : []));
}

describe('/api/regulatory-precedent-intelligence', () => {
  it('has the POST routes this test walks', () => {
    expect(POSTS.length).toBeGreaterThanOrEqual(25);
  });

  it('takes the organisation from the session on every POST route, never the body', async () => {
    h.calls.length = 0;
    for (const path of POSTS) {
      h.route = path;
      await request(app(5)).post(`/api/regulatory-precedent-intelligence${path}`).send({ organizationId: '999', title: 'T' });
    }
    const seen = orgsSeen();
    expect(seen.length).toBeGreaterThanOrEqual(25);
    expect(seen.filter((o) => String(o) !== '5')).toEqual([]);
  });

  it('refuses a request with no organisation instead of using a shared "default" one', async () => {
    h.calls.length = 0;
    const r = await request(app(null)).post('/api/regulatory-precedent-intelligence/crl/search').send({});
    expect(r.status).toBe(403);
    expect(h.calls).toEqual([]);
  });
});
