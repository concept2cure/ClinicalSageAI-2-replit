/**
 * Rewriting the platform's regulatory templates needs curator standing.
 *
 * THE DEFECT THIS PREVENTS. `POST /api/regulatory-intelligence/templates/seed`
 * was guarded by `requireAuthedOrgId` alone — any authenticated member of any
 * tenant. It calls `seedTemplates()`, which is unconditional and global: for
 * every one of the seeded templates it UPDATEs the template row, then
 * `DELETE FROM intelligence.template_sections WHERE template_id = $1` and
 * re-INSERTs every section from source. `intelligence.document_templates` has
 * no organization column and no RLS policy, so that store is platform
 * reference data every tenant reads.
 *
 * So a single member of one customer could rewrite the regulatory outlines
 * that every other customer's authored text binds to — the section CODES
 * included, which is what `filingSectionKey` joins on. Not a disclosure: a
 * cross-tenant INTEGRITY surface, and the one that is hardest to notice,
 * because the rewrite leaves each store internally consistent.
 *
 * WHY THE GATE IS ONLY SAFE TO ADD NOW. Until 2026-10-18 the boot seeder
 * short-circuited on a row count, so once the template rows existed a
 * corrected `section_code` in source was never applied by any deploy — and
 * this route was the ONLY way to apply one. Gating it before that would have
 * removed the sole path to a correction. `seedTemplatesIfMissing` now compares
 * the store against the seed set and re-seeds on drift
 * (`server/startup/services.ts` calls it at boot), so the deploy is the
 * reachable replacement for an operator's refresh, by path.
 *
 * WHICH STANDING. The same one this router already requires to validate an
 * agency requirement: platform curator (`super_admin` / `platform_admin` via
 * `holdsPlatformRole`). Both govern the same question — may this session write
 * platform reference data every tenant is served? — so there is one constant,
 * not two that drift. Deliberately NOT `requirePlatformAdmin`, which also
 * admits `support`: a support session should be able to read the platform, not
 * re-key every customer's regulatory outlines.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const h = vi.hoisted(() => ({ platform: vi.fn() }));

vi.mock('../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ holdsPlatformRole: h.platform }));

import router from '../regulatory-intelligence';

/** Every statement the seeder's transaction client was given. */
let sql: string[] = [];

function appAs(user: Record<string, unknown> | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) {
      (req as any).user = user;
      (req as any).userId = user.id;
    }
    next();
  });
  app.use('/api/regulatory-intelligence', router);
  return app;
}

/** An organization administrator of tenant 7: an ordinary customer, not platform staff. */
const TENANT_ADMIN = { id: 5, userId: 5, role: 'admin', organizationId: 7 };
/** Platform staff. Standing is decided by holdsPlatformRole, never by this role string. */
const CURATOR = { id: 2, userId: 2, role: 'member', organizationId: 1 };

/** Did anything actually rewrite the shared template store? */
const storeWritten = () =>
  sql.some((s) => /DELETE FROM intelligence\.template_sections/i.test(s))
  || sql.some((s) => /INSERT INTO intelligence\.template_sections/i.test(s));

beforeEach(() => {
  sql = [];
  h.platform.mockReset().mockResolvedValue(false);
  mockPool.query.mockReset().mockImplementation((text: string) => {
    sql.push(text);
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  // A client that lets seedTemplates() really run, so an ungated call returns
  // 200 with the store rewritten rather than crashing into a 500 — the red has
  // to be the defect, not a broken stub.
  mockPool.connect.mockReset().mockResolvedValue({
    query: (text: string) => {
      sql.push(text);
      return Promise.resolve(
        /FROM intelligence\.document_templates/i.test(text)
          ? { rows: [{ id: '00000000-0000-4000-8000-000000000001' }], rowCount: 1 }
          : { rows: [], rowCount: 0 },
      );
    },
    release: () => undefined,
  } as never);
});

describe('POST /templates/seed', () => {
  it('refuses a tenant administrator, and does not touch the shared template store', async () => {
    const res = await request(appAs(TENANT_ADMIN)).post('/api/regulatory-intelligence/templates/seed').send({});
    expect(res.status, 'an ordinary customer may not re-key every tenant\'s outlines').toBe(403);
    expect(storeWritten(), 'the refusal must happen BEFORE the DELETE+INSERT').toBe(false);
  });

  it('says what the caller should do instead, and leaks no internals', async () => {
    const res = await request(appAs(TENANT_ADMIN)).post('/api/regulatory-intelligence/templates/seed').send({});
    const message = String(res.body?.message ?? '');
    // The remedy has to be performable by the person reading it: they cannot
    // grant themselves curator standing, but a corrected seed now reaches a
    // deployed database through the deploy.
    expect(message, 'the refusal must name the standing it wants').toMatch(/curator/i);
    expect(message, 'and the path that does apply a corrected seed').toMatch(/deploy/i);
    expect(message, 'no SQL, table or column names in a client-facing refusal')
      .not.toMatch(/intelligence\.|DELETE|INSERT|template_sections/i);
  });

  it('admits a platform curator, and the seed runs', async () => {
    h.platform.mockResolvedValue(true);
    const res = await request(appAs(CURATOR)).post('/api/regulatory-intelligence/templates/seed').send({});
    expect(res.status).toBe(200);
    expect(storeWritten(), 'a curator\'s refresh must still do the work').toBe(true);
  });

  it('asks for platform standing only — never an organization role', async () => {
    h.platform.mockResolvedValue(true);
    await request(appAs(CURATOR)).post('/api/regulatory-intelligence/templates/seed').send({});
    expect(h.platform).toHaveBeenCalled();
    const roles = h.platform.mock.calls[0]?.[1] as readonly string[];
    expect([...roles].sort(), 'org roles (admin/manager/member) must never appear here')
      .toEqual(['platform_admin', 'super_admin']);
  });

  it('refuses a request with no tenant context before asking about platform standing', async () => {
    const res = await request(appAs(null)).post('/api/regulatory-intelligence/templates/seed').send({});
    expect(res.status).toBe(403);
    expect(String(res.body?.error ?? '')).toMatch(/Tenant context required/i);
    expect(storeWritten()).toBe(false);
  });

  it('does not look up platform standing for a session with no tenant context', async () => {
    /* A signed-in user whose membership was removed: authenticated, no
       organization. The anonymous case above does NOT prove this ordering —
       platformCuratorId returns before the role lookup when there is no user
       id at all, so probing it first is invisible there (mutant M8 survived on
       exactly that reading). This caller HAS an id, so the lookup would fire. */
    const res = await request(appAs({ id: 5, userId: 5, role: 'admin' }))
      .post('/api/regulatory-intelligence/templates/seed').send({});
    expect(res.status).toBe(403);
    expect(String(res.body?.error ?? '')).toMatch(/Tenant context required/i);
    expect(h.platform, 'the tenant gate comes first — no platform role read behind it')
      .not.toHaveBeenCalled();
    expect(storeWritten()).toBe(false);
  });
});
