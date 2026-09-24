/**
 * WO-03: application-to-Postgres two-tenant isolation proof.
 *
 * This deliberately uses the production JWT/membership/scope middleware and
 * requestPgClient.  The only test-owned code is the tiny representative API
 * surface below; tenant identity and database session security are production
 * implementations.  The CI job supplies APP_DATABASE_URL for the real
 * app_service role provisioned by install-fresh.
 *
 * The two tenants come from ./two-tenant-fixture.ts, which other tenant
 * contracts share (report-os-tenant-from-session.dbtest.ts). A new contract
 * gets its own file on that fixture rather than another describe here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateToken } from '../../server/middleware/auth';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import industryContextRouter from '../../server/routes/mdx-industry-context';
import savedPrecedentQueriesRouter from '../../server/routes/saved-precedent-queries';
import controlPlaneRouter from '../../server/src/routes/control-plane.router';
import { evaluateGovernedDocument } from '../../server/src/control-plane/governed-document-evaluator';
import { GOVERNED_FABRIC_KIND } from '../../server/services/governed-decision-repository';
import { domains, tableFor, mountTenantProofRoutes } from './tenant-proof-routes';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  tokenB,
  userA,
  userB,
  signerA,
  workspaceB,
  ids,
  programA,
  programB,
  savedQueryA,
  savedQueryB,
  auth,
  accessToken,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;

// The setup intentionally keeps provisioning and the representative request
// surface in one lifecycle hook so partial setup cannot escape cleanup.
beforeAll(async () => {
  await provisionTwoTenantFixture();

  app = express();
  app.use(express.json());
  // Real product routers: these are the normal project-context and governed
  // regulatory-query service entry points, not test-owned replicas.
  app.use('/actual/mdx', authenticateToken, industryContextRouter);
  app.use('/actual/saved-precedent-queries', authenticateToken, savedPrecedentQueriesRouter);
  mountTenantProofRoutes(app, {
    tag: TAG,
    foreignWorkspace: workspaceB,
    actingUser: userA,
    permanentSigner: signerA,
  });
}, 60_000);

afterAll(teardownTwoTenantFixture);


// One describe keeps the posture, product-entry, attack, reset, and negative
// controls visibly part of the same proof contract.
// eslint-disable-next-line max-lines-per-function
describe('WO-03 two-tenant application isolation', () => {
  it('catalog and live session prove RLS is active for the runtime role', async () => {
    for (const domain of domains) {
      const { rows } = await owner.query(
        `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
                count(p.policyname)::int AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         LEFT JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
         WHERE n.nspname='public' AND c.relname=$1 GROUP BY c.relrowsecurity,c.relforcerowsecurity`,
        /* The RELATION name, not the domain label. These coincided while every
           domain was named after its table; `design_controls` →
           c2c_design_controls and `signatures` → electronic_signatures broke
           that, and the symptom was `expected undefined to match object` —
           a posture assertion that had silently stopped finding its table
           would otherwise read as a posture failure. */
        [tableFor[domain].replace(/^public\./, '')]
      );
      expect(
        rows[0],
        `${domain}: no pg_class row for ${tableFor[domain]} — the posture assertion found nothing to check`
      ).toBeDefined();
      expect(rows[0]).toMatchObject({ enabled: true, forced: true });
      expect(rows[0].policies).toBeGreaterThan(0);
    }
  });

  it('normal project-context endpoint cannot resolve Tenant B profile as Tenant A', async () => {
    const own = await request(app)
      .get(`/actual/mdx/projects/${programA}/industry-profile`)
      .set(auth(tokenA))
      .expect(200);
    expect(own.body.data).toMatchObject({ programId: programA, productType: `${TAG}-profile-A` });

    const foreign = await request(app)
      .get(`/actual/mdx/projects/${programB}/industry-profile`)
      .set(auth(tokenA))
      .expect(200);
    expect(foreign.body).toEqual({ data: null });
    expect(JSON.stringify(foreign.body)).not.toContain(`${TAG}-profile-B`);
  });

  it('normal regulatory-content CRUD endpoints hide and protect Tenant B rows', async () => {
    const list = await request(app)
      .get('/actual/saved-precedent-queries')
      .set(auth(tokenA))
      .expect(200);
    expect(list.body.data.map((row: { id: number }) => row.id)).toContain(savedQueryA);
    expect(list.body.data.map((row: { id: number }) => row.id)).not.toContain(savedQueryB);

    await request(app)
      .patch(`/actual/saved-precedent-queries/${savedQueryB}`)
      .set(auth(tokenA))
      .send({ label: `${TAG}-tampered` })
      .expect(404);
    await request(app)
      .delete(`/actual/saved-precedent-queries/${savedQueryB}`)
      .set(auth(tokenA))
      .expect(404);

    const tenantB = await request(app)
      .get('/actual/saved-precedent-queries')
      .set(auth(tokenB))
      .expect(200);
    const bRow = tenantB.body.data.find((row: { id: number }) => row.id === savedQueryB);
    expect(bRow).toMatchObject({ label: `${TAG}-saved-B`, query: `${TAG}-query-B` });
  });

  for (const domain of domains) {
    it(`${domain}: list/filter, direct read and existence probe hide tenant B from A`, async () => {
      const list = await request(app).get(`/proof/${domain}`).set(auth(tokenA)).expect(200);
      expect(list.body.ids).toContain(ids.A[domain]);
      expect(list.body.ids).not.toContain(ids.B[domain]);
      const filter = await request(app)
        .get(`/proof/${domain}?q=${ids.B[domain]}`)
        .set(auth(tokenA))
        .expect(200);
      expect(filter.body).toEqual({ ids: [] });
      await request(app).get(`/proof/${domain}/${ids.B[domain]}`).set(auth(tokenA)).expect(404);
      await request(app).head(`/proof/${domain}/${ids.B[domain]}`).set(auth(tokenA)).expect(404);
    });

    it(`${domain}: update and delete of tenant B are indistinguishable not-found`, async () => {
      await request(app)
        .patch(`/proof/${domain}/${ids.B[domain]}`)
        .set(auth(tokenA))
        .send({})
        .expect(404);
      await request(app).delete(`/proof/${domain}/${ids.B[domain]}`).set(auth(tokenA)).expect(404);
      const stillVisible = await request(app)
        .get(`/proof/${domain}/${ids.B[domain]}`)
        .set(auth(tokenB))
        .expect(200);
      expect(stillVisible.body).toEqual({ id: ids.B[domain] });
    });

    it(`${domain}: WITH CHECK rejects planting a row into tenant B without leaking details`, async () => {
      const response = await request(app)
        .post(`/proof/${domain}`)
        .set(auth(tokenA))
        .send({ organizationId: ORG_B })
        .expect(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND' } });
      expect(JSON.stringify(response.body)).not.toMatch(/row-level|policy|fixture-body/i);
    });
  }

  it('pooled session context is reset and the wrong-context negative control is observable', async () => {
    await request(app).get('/proof/projects').set(auth(tokenA)).expect(200);
    const wrongContext = await request(app).get('/proof/projects').set(auth(tokenB)).expect(200);
    expect(wrongContext.body.ids).toContain(ids.B.projects);
    expect(wrongContext.body.ids).not.toContain(ids.A.projects);
    const client = await runWithTenantScope(
      { tenantId: '0', role: null, source: 'test', caller: 'wo03-pool-reset-probe' },
      () => getPool().connect()
    );
    try {
      const { rows } = await client.query(
        `SELECT current_setting('app.current_tenant_id',true) AS tenant,
                current_setting('app.current_user_role',true) AS role,
                (SELECT count(*)::int FROM projects WHERE name LIKE $1) AS visible`,
        [`${TAG}%`]
      );
      expect(rows[0]).toEqual({ tenant: '', role: '', visible: 0 });
    } finally {
      client.release();
    }

    // Controlled negative control: the owner (RLS bypass) sees both fixture
    // rows. If the application query lost scoping it would return this count,
    // making the positive assertions above fail without an insecure mutation.
    const bypass = await owner.query('SELECT count(*)::int AS n FROM projects WHERE name LIKE $1', [
      `${TAG}%`,
    ]);
    expect(bypass.rows[0].n).toBe(2);
  });
});

