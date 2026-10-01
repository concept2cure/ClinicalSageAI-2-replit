/**
 * The cortex query route takes its tenant from the session, never the request
 * (D3, 2026-09-24; evidence docs/evidence/D3/2026-09-24-cortex-tenant-header/).
 *
 * The vault re-baseline listed it unclaimed: "The cortex vault Q&A route takes
 * its tenant key from the client's `x-org-uuid` header". It is worse than a
 * fallback. `server/routes/cortexQueryRoutes.ts` reads
 * `req.tenantContext?.organizationUuid || req.headers['x-org-uuid']`, but it is
 * mounted under `cortex-unified.ts`, whose own `extractTenantContext` REPLACES
 * `req.tenantContext` with `{ organizationId, clientWorkspaceId, module }` and
 * never sets `organizationUuid`. So on the mounted route the header was the
 * ONLY tenant key the handler ever used, and a request without it ran the
 * search's unfiltered branch.
 *
 * Under enforcing RLS the database contains that: `lumen_data_atoms` is FORCEd
 * with the tenant policy keyed on the SESSION's GUC, `search_atoms_hybrid` is
 * not SECURITY DEFINER, and /api/cortex is not a system-scoped path. So, as in
 * the Report OS suite, what tells a fixed handler from a broken one in that
 * posture is a POSITIVE control: tenant A naming tenant B in the header gets
 * nothing under the old handler (B's key AND A's policy) and A's own atom under
 * a handler that ignores the header. The negative assertions (nothing of B's)
 * are what hold if RLS is ever off, which the evidence's mutation runs show.
 *
 * WHY GRAPH MODE CARRIES THE END-TO-END CASES. On a database provisioned from
 * empty, search mode cannot return a row for anyone: `search_atoms_hybrid`
 * declares `structured_data jsonb` while `lumen_data_atoms.structured_data` is
 * `json`, so every call fails "structure of query does not match function
 * result type". That is a separate defect (it also leaves Authoring's AI draft
 * and AnA chat without retrieved evidence) and is recorded in the evidence, not
 * fixed here. So search mode is pinned at the one thing this contract is about
 * — which tenant key the handler asks `searchHybrid` for — and graph mode, whose
 * `searchSimilar` works, carries the positive and negative controls.
 *
 * Mounted as production mounts it: the global `/api` auth boundary
 * (createAuthBoundary, which establishes the request's tenant scope), then
 * cortex-unified at /api/cortex, which mounts this router at /query. The query
 * embedding is stubbed — a model call is irrelevant to tenancy and unavailable
 * offline — and nothing else is.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { EnhancedEmbeddingService } from '../../server/services/enhancedEmbeddingService';
import cortexUnified from '../../server/routes/cortex-unified';
import { initializeCortexAPI } from '../../server/routes/cortexQueryRoutes';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  tokenA,
  userA,
  accessToken,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

/** One vector for every atom and every query: the semantic score is 1.0 for
 *  both tenants, so only the tenant filter can separate them. */
const VEC = Array.from({ length: 1536 }, () => 0.001);
const PROBE = 'wo03cortexprobe';
const SECRET = { A: `${TAG}-cortex-secret-A`, B: `${TAG}-cortex-secret-B` };

let app: express.Express;
const uuidOf: Record<'A' | 'B', string> = { A: '', B: '' };

