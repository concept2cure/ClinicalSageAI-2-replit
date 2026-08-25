/**
 * Part 11 reads are tenant-scoped, and the scope is not optional.
 *
 * ── Why these did not exist before ───────────────────────────────────────────
 * Every route in `part11-compliance.ts` resolved its connection as
 * `(req as any).pool || (req.app as any).pool`, and nothing in the repository
 * assigns either — only this directory's own tests did. So in production all
 * five routes threw `TypeError: Cannot read properties of undefined` and
 * answered 500, while the tests injected `req.pool` and exercised a path
 * production could not reach. The routes were safe by accident, and the tests
 * were green for the wrong reason.
 *
 * That mattered because `GET /signatures/:documentId` filtered on
 * `document_id` ALONE and `documents.id` is a serial: the moment anyone
 * "fixed the 500" by handing it a working client, it would have become a
 * cross-tenant read of §11.50 signature rows — signer name, title, email,
 * meaning, hash, IP — by id enumeration.
 *
 * These assert the predicate is present, mandatory, and actually parameterised
 * with the caller's own org, so the repair cannot be made without it.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import part11Router from '../part11-compliance';

/**
 * `req.dbClient` is what `establishRequestTenantScope` really attaches — the
 * connection already pinned to this request with `app.current_tenant_id` set,
 * which is why the RLS policies apply to it. Injecting `req.pool`, as the
 * older tests did, tests a property nothing sets.
 */
function app(query: ReturnType<typeof vi.fn>, user?: unknown) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { dbClient: unknown }).dbClient = { query };
    if (user !== undefined) (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/', part11Router);
  return a;
}

const rows = (r: unknown[]) =>
  vi.fn(async (..._a: unknown[]) => ({ rows: r, rowCount: r.length })) as unknown as
    ReturnType<typeof vi.fn> & { mock: { calls: Array<[string, unknown[]]> } };

describe('GET /signatures/:documentId — scoped to the caller’s organization', () => {
  it('filters on organization_id, bound to the org on the request', async () => {
    const query = rows([]);
    const res = await request(app(query, { organizationId: 7 })).get('/signatures/42');
    expect(res.status).toBe(200);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE document_id = \$1 AND organization_id = \$2/);
    // The org must come from the request, never from the path or the query.
    expect(params).toEqual(['42', 7]);
  });

  it('refuses when the request carries no organization, rather than reading unscoped', async () => {
    const query = rows([]);
    // A conditional predicate is not a predicate — it is a default. This is the
    // shape the manifest route had, where a token with no numeric org silently
    // produced an unscoped read-by-id.
    const res = await request(app(query, {})).get('/signatures/42');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('cannot be steered to another tenant by the path parameter', async () => {
    const query = rows([]);
    await request(app(query, { organizationId: 7 })).get('/signatures/999999');
    const [, params] = query.mock.calls[0];
    // Whatever document id is probed, the org stays the caller's own.
    expect(params[1]).toBe(7);
  });
});

describe('GET /signatures/:signatureId/manifest — the scope is mandatory now', () => {
  it('refuses without an organization instead of reading by id alone', async () => {
    const query = rows([]);
    const res = await request(app(query, {})).get('/signatures/12/manifest');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not serve unattributed rows to every tenant', async () => {
    const query = rows([]);
    await request(app(query, { organizationId: 7 })).get('/signatures/12/manifest');
    const [sql] = query.mock.calls[0];
    // `OR es.organization_id IS NULL` let any tenant read any row that had no
    // org on it — looser than the RLS policy behind it, which excludes NULL.
    expect(sql).not.toMatch(/IS NULL/);
    expect(sql).toMatch(/es\.organization_id = \$2/);
  });
});

describe('GET /audit-trail/chain-integrity — already scoped, now connected', () => {
  it('binds the chain read to the caller’s org', async () => {
    const query = rows([]);
    const res = await request(app(query, { organizationId: 7 })).get('/audit-trail/chain-integrity');
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE organization_id = \$1/);
    expect(params).toEqual([7]);
  });

  it('refuses without a tenant', async () => {
    const query = rows([]);
    const res = await request(app(query, {})).get('/audit-trail/chain-integrity');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /audit-trail/seal-integrity — org admin is not a platform admin', () => {
  it('refuses an org-scoped admin, which self-service signup mints for free', async () => {
    const query = rows([]);
    // `admin` is the role the first user of every new organization receives.
    // This route reads the estate-wide audit_logs chain deliberately unscoped.
    const res = await request(app(query, { role: 'admin', organizationId: 7 }))
      .get('/audit-trail/seal-integrity');
    expect(res.status).toBe(403);
  });

  it('still admits a genuine platform role', async () => {
    const query = rows([]);
    const res = await request(app(query, { roles: ['super_admin'] }))
      .get('/audit-trail/seal-integrity');
    // Not asserting 200: the route is deliberately still unconnected, because
    // a request-scoped client would make it report a false "chain broken" under
    // RLS. What is asserted is that the GUARD no longer refuses the right
    // caller for the wrong reason.
    expect(res.status).not.toBe(403);
  });
});