// ── Governed decisions: the fixtures the cases below share ─────────────────

const GD_PROJECT = 903010;

const scope = (org: number, caller: string) => ({
  tenantId: String(org),
  role: 'member',
  source: 'test' as const,
  caller,
});

const evaluation = (org: number, artifactId: string) => ({
  context: {
    organizationId: String(org),
    projectId: String(GD_PROJECT),
    actorId: `${TAG}-actor`,
    intendedAction: 'promote' as const,
    artifactId,
  },
  documentState: {
    hasContent: true,
    hasEvidence: false,
    hasBeenReviewed: false,
    hasApproval: false,
    hasPlacement: false,
    placementValid: false,
    hasProvenance: false,
    unresolvedContradictionCount: 0,
    criticalContradictionCount: 0,
  },
});

const fabricRows = async (org: number) =>
  (
    await owner.query(
      `SELECT id::text AS id, decision_context->>'governedDecisionId' AS governed_id,
              notes::jsonb->>'artifactId' AS artifact
         FROM decision_records
        WHERE organization_id = $1 AND project_id = $2 AND decision_context->>'kind' = $3
        ORDER BY created_at`,
      [org, GD_PROJECT, GOVERNED_FABRIC_KIND]
    )
  ).rows as Array<{ id: string; governed_id: string; artifact: string }>;

/** The recorder is fire-and-forget; give it time before judging a count. */
const settle = () => new Promise(r => setTimeout(r, 1500));

/**
 * Governed decisions — added 2026-09-24 (launch row D3).
 *
 * The governed-document fabric records one decision per evaluation into
 * `public.decision_records`, and four routes read them back. None of it was in
 * this contract. Until f55dfcec the recorder wrote values the table's CHECK
 * constraints reject, so nothing ever persisted and the tenant question never
 * arose; once it could persist, the control-plane "simulate" route was found
 * recording under a BODY-supplied organization. Both were fixed and shown on
 * PGlite — which enforces no RLS. These cases put the same paths through the
 * production posture this file already asserts in its first case: `app_service`,
 * not superuser, no BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope
 * middleware, and the real routers.
 *
 * Every row count below is read through the OWNER pool, which is exempt from
 * RLS. Counting through the app role would be circular: a row RLS hid from the
 * app would look exactly like a row that was never written.
 */
