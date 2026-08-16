/**
 * Manufacturing reads and writes refuse rather than crossing the tenant boundary.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `getOrgId` returns null when the request carries no UUID tenant scope, and
 * warns that the consequence is "org-scoped queries return empty rather than
 * cross-tenant data". That was true of `/overview` and false everywhere else.
 * Ten sites wrote the predicate as
 *
 *     if (orgId) { where += ` AND org_id = $n`; params.push(orgId); }
 *
 * so a null scope did not narrow the query to nothing — it REMOVED the boundary
 * and returned every tenant's rows. An optional predicate is a default, and the
 * default was "all tenants". Behind it: GMP batch execution records with yields
 * and deviations, equipment qualification state, quality test dispositions, and
 * drafted responses to regulatory deficiency findings.
 *
 * Three INSERTs had the mirror image — `orgId || null` wrote rows with a NULL
 * `org_id`, and the RLS policy on these tables carries an `OR org_id IS NULL`
 * arm, so an unscoped write was permanently readable by every tenant.
 *
 * ── Why these assert the SQL, not just the status ────────────────────────────
 * A 200 with the right rows proves nothing here: with no scope the old code
 * returned a 200 too, just with everyone's rows in it. What distinguishes the
 * fixed code is that the emitted statement CARRIES the predicate. So these
 * inspect the SQL the handler actually sends.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import createManufacturingRoutes from '../manufacturing-routes';

const ORG = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
const pool = { query, connect: vi.fn() } as never;

/** `user` shapes what `getOrgId` can resolve — a UUID org, or nothing usable. */
function app(user?: Record<string, unknown>) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/api/manufacturing', createManufacturingRoutes(pool));
  return a;
}

/** Every statement the handler sent, excluding the runtime CREATE TABLEs. */
function statements(): string[] {
  return query.mock.calls
    .map((c) => String((c as unknown[])[0]))
    .filter((sql) => !/CREATE\s+(TABLE|SCHEMA|INDEX)/i.test(sql));
}

beforeEach(() => query.mockClear());

/* The record-returning routes. `/overview` is deliberately excluded — it
   degrades to empty KPIs by design, which is legible for a dashboard and is
   not for a record list. */
const READS: Array<[string, string]> = [
  ['equipment', '/api/manufacturing/equipment'],
  ['batches', '/api/manufacturing/batches'],
  ['responses', '/api/manufacturing/responses'],
  ['batch-release', '/api/manufacturing/batch-release/B1'],
];

describe('a request with no tenant scope is refused, not answered with everyone’s rows', () => {
  for (const [name, url] of READS) {
    it(`${name} refuses`, async () => {
      const res = await request(app({ organizationId: 7 })).get(url); // integer, not a UUID
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('MFG_NO_TENANT_SCOPE');
      // The decisive assertion: no read reached the database at all.
      expect(statements()).toHaveLength(0);
    });
  }

  it('refuses when there is no user on the request whatsoever', async () => {
    const res = await request(app()).get('/api/manufacturing/batches');
    expect(res.status).toBe(403);
    expect(statements()).toHaveLength(0);
  });
});

describe('a scoped request carries the predicate into the SQL', () => {
  for (const [name, url] of READS) {
    it(`${name} filters on org_id`, async () => {
      const res = await request(app({ organizationUuid: ORG })).get(url);
      expect(res.status).not.toBe(403);
      const sent = statements();
      expect(sent.length).toBeGreaterThan(0);
      // Every statement this handler issues must be bounded by the org.
      for (const sql of sent) expect(sql).toMatch(/org_id\s*=\s*\$\d/);
      // And the org actually bound is the caller's own.
      const boundOrgs = query.mock.calls
        .flatMap((c) => ((c as unknown[])[1] as unknown[]) ?? [])
        .filter((p) => typeof p === 'string' && p === ORG);
      expect(boundOrgs.length).toBeGreaterThan(0);
    });
  }
});

describe('writes never land a row with a NULL org_id', () => {
  it('refuses an unscoped equipment create rather than writing it world-readable', async () => {
    const res = await request(app({ organizationId: 7 }))
      .post('/api/manufacturing/equipment')
      .send({ equipmentId: 'EQ-1', name: 'Bioreactor', equipmentType: 'REACTOR' });
    expect(res.status).toBe(403);
    // `orgId || null` used to write NULL here, and the RLS policy's
    // `OR org_id IS NULL` arm would then expose that row to every tenant —
    // permanently, since nothing backfills it.
    expect(statements().filter((s) => /INSERT/i.test(s))).toHaveLength(0);
  });

  it('refuses an unscoped deficiency response rather than writing it world-readable', async () => {
    const res = await request(app({ organizationId: 7 }))
      .post('/api/manufacturing/response')
      .send({ findingId: 'F-1', text: 'Response text' });
    expect(res.status).toBe(403);
    expect(statements().filter((s) => /INSERT/i.test(s))).toHaveLength(0);
  });
});

describe('/overview keeps its deliberate degrade-to-empty', () => {
  it('answers 200 with no numbers rather than refusing', async () => {
    const res = await request(app({ organizationId: 7 })).get('/api/manufacturing/overview');
    // A dashboard with no numbers is legible; an empty record list is not, and
    // would be read as "your organization has none". Different call, on purpose.
    expect(res.status).toBe(200);
    expect(statements()).toHaveLength(0);
  });
});
