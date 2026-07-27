/**
 * Pins the /api/admin/industry-profile contract.
 *
 * This endpoint decides which regulatory framework every project in an
 * organization is worked under — which study archetypes, filing types and
 * terminology the modules offer. So the tests are about who may change it, what
 * the record must carry when they do, and the refusal to invent a value nobody
 * declared. The role gate in particular is asserted directly: a non-admin
 * reaching this route would be able to re-point an entire organization's
 * regulatory workspace.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// The session the route sees. Mutated per test so one harness covers both the
// permitted and the refused caller.
const session = { id: 1, organizationId: 7, roles: ['admin'] as string[] };

vi.mock('../../middleware/auth', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../middleware/auth');
  return {
    ...actual,
    // requireRole is NOT stubbed — it is the thing under test. Only the
    // authentication step is faked, so the real role logic runs.
  };
});

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
vi.mock('../../db', () => ({
  pool: {
    query: (...a: unknown[]) => queryMock(...a),
    connect: async () => ({ query: (...a: unknown[]) => clientQueryMock(...a), release: releaseMock }),
  },
}));

vi.mock('../../middleware/tenantContext', () => ({
  getRequestDbClient: () => ({ query: (...a: unknown[]) => queryMock(...a) }),
}));

async function makeApp() {
  const router = (await import('../admin-industry-profile')).default;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: session.id, organizationId: session.organizationId, roles: session.roles };
    next();
  });
  app.use('/api/admin', router);
  return app;
}

const PROFILE_ROW = {
  primary_industry: 'medical_device_diagnostics',
  mdx_specialization: 'medical_device',
  default_markets: ['us'],
  default_pathways: ['us_510k'],
  default_approval_rigor: 'regulated_dual_review',
  effective_at: '2026-07-01T00:00:00.000Z',
  change_reason: 'Initial declaration',
  updated_by: 1,
  updated_at: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetModules();
  queryMock.mockReset();
  clientQueryMock.mockReset();
  releaseMock.mockReset();
  session.roles = ['admin'];
});

describe('GET /api/admin/industry-profile', () => {
  it('returns the governed profile when one exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [PROFILE_ROW] });
    const res = await request(await makeApp()).get('/api/admin/industry-profile');
    expect(res.status).toBe(200);
    expect(res.body.data.primaryIndustry).toBe('medical_device_diagnostics');
    expect(res.body.meta.configured).toBe(true);
  });

  it('reports "not configured" rather than synthesizing a default', async () => {
    // Returning a plausible-looking default here would be the whole bug: the
    // organization would appear to have declared something it never declared.
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(await makeApp()).get('/api/admin/industry-profile');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.configured).toBe(false);
  });

  it('degrades to "not configured" where the table is not provisioned', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await request(await makeApp()).get('/api/admin/industry-profile');
    expect(res.status).toBe(200);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('PATCH /api/admin/industry-profile — authorization', () => {
  it('refuses a non-administrator', async () => {
    // The gate that matters: without it, any authenticated user could re-point
    // the regulatory framework of every project in the organization.
    session.roles = ['viewer'];
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ primaryIndustry: 'biotech_pharma', changeReason: 'trying it on' });
    expect(res.status).toBe(403);
    // Refused before any write — and before the body is even parsed.
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('allows an organization administrator', async () => {
    session.roles = ['org_admin'];
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })                 // BEGIN
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })      // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })      // UPDATE
      .mockResolvedValueOnce({ rows: [] })                 // COMMIT
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ defaultMarkets: ['us', 'eu'] });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/admin/industry-profile — reason for change', () => {
  it('refuses a material change with no reason', async () => {
    // Material = the industry or the specialization: those change which
    // regulatory instruments every project is offered, so the record has to say
    // why. An inspector asking why the study menus changed needs an answer that
    // is not "someone clicked".
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ mdxSpecialization: 'ivd_diagnostics' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/reason is required/i);
    // Rolled back, nothing written.
    const stmts = clientQueryMock.mock.calls.map(c => String(c[0]));
    expect(stmts.some(s => s.includes('ROLLBACK'))).toBe(true);
    expect(stmts.some(s => s.includes('UPDATE organization_industry_profiles'))).toBe(false);
  });

  it('does NOT require a reason for a non-material change', async () => {
    // Gating every field behind a reason prompt trains people to type "update",
    // which is worse than not asking. Markets are configuration within a
    // framework, not a change of framework.
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ defaultMarkets: ['us', 'eu', 'jp'] });
    expect(res.status).toBe(200);
    expect(res.body.meta.materialChange).toBe(false);
  });

  it('accepts a material change carrying a reason, and records it', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })
      .mockResolvedValueOnce({ rows: [{ ...PROFILE_ROW, mdx_specialization: 'ivd_diagnostics' }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({
        mdxSpecialization: 'ivd_diagnostics',
        changeReason: 'The IVD line was acquired and its programs move onto this tenant',
      });
    expect(res.status).toBe(200);
    expect(res.body.meta.materialChange).toBe(true);
    const update = clientQueryMock.mock.calls
      .map(c => ({ sql: String(c[0]), args: c[1] as unknown[] }))
      .find(c => c.sql.includes('UPDATE organization_industry_profiles'))!;
    expect(update.args).toContain('ivd_diagnostics');
    expect(update.args.some(a => String(a).includes('IVD line was acquired'))).toBe(true);
  });

  it('requires primaryIndustry on a first declaration', async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })   // no existing profile
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ defaultMarkets: ['us'], changeReason: 'setting up the workspace' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/primaryIndustry is required/);
  });

  it('rejects a specialization outside the known vocabulary', async () => {
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ mdxSpecialization: 'something_invented', changeReason: 'a reason long enough' });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/admin/industry-profile — keeps industry_mode in step', () => {
  it('updates organizations.industry_mode in the same transaction', async () => {
    // client-type-profiles and getLicenseInfo both read industry_mode. Leaving it
    // stale would give two different answers to "what industry is this
    // organization" depending on which code path asked.
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [PROFILE_ROW] })
      .mockResolvedValueOnce({ rows: [{ ...PROFILE_ROW, primary_industry: 'biotech_pharma' }] })
      .mockResolvedValue({ rows: [] });
    const res = await request(await makeApp())
      .patch('/api/admin/industry-profile')
      .send({ primaryIndustry: 'biotech_pharma', changeReason: 'the device line was divested' });
    expect(res.status).toBe(200);

    const stmts = clientQueryMock.mock.calls.map(c => ({ sql: String(c[0]), args: c[1] as unknown[] }));
    const sync = stmts.find(s => s.sql.includes('UPDATE organizations SET industry_mode'))!;
    expect(sync).toBeTruthy();
    expect(sync.args).toContain('biotech');   // mapped from biotech_pharma
    expect(sync.args).toContain(7);           // scoped to the caller's org

    // Both writes land before COMMIT, so the two records cannot diverge.
    const idx = (needle: string) => stmts.findIndex(s => s.sql.includes(needle));
    expect(idx('UPDATE organizations SET industry_mode')).toBeLessThan(idx('COMMIT'));
  });
});