describe('WO-03 governed decisions under RLS (D3, 2026-09-24)', () => {
  let cp: express.Express;
  // The control plane's tenant-scoped routes are for each org's administrators
  // (ledger L183). These cases passed as members only because the guard let
  // everyone in outside production by default, which it no longer does.
  let adminA: string;
  let adminB: string;

  beforeAll(() => {
    // Mounted exactly as server/bootstrap/register-core-routes.ts mounts it.
    cp = express();
    cp.use(express.json());
    cp.use('/api/control-plane', authenticateToken, controlPlaneRouter);
    adminA = accessToken(userA, ORG_A, 'admin');
    adminB = accessToken(userB, ORG_B, 'admin');
  });

  it('the recording evaluator persists the caller\'s own decision through the app role', async () => {
    const before = (await fabricRows(ORG_A)).length;
    // Exactly the production call: the synchronous evaluator, whose recording
    // is an un-awaited promise. The tenant scope has to survive that hop.
    runWithTenantScope(scope(ORG_A, 'wo03-gd-own'), () =>
      evaluateGovernedDocument(evaluation(ORG_A, `${TAG}-own-doc`) as never)
    );
    await settle();
    const after = await fabricRows(ORG_A);
    expect(after.length, 'a decision recorded for the caller\'s own org must persist under RLS').toBe(
      before + 1
    );
    // One identity: the id the fabric hands back is the row's id.
    expect(after[after.length - 1].id).toBe(after[after.length - 1].governed_id);
  });

  it('WITH CHECK refuses a decision the recorder files for another tenant', async () => {
    const before = (await fabricRows(ORG_B)).length;
    // Tenant A's request, a context naming tenant B: what the simulate route did
    // with a body-supplied org before f55dfcec. The app layer no longer issues
    // this; the database must refuse it regardless.
    runWithTenantScope(scope(ORG_A, 'wo03-gd-foreign'), () =>
      evaluateGovernedDocument(evaluation(ORG_B, `${TAG}-planted-doc`) as never)
    );
    await settle();
    expect(
      (await fabricRows(ORG_B)).length,
      'a decision filed for tenant B from tenant A\'s session must not land'
    ).toBe(before);
  });

  it('the simulate route records nothing, for any tenant', async () => {
    const beforeA = (await fabricRows(ORG_A)).length;
    const beforeB = (await fabricRows(ORG_B)).length;
    const res = await request(cp)
      .post('/api/control-plane/governed/evaluate')
      .set(auth(adminA))
      .send(evaluation(ORG_B, `${TAG}-simulated-doc`));
    expect(res.status).toBe(200);
    expect(res.body?.result?.evaluation?.decision?.outcome).toBeTruthy();
    await settle();
    expect((await fabricRows(ORG_A)).length).toBe(beforeA);
    expect((await fabricRows(ORG_B)).length).toBe(beforeB);
  });

  it('the reads show tenant A its decision and tenant B nothing of it', async () => {
    const own = await fabricRows(ORG_A);
    expect(own.length, 'case 1 must have left tenant A a decision to read').toBeGreaterThan(0);
    const mine = own[own.length - 1];

    const listA = await request(cp)
      .get(`/api/control-plane/governed/decisions?projectId=${GD_PROJECT}`)
      .set(auth(adminA));
    expect(listA.status).toBe(200);
    expect(listA.body.count).toBe(own.length);
    const listedId: string = listA.body.entries[0].decisionId;

    // Positive control for the by-id check below: tenant A can fetch its own
    // decision by the id the list returned. Without this, B's 404 would prove
    // nothing — it would also be what a broken lookup returns to everyone.
    const detailA = await request(cp)
      .get(`/api/control-plane/governed/decisions/${listedId}`)
      .set(auth(adminA));
    expect(detailA.status, 'tenant A must be able to fetch its own decision by the id it was given').toBe(
      200
    );

    const listB = await request(cp)
      .get(`/api/control-plane/governed/decisions?projectId=${GD_PROJECT}`)
      .set(auth(adminB));
    expect(listB.status).toBe(200);
    expect(listB.body.count).toBe(0);

    const detailB = await request(cp)
      .get(`/api/control-plane/governed/decisions/${listedId}`)
      .set(auth(adminB));
    expect(detailB.status).toBe(404);

    const traceB = await request(cp)
      .get(`/api/control-plane/governed/trace/${GD_PROJECT}/${mine.artifact}`)
      .set(auth(adminB));
    expect(traceB.status).toBe(200);
    expect(traceB.body.count).toBe(0);

    const traceA = await request(cp)
      .get(`/api/control-plane/governed/trace/${GD_PROJECT}/${mine.artifact}`)
      .set(auth(adminA));
    expect(traceA.body.count).toBe(1);
  });
});