/** Wait until cortex-unified's async mountSubRouters has put /query on the router. */
async function queryRouteMounted(): Promise<void> {
  // Express 5 router layers carry `match()`, not the v4 `regexp`.
  const stack = (cortexUnified as unknown as { stack: Array<{ match?: (p: string) => boolean }> })
    .stack;
  for (let i = 0; i < 200; i++) {
    if (stack.some(l => l.match?.('/query'))) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('cortex-unified never mounted /query');
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  vi.spyOn(EnhancedEmbeddingService.prototype, 'embed').mockImplementation(async text => ({
    text,
    embedding: VEC,
    model: 'text-embedding-3-small',
    tokenCount: 1,
    cached: false,
  }));

  const orgs = await owner.query(
    'SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS]
  );
  for (const row of orgs.rows) uuidOf[row.id === ORG_A ? 'A' : 'B'] = row.uuid;
  expect(uuidOf.A && uuidOf.B, 'both fixture orgs need a uuid').toBeTruthy();

  for (const [side, org] of [
    ['A', ORG_A],
    ['B', ORG_B],
  ] as const) {
    await owner.query(
      `INSERT INTO lumen_data_atoms
         (organization_id,source_type,source_id,atom_type,title,content,embedding,status)
       VALUES ($1,'wo03','wo03-${side}','fact',$2,$3,$4::vector,'active')`,
      [org, `${PROBE} ${SECRET[side]}`, `${PROBE} ${SECRET[side]}`, `[${VEC.join(',')}]`]
    );
  }

  // As server/startup/routes.ts → register-document-routes.ts does.
  initializeCortexAPI(getPool());
  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/cortex', cortexUnified);
  await queryRouteMounted();
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM lumen_data_atoms WHERE organization_id = ANY($1::int[])', [
      FIXTURE_ORGS,
    ]);
  }
  await teardownTwoTenantFixture();
});

/** The mounted path: /api/cortex (cortex-unified) + /query (mount) + /query (route). */
const QUERY = '/api/cortex/query/query';

function search(token: string, headers: Record<string, string> = {}, mode = 'search') {
  return request(app)
    .post(QUERY)
    .set({ ...auth(token), ...headers })
    .send({ query: PROBE, mode, options: { limit: 10 } });
}

/** Every string of `body`, so a secret is found wherever the response puts it. */
const text = (body: unknown) => JSON.stringify(body);

describe('the cortex query route takes the tenant from the session, never x-org-uuid (D3)', () => {
  it("positive control: tenant A querying as itself finds its own atom and not B's", async () => {
    const res = await search(tokenA, { 'x-org-uuid': uuidOf.A }, 'graph');
    expect(res.status).toBe(200);
    expect(text(res.body)).not.toContain(SECRET.B);
    expect(text(res.body), 'the graph search must actually find the seeded atom').toContain(
      SECRET.A
    );
  });

  it("tenant A naming tenant B in the header is served nothing of B's", async () => {
    const res = await search(tokenA, { 'x-org-uuid': uuidOf.B }, 'graph');
    expect(text(res.body), "tenant B's atom must never reach tenant A").not.toContain(SECRET.B);
  });

  it('…and is served its OWN atom: the header is ignored, not merely contained by RLS', async () => {
    // The assertion that separates the handlers with RLS enforcing. The old one
    // searched under B's key and A's policy, and found nothing at all.
    const res = await search(tokenA, { 'x-org-uuid': uuidOf.B }, 'graph');
    expect(res.status).toBe(200);
    expect(text(res.body)).toContain(SECRET.A);
  });

  it('with no header, the query is scoped to the session rather than to nothing', async () => {
    // The old graph handler answered an empty graph with success:true here;
    // the old search handler ran its unfiltered branch.
    const res = await search(tokenA, {}, 'graph');
    expect(res.status).toBe(200);
    expect(text(res.body)).not.toContain(SECRET.B);
    expect(text(res.body)).toContain(SECRET.A);
  });

  it("search mode asks for the session's tenant, whatever the header says", async () => {
    const asked: Array<string | undefined> = [];
    const spy = vi
      .spyOn(EnhancedEmbeddingService.prototype, 'searchHybrid')
      .mockImplementation(async (_q, { organizationUuid }) => {
        asked.push(organizationUuid);
        return [];
      });
    try {
      await search(tokenA, { 'x-org-uuid': uuidOf.B }, 'search');
      await search(tokenA, {}, 'search');
    } finally {
      spy.mockRestore();
    }
    expect(asked).toEqual([uuidOf.A, uuidOf.A]);
  });

  it('a session with no usable organization is refused, never served', async () => {
    // organizationId 0 is a resolution failure wearing a valid-looking value
    // (server/utils/authedOrgId.ts usableOrgId). Under RLS_ENFORCE=on it used
    // to reach the pool with no tenant scope and fail closed as a 500.
    const orgless = accessToken(userA, 0);
    const res = await search(orgless, { 'x-org-uuid': uuidOf.B }, 'graph');
    expect(text(res.body)).not.toContain(SECRET.B);
    expect(text(res.body)).not.toContain(SECRET.A);
    expect(res.status).toBe(403);
  });
});
