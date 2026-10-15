/**
 * A viewer reads the IRB, IACUC, IBC, RIM and BLA workbench records and writes
 * none of them (21 CFR 11.10(d)(g); P0-10b fix-round residual, 2026-10-01).
 *
 * The P0-10b fix round closed the approval doors of these routers: the signed
 * review is the only way to "approved", and the signing-authority check
 * refuses a viewer there. The other writes had no role gate at all: a viewer
 * who could open the record could create a submission, move a status, add a
 * site, an agent or a label, or persist a BLA assessment. The ProtocolDev
 * routers had the same gap and closed it with one router-level gate,
 * requireEditorAccessForWrites (periodic review 2026-09-28, P11-C-1); these
 * five use the same gate.
 *
 * The BLA workbench's four computations are POSTs that only save when asked
 * (persist, or a programId). A computation that saves nothing is a read, and
 * a viewer may still run it.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const client = vi.hoisted(() => ({
  query: async () => ({ rows: [] as unknown[], rowCount: 0 }),
  release: () => undefined,
}));
vi.mock('../../db', () => ({
  pool: { connect: async () => client, query: async () => ({ rows: [], rowCount: 0 }) },
  db: {},
}));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => client }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));

import irbRouter from '../irb';
import iacucRouter from '../iacuc';
import ibcRouter from '../ibc';
import rimRouter from '../rim';
import blaRouter from '../biopharma/bla-workbench';

function appAs(role: string, mount: string, router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = { id: 42, organizationId: 7, role };
    r.userId = 42;
    r.tenantId = 7;
    next();
  });
  app.use(mount, router);
  return app;
}

type Door = { name: string; mount: string; router: express.Router; method: 'post' | 'patch' | 'put'; path: string; body: object };

const WRITES: Door[] = [
  { name: 'IRB create submission', mount: '/api/irb', router: irbRouter, method: 'post', path: '/api/irb/submissions', body: { title: 'x' } },
  { name: 'IRB status', mount: '/api/irb', router: irbRouter, method: 'patch', path: '/api/irb/submissions/5/status', body: { status: 'suspended' } },
  { name: 'IRB add site', mount: '/api/irb', router: irbRouter, method: 'post', path: '/api/irb/submissions/5/sites', body: { name: 'x' } },
  { name: 'IACUC create protocol', mount: '/api/iacuc', router: iacucRouter, method: 'post', path: '/api/iacuc/protocols', body: { title: 'x' } },
  { name: 'IACUC status', mount: '/api/iacuc', router: iacucRouter, method: 'patch', path: '/api/iacuc/protocols/5/status', body: { status: 'suspended' } },
  { name: 'IBC create registration', mount: '/api/ibc', router: ibcRouter, method: 'post', path: '/api/ibc/registrations', body: { title: 'x' } },
  { name: 'IBC add agent', mount: '/api/ibc', router: ibcRouter, method: 'post', path: '/api/ibc/registrations/5/agents', body: { name: 'x' } },
  { name: 'RIM create product', mount: '/api/rim', router: rimRouter, method: 'post', path: '/api/rim/products', body: { name: 'x' } },
  { name: 'RIM registrations', mount: '/api/rim', router: rimRouter, method: 'put', path: '/api/rim/products/5/registrations', body: {} },
  {
    name: 'BLA assessment that saves', mount: '/api/biopharma/bla', router: blaRouter, method: 'post',
    path: '/api/biopharma/bla/analytical-similarity', body: { attributes: [{ name: 'a' }], persist: true },
  },
];

describe('a viewer writes none of the research-compliance records', () => {
  for (const door of WRITES) {
    it(`${door.name}: viewer → 403, before the handler`, async () => {
      const res = await request(appAs('viewer', door.mount, door.router))[door.method](door.path).send(door.body);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Insufficient permissions' });
    });
  }

  it('a member passes the gate (the handler answers, not the gate)', async () => {
    const res = await request(appAs('member', '/api/irb', irbRouter)).patch('/api/irb/submissions/5/status').send({ status: 'suspended' });
    expect(res.body).not.toEqual({ error: 'Insufficient permissions' });
  });
});

describe('a viewer still reads, and still runs a computation that saves nothing', () => {
  it('GET /api/irb/submissions passes the gate', async () => {
    const res = await request(appAs('viewer', '/api/irb', irbRouter)).get('/api/irb/submissions');
    expect(res.status).not.toBe(403);
  });

  it('GET /api/rim/products passes the gate', async () => {
    const res = await request(appAs('viewer', '/api/rim', rimRouter)).get('/api/rim/products');
    expect(res.status).not.toBe(403);
  });

  it('a BLA computation with nothing to save passes the gate', async () => {
    const res = await request(appAs('viewer', '/api/biopharma/bla', blaRouter))
      .post('/api/biopharma/bla/analytical-similarity')
      .send({ attributes: [{ name: 'a' }] });
    expect(res.status).not.toBe(403);
  });
});
