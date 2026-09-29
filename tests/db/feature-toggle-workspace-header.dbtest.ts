/**
 * A feature toggle enabled for one organisation's workspace does not open for
 * a caller in another organisation who names that workspace in X-Client-ID.
 *
 * Security audit 2026-09-24, IAM-15 (plan P1-7, second half; evidence
 * docs/evidence/D6/2026-09-25-p1/P1-7b/). middleware/tenantContext.ts copies
 * the X-Client-ID header into req.tenantContext.clientWorkspaceId, and
 * featureToggleMiddleware handed that value to the toggle resolution, whose
 * per-workspace list is a WIDENING read: `enabledForClientWorkspaceIds
 * .includes(id)` opened the feature for whoever named a listed id. The
 * organisation is the session's; the workspace is a claim, and the middleware
 * now makes one ownership read (client_workspaces by id and organisation)
 * before the claim counts.
 *
 * Why this needs a database: feature_toggles has no tenant column and no RLS
 * policy, so row security never contained this — a unit test with a mocked
 * service proves the call pattern, only a real read of client_workspaces proves
 * the predicate. Runs under the suite's default RLS_ENFORCE=on; the answer does
 * not depend on it (the SQL carries the organisation predicate itself).
 *
 * No production router combines tenantContextMiddleware with requireFeature at
 * HEAD (requireFeature's one mount, regulatorySubmissions.ts, is behind the
 * global /api gate only, which never reads X-Client-ID), so the plan's
 * "per route" acceptance is met on a composed app: the real auth boundary, the
 * real tenant-context middleware, the real feature gate, in the order a router
 * that used all three would mount them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { tenantContextMiddleware } from '../../server/middleware/tenantContext';
import { requireFeature } from '../../server/middleware/featureToggleMiddleware';
import {
  TAG,
  auth,
  owner,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
  tokenA,
  tokenB,
  workspaceA,
  workspaceB,
} from './two-tenant-fixture';

const KEY = `wo03.p17b.${TAG}`;
let app: express.Express;

async function enabledForWorkspaces(workspaces: number[]) {
  await owner.query(
    `UPDATE feature_toggles SET enabled_for_client_workspace_ids = $2::json WHERE feature_key = $1`,
    [KEY, JSON.stringify(workspaces)]
  );
}

beforeAll(async () => {
  // Default-deny at the boundary: an unauthenticated request must not reach
  // the gate at all, whatever the container's mode would otherwise be.
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
  await provisionTwoTenantFixture();
  // Off everywhere, on for B's workspace alone.
  await owner.query(
    `INSERT INTO feature_toggles
       (feature_key, description, enabled, enabled_for_organization_ids, enabled_for_client_workspace_ids)
     VALUES ($1, 'P1-7b workspace-header probe', FALSE, '[]'::json, $2::json)`,
    [KEY, JSON.stringify([workspaceB])]
  );

  app = express();
  app.use('/api', createAuthBoundary());
  app.get('/api/gated', tenantContextMiddleware, requireFeature(KEY), (_req, res) =>
    res.json({ reached: true })
  );
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM feature_toggles WHERE feature_key = $1', [KEY]).catch(() => {});
  }
  await teardownTwoTenantFixture();
});

const gated = (token: string, headers: Record<string, string> = {}) =>
  request(app)
    .get('/api/gated')
    .set({ ...auth(token), ...headers });

describe('requireFeature and the X-Client-ID workspace, on a real database (IAM-15, P1-7b)', () => {
  it('positive control: B, naming its own workspace, reaches the feature enabled for it', async () => {
    const res = await gated(tokenB, { 'X-Client-ID': String(workspaceB) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reached: true });
  });

  it("A, naming B's workspace, is answered 404: the toggle is B's and the header is a claim", async () => {
    // Before the change: 200. Nothing compared the workspace with the session's
    // organisation, and the toggle list is read from a table with no tenant.
    const res = await gated(tokenA, { 'X-Client-ID': String(workspaceB) });
    expect(res.status).toBe(404);
  });

  it("A, naming its own workspace, is answered 404 while the toggle is B's alone", async () => {
    const res = await gated(tokenA, { 'X-Client-ID': String(workspaceA) });
    expect(res.status).toBe(404);
  });

  it("…and 200 once the toggle names A's workspace: the header counts when the workspace is the organisation's own", async () => {
    await enabledForWorkspaces([workspaceA, workspaceB]);
    expect((await gated(tokenA, { 'X-Client-ID': String(workspaceA) })).status).toBe(200);
    // B naming A's workspace still does not get in.
    expect((await gated(tokenB, { 'X-Client-ID': String(workspaceA) })).status).toBe(404);
  });

  it('with no header, the feature resolves at organisation level', async () => {
    await enabledForWorkspaces([workspaceB]);
    expect((await gated(tokenA)).status).toBe(404);
    expect((await gated(tokenB)).status).toBe(404);
  });

  it('a non-numeric header is not a workspace', async () => {
    expect((await gated(tokenB, { 'X-Client-ID': 'abc' })).status).toBe(404);
  });

  it('no token, no gate: the boundary answers first', async () => {
    const res = await request(app).get('/api/gated').set({ 'X-Client-ID': String(workspaceB) });
    expect(res.status).toBe(401);
  });
});
