/**
 * WO-03: application-to-Postgres two-tenant isolation proof.
 *
 * This deliberately uses the production JWT/membership/scope middleware and
 * requestPgClient.  The only test-owned code is the tiny representative API
 * surface below; tenant identity and database session security are production
 * implementations.  The CI job supplies APP_DATABASE_URL for the real
 * app_service role provisioned by install-fresh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { authenticateToken } from '../../server/middleware/auth';
import { requestPgClient } from '../../server/db/requestDb';
import { getPool } from '../../server/db/runtime';
import { invalidateOrgMembershipCache } from '../../server/middleware/orgMembership';
import { runWithTenantScope } from '../../server/db/tenantStore';
import industryContextRouter from '../../server/routes/mdx-industry-context';
import savedPrecedentQueriesRouter from '../../server/routes/saved-precedent-queries';
import controlPlaneRouter from '../../server/src/routes/control-plane.router';
import { evaluateGovernedDocument } from '../../server/src/control-plane/governed-document-evaluator';
import { GOVERNED_FABRIC_KIND } from '../../server/services/governed-decision-repository';
import reportOsRouter from '../../server/routes/report-os';

const TAG = `wo03_${process.pid}_${Date.now().toString(36)}`;
const APP_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';
const ORG_A = 90301;
const ORG_B = 90302;
/* Reserved for this probe alone. Teardown deletes by these ids, so anything else
   that borrowed them would be deleted with the fixtures. */
const FIXTURE_ORGS = [ORG_A, ORG_B];

/**
 * The domains this probe proves isolation FOR. Everything outside this list is
 * asserted, not proven — that distinction is the whole status of WO-3, so the
 * list is the coverage number and adding to it is the work.
 *
 * Extended 2026-09-19 from three tables to six. The three added are regulated
 * stores, chosen because each carries the canonical `tenant_isolation_policy`
 * keyed on an integer `organization_id` (verified on the provisioned database,
 * not assumed) and each is read by a shipping surface:
 *
 *   design_controls  public.c2c_design_controls  21 CFR 820.30 design history
 *                    file — the DHF surface's only store
 *   risk_items       public.risk_items           ISO 14971 hazard analysis
 *
 * public.electronic_signatures was the third candidate and is DELIBERATELY NOT
 * here, which is worth writing down because it is the most consequential table
 * in the set. Its Part 11 trigger `esign_block_mutation()` refuses DELETE
 * outright — "rows cannot be deleted. Insert a superseding signature instead."
 * — and unlike audit_logs, whose immutability trigger provides the documented
 * `app.audit_archive_bypass` door this file's own cleanup uses, it provides no
 * door at all. So a fixture signature is permanent: every run would leak a row
 * pair, and `electronic_signatures.signer_id`'s FK to users then makes the
 * users cleanup fail with 23503 and leaks every fixture after it (observed,
 * which is how this was found). Covering it needs a fixture strategy that does
 * not require deletion — a dedicated signer whose rows are expected to
 * accumulate, or a superseding-insert cleanup — not a trigger-disable recipe
 * copied out of a test. Recorded for whoever owns Part 11.
 *
 * A table whose primary key is not `id` needs `idColumnFor` below; all six of
 * these key on `id`, so `submission_orchestrator_runs` (run_id) is the next
 * one to add and the reason that map exists.
 */
type Domain = 'projects' | 'documents' | 'audit_logs' | 'design_controls' | 'risk_items';
const domains: Domain[] = ['projects', 'documents', 'audit_logs', 'design_controls', 'risk_items'];
const tableFor: Record<Domain, string> = {
  projects: 'public.projects',
  documents: 'public.documents',
  audit_logs: 'public.audit_logs',
  design_controls: 'public.c2c_design_controls',
  risk_items: 'public.risk_items',
};
/** The column the generic handlers address a row by. */
const idColumnFor: Record<Domain, string> = {
  projects: 'id',
  documents: 'id',
  audit_logs: 'id',
  design_controls: 'id',
  risk_items: 'id',
};
/**
 * A non-key column the PATCH probe writes, per domain. Replaces an inline
 * ternary whose two `status` branches were identical, which made it read as a
 * per-domain decision when it was not.
 */
const updateColumnFor: Record<Domain, string> = {
  projects: 'status',
  documents: 'status',
  audit_logs: 'action',
  design_controls: 'req',
  risk_items: 'status',
};
let owner: Pool;
let app: express.Express;
let tokenA: string;
let tokenB: string;
let userA: number;
let userB: number;
let workspaceA: number;
let workspaceB: number;
const ids = { A: {} as Record<Domain, string>, B: {} as Record<Domain, string> };
const programA = '90301000-0000-4000-8000-000000000001';
const programB = '90302000-0000-4000-8000-000000000002';
let savedQueryA: number;
let savedQueryB: number;

/**
 * Mint an access token with the SAME secret the server will verify it against.
 *
 * This signed with `process.env.JWT_SECRET` directly, which is not necessarily
 * the secret the verifier resolves. Both getJwtSecret (server/config/
 * environment.ts, the signing side) and currentSecret (server/utils/
 * jwtVerify.ts, the verifying side) read `JWT_SECRET_<SUFFIX>` FIRST and only
 * fall back to `JWT_SECRET` — and NODE_ENV=test maps to the DEV suffix. config
 * resolves once at module import; the verifier resolves on every call. A .env
 * load between those two moments makes them disagree, and on this repo's own
 * .env (which sets JWT_SECRET_DEV) they did: every request in this file came
 * back 401 "invalid signature", so the twelve isolation assertions below
 * reported an auth failure instead of the cross-tenant result they exist to
 * prove. CI has no .env, so both resolved to JWT_SECRET there and the suite was
 * green — which is why this only ever failed locally.
 *
 * activeJwtSecret() resolves the secret the same way, at the same moment, as
 * the verifier that will check the token, so the two cannot drift.
 */
function accessToken(userId: number, organizationId: number): string {
  return jwt.sign(
    { type: 'access', userId, organizationId: String(organizationId), role: 'member' },
    activeJwtSecret(),
    { expiresIn: '5m' }
  );
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function safeDomain(value: string): Domain | null {
  return domains.includes(value as Domain) ? (value as Domain) : null;
}

// The setup intentionally keeps provisioning and the representative request
// surface in one lifecycle hook so partial setup cannot escape cleanup.
// eslint-disable-next-line max-lines-per-function
beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) {
    throw new Error(
      '[wo03] APP_DATABASE_URL is required; owner execution is not an isolation proof'
    );
  }
  owner = new Pool({ connectionString: databaseUrl, max: 2 });

  const runtimeIdentity = await runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'test', caller: 'wo03-role-posture' },
    () =>
      getPool().query(`SELECT current_user AS role,
            current_setting('is_superuser')::boolean AS superuser,
            r.rolbypassrls,
            current_setting('app.rls_enforce', true) AS enforcement
       FROM pg_roles r WHERE r.rolname = current_user`)
  );
  expect(runtimeIdentity.rows).toEqual([
    { role: APP_ROLE, superuser: false, rolbypassrls: false, enforcement: 'on' },
  ]);

  for (const [id, suffix] of [
    [ORG_A, 'a'],
    [ORG_B, 'b'],
  ] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status)
       VALUES ($1,$2,$3,'active') ON CONFLICT (id) DO UPDATE SET status='active'`,
      [id, `${TAG}-${suffix}`, `${TAG}-${suffix}`]
    );
  }
  const users = await owner.query(
    `INSERT INTO users (email,name,password_hash,default_organization_id)
     VALUES ($1,'WO03 A','not-a-real-password',$3),($2,'WO03 B','not-a-real-password',$4)
     RETURNING id`,
    [`${TAG}-a@example.invalid`, `${TAG}-b@example.invalid`, ORG_A, ORG_B]
  );
  [userA, userB] = users.rows.map(r => r.id);
  await owner.query(
    `INSERT INTO organization_users (organization_id,user_id,role)
     VALUES ($1,$2,'member'),($3,$4,'member')`,
    [ORG_A, userA, ORG_B, userB]
  );
  const workspaces = await owner.query(
    `INSERT INTO client_workspaces (organization_id,name,slug,created_by_id)
     VALUES ($1,$2,$3,$4),($5,$6,$7,$8) RETURNING id`,
    [
      ORG_A,
      `${TAG}-workspace-a`,
      `${TAG}-wa`,
      userA,
      ORG_B,
      `${TAG}-workspace-b`,
      `${TAG}-wb`,
      userB,
    ]
  );
  [workspaceA, workspaceB] = workspaces.rows.map(r => r.id);

  await owner.query(
    `INSERT INTO project_industry_profiles
       (program_id,organization_id,vertical,product_type,updated_by)
     VALUES ($1,$2,'biopharma',$3,$4),($5,$6,'biopharma',$7,$8)`,
    [programA, ORG_A, `${TAG}-profile-A`, userA, programB, ORG_B, `${TAG}-profile-B`, userB]
  );
  const savedQueries = await owner.query(
    `INSERT INTO saved_precedent_queries (organization_id,user_id,label,query)
     VALUES ($1,$2,$3,$4),($5,$6,$7,$8) RETURNING id`,
    [
      ORG_A,
      userA,
      `${TAG}-saved-A`,
      `${TAG}-query-A`,
      ORG_B,
      userB,
      `${TAG}-saved-B`,
      `${TAG}-query-B`,
    ]
  );
  [savedQueryA, savedQueryB] = savedQueries.rows.map(r => r.id);

  for (const [side, org, user, workspace] of [
    ['A', ORG_A, userA, workspaceA],
    ['B', ORG_B, userB, workspaceB],
  ] as const) {
    const p = await owner.query(
      `INSERT INTO projects (organization_id,client_workspace_id,name,type,description,created_by_id)
       VALUES ($1,$2,$3,'regulatory',$4,$5) RETURNING id`,
      [org, workspace, `${TAG}-project-${side}`, `fixture-body-${side}`, user]
    );
    ids[side].projects = String(p.rows[0].id);
    const d = await owner.query(
      `INSERT INTO documents
       (organization_id,client_workspace_id,document_code,title,document_type,owner_id,created_by_id,description)
       VALUES ($1,$2,$3,$4,'REGULATORY',$5,$5,$6) RETURNING id`,
      [
        org,
        workspace,
        `${TAG}-DOC-${side}`,
        `${TAG}-document-${side}`,
        user,
        `fixture-body-${side}`,
      ]
    );
    ids[side].documents = String(d.rows[0].id);
    const a = await owner.query(
      `INSERT INTO audit_logs (tenant_id,user_id,action,table_name,record_id,new_values)
       VALUES ($1,$2,'READ','wo03',$3,$4::json) RETURNING id`,
      [org, user, `${TAG}-${side}`, JSON.stringify({ confidential: `fixture-body-${side}` })]
    );
    ids[side].audit_logs = String(a.rows[0].id);

    /* ── The three domains added 2026-09-19 ────────────────────────────────
       Seeded through the OWNER pool, like every fixture above: the point of
       the probe is that the app_service role cannot reach the other tenant's
       row, which requires the row to exist in the first place. */
    const dc = await owner.query(
      `INSERT INTO c2c_design_controls (id, organization_id, cat, req)
       VALUES ($1,$2,'performance',$3) RETURNING id`,
      [`${TAG}-dc-${side}`, org, `fixture-body-${side}`]
    );
    ids[side].design_controls = String(dc.rows[0].id);

    const ri = await owner.query(
      `INSERT INTO risk_items (organization_id, hazard, harm, severity, probability, status)
       VALUES ($1,$2,$3,3,2,'open') RETURNING id`,
      [org, `${TAG}-hazard-${side}`, `fixture-body-${side}`]
    );
    ids[side].risk_items = String(ri.rows[0].id);
  }

  tokenA = accessToken(userA, ORG_A);
  tokenB = accessToken(userB, ORG_B);
  invalidateOrgMembershipCache();

  app = express();
  app.use(express.json());
  // Real product routers: these are the normal project-context and governed
  // regulatory-query service entry points, not test-owned replicas.
  app.use('/actual/mdx', authenticateToken, industryContextRouter);
  app.use('/actual/saved-precedent-queries', authenticateToken, savedPrecedentQueriesRouter);
  app.use('/proof', authenticateToken);
  app.get('/proof/:domain', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const q = String(req.query.q || '');
    const result = await requestPgClient(req).query(
      `SELECT ${idColumnFor[domain]}::text AS id FROM ${tableFor[domain]}
        WHERE ($1 = '' OR ${idColumnFor[domain]}::text = $1) ORDER BY 1`,
      [q]
    );
    return res.json({ ids: result.rows.map(r => r.id) });
  });
  // Register HEAD before GET. Express otherwise derives HEAD from GET and the
  // explicit existence-probe implementation would never execute.
  app.head('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `SELECT 1 FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1`,
      [req.params.id]
    );
    return res.sendStatus(result.rows.length ? 204 : 404);
  });
  app.get('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const result = await requestPgClient(req).query(
      `SELECT ${idColumnFor[domain]}::text AS id FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1`,
      [req.params.id]
    );
    return result.rows.length
      ? res.json({ id: result.rows[0].id })
      : res.status(404).json({ error: { code: 'NOT_FOUND' } });
  });
  app.post('/proof/:domain', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const foreignOrg = Number(req.body?.organizationId);
    try {
      if (domain === 'projects') {
        await requestPgClient(req).query(
          `INSERT INTO projects (organization_id,client_workspace_id,name,type,created_by_id)
           VALUES ($1,$2,$3,'regulatory',$4)`,
          [foreignOrg, workspaceB, `${TAG}-forged-project`, userA]
        );
      } else if (domain === 'documents') {
        await requestPgClient(req).query(
          `INSERT INTO documents
           (organization_id,client_workspace_id,document_code,title,document_type,owner_id,created_by_id)
           VALUES ($1,$2,$3,$4,'REGULATORY',$5,$5)`,
          [foreignOrg, workspaceB, `${TAG}-FORGED`, `${TAG}-forged-document`, userA]
        );
      } else if (domain === 'audit_logs') {
        await requestPgClient(req).query(
          `INSERT INTO audit_logs (tenant_id,user_id,action,table_name,record_id)
           VALUES ($1,$2,'FORGED','wo03',$3)`,
          [foreignOrg, userA, `${TAG}-forged-audit`]
        );
      } else if (domain === 'design_controls') {
        await requestPgClient(req).query(
          `INSERT INTO c2c_design_controls (id,organization_id,cat,req)
           VALUES ($1,$2,'performance','forged')`,
          [`${TAG}-forged-dc`, foreignOrg]
        );
      } else {
        await requestPgClient(req).query(
          `INSERT INTO risk_items (organization_id,hazard,harm,severity,probability)
           VALUES ($1,$2,'forged',3,2)`,
          [foreignOrg, `${TAG}-forged-hazard`]
        );
      }
      return res.sendStatus(201);
    } catch (error) {
      // Do not serialize the PostgreSQL error: it may contain schema or row
      // details. RLS WITH CHECK denial follows the same opaque contract as a
      // cross-tenant id probe.
      if ((error as { code?: string }).code === '42501') {
        return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
    }
  });
  app.patch('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `UPDATE ${tableFor[domain]} SET ${updateColumnFor[domain]}=$1
         WHERE ${idColumnFor[domain]}::text=$2 RETURNING ${idColumnFor[domain]}`,
      ['TAMPERED', req.params.id]
    );
    return result.rows.length ? res.sendStatus(204) : res.sendStatus(404);
  });
  app.delete('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `DELETE FROM ${tableFor[domain]} WHERE ${idColumnFor[domain]}::text=$1 RETURNING ${idColumnFor[domain]}`,
      [req.params.id]
    );
    return result.rows.length ? res.sendStatus(204) : res.sendStatus(404);
  });
}, 60_000);

afterAll(async () => {
  invalidateOrgMembershipCache();
  if (owner) {
    // Session GUCs and cleanup statements must use one checked-out connection;
    // consecutive pool.query calls are not guaranteed to use the same session.
    const cleanup = await owner.connect().catch(() => null);
    if (cleanup) {
      try {
        await cleanup.query("SELECT set_config('app.rls_enforce','off',false)");
        // audit_logs is append-only on the deploy path: trg_audit_logs_no_delete
        // (20260617_audit_logs_immutability.sql) aborts a bare DELETE with
        // P0A02, which would kill every remaining cleanup statement and leak
        // the fixtures. Use the trigger's authorized archive door, SET LOCAL so
        // the bypass dies with this transaction — the same pattern the sibling
        // dbtest suites adopted after hitting exactly this failure.
        await cleanup.query('BEGIN');
        try {
          await cleanup.query("SET LOCAL app.audit_archive_bypass = 'on'");
          await cleanup.query('DELETE FROM audit_logs WHERE record_id LIKE $1', [`${TAG}%`]);
          await cleanup.query('COMMIT');
        } catch (err) {
          // ROLLBACK so the connection leaves the aborted transaction and the
          // remaining fixture deletes below still run instead of all dying.
          // Not rethrown: unlike the sibling suites (audit delete last), nine
          // deletes follow this one — orgs, users, documents — and leaking all
          // of them to report a failed audit-row sweep inverts the priority.
          // The tagged audit rows are inert and LIKE-scoped if they survive.
          await cleanup.query('ROLLBACK');
          console.warn('[wo-03] audit_logs teardown skipped:', err);
        }
        /* Report OS (L184). These run BEFORE the projects delete below:
           c2c_submissions, c2c_correspondence, project_intelligence_profiles and
           project_memory_entries reference projects with no cascade, so one
           leftover row fails that delete with 23503 and strands every fixture
           after it. Org-scoped for the reason given further down. report_runs
           → report_type_registry is ON DELETE RESTRICT, so runs go before the
           fixture type. */
        await cleanup.query(
          `DELETE FROM c2c_correspondence_issues WHERE correspondence_id IN
             (SELECT id FROM c2c_correspondence WHERE organization_id=ANY($1::int[]))`,
          [FIXTURE_ORGS]
        );
        for (const table of [
          'c2c_correspondence',
          'c2c_submissions',
          'project_memory_entries',
          'project_intelligence_profiles',
          'report_runs',
          'report_program_groups',
        ]) {
          await cleanup.query(`DELETE FROM ${table} WHERE organization_id=ANY($1::int[])`, [
            FIXTURE_ORGS,
          ]);
        }
        await cleanup.query("DELETE FROM report_type_registry WHERE type_id LIKE 'wo03\\_%'");
        await cleanup.query('DELETE FROM documents WHERE document_code LIKE $1', [`${TAG}%`]);
        await cleanup.query('DELETE FROM projects WHERE name LIKE $1', [`${TAG}%`]);
        await cleanup.query('DELETE FROM saved_precedent_queries WHERE label LIKE $1', [`${TAG}%`]);
        /* Everything below is scoped by the two reserved fixture org ids rather
           than by ids captured in memory during the seed, and that is the point.
           TAG carries a pid and a timestamp, so it is unique per run: a run that
           dies part-way through beforeAll leaves rows no LATER run's TAG can
           match, and because these tables are the FK spine (org_users → users →
           organizations) the leak does not stay quiet — it makes the organizations
           delete fail with 23503 for every subsequent run, forever, until someone
           cleans the database by hand. Observed twice while this file was being
           extended, both times costing a manual psql pass. ORG_A/ORG_B are
           constants reserved for this probe and nothing else may use them, so
           org-scoped deletes are safe AND idempotent: each run now also clears
           whatever its predecessors stranded. Domains whose own rows carry no
           organization_id are matched through the orgs instead. */
        await cleanup.query('DELETE FROM decision_records WHERE organization_id=ANY($1::int[])', [
          FIXTURE_ORGS,
        ]);
        await cleanup.query('DELETE FROM risk_items WHERE organization_id=ANY($1::int[])', [
          FIXTURE_ORGS,
        ]);
        await cleanup.query(
          'DELETE FROM c2c_design_controls WHERE organization_id=ANY($1::int[])',
          [FIXTURE_ORGS]
        );
        await cleanup.query(
          'DELETE FROM project_industry_profiles WHERE organization_id=ANY($1::int[])',
          [FIXTURE_ORGS]
        );
        await cleanup.query('DELETE FROM client_workspaces WHERE organization_id=ANY($1::int[])', [
          FIXTURE_ORGS,
        ]);
        await cleanup.query('DELETE FROM organization_users WHERE organization_id=ANY($1::int[])', [
          FIXTURE_ORGS,
        ]);
        await cleanup.query('DELETE FROM users WHERE default_organization_id=ANY($1::int[])', [
          FIXTURE_ORGS,
        ]);
        await cleanup.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [FIXTURE_ORGS]);
      } finally {
        cleanup.release();
      }
    }
    await owner.end();
  }
});

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
  const GD_PROJECT = 903010;
  let cp: express.Express;

  beforeAll(() => {
    // Mounted exactly as server/bootstrap/register-core-routes.ts mounts it.
    cp = express();
    cp.use(express.json());
    cp.use('/api/control-plane', authenticateToken, controlPlaneRouter);
  });

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
      .set(auth(tokenA))
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
      .set(auth(tokenA));
    expect(listA.status).toBe(200);
    expect(listA.body.count).toBe(own.length);
    const listedId: string = listA.body.entries[0].decisionId;

    // Positive control for the by-id check below: tenant A can fetch its own
    // decision by the id the list returned. Without this, B's 404 would prove
    // nothing — it would also be what a broken lookup returns to everyone.
    const detailA = await request(cp)
      .get(`/api/control-plane/governed/decisions/${listedId}`)
      .set(auth(tokenA));
    expect(detailA.status, 'tenant A must be able to fetch its own decision by the id it was given').toBe(
      200
    );

    const listB = await request(cp)
      .get(`/api/control-plane/governed/decisions?projectId=${GD_PROJECT}`)
      .set(auth(tokenB));
    expect(listB.status).toBe(200);
    expect(listB.body.count).toBe(0);

    const detailB = await request(cp)
      .get(`/api/control-plane/governed/decisions/${listedId}`)
      .set(auth(tokenB));
    expect(detailB.status).toBe(404);

    const traceB = await request(cp)
      .get(`/api/control-plane/governed/trace/${GD_PROJECT}/${mine.artifact}`)
      .set(auth(tokenB));
    expect(traceB.status).toBe(200);
    expect(traceB.body.count).toBe(0);

    const traceA = await request(cp)
      .get(`/api/control-plane/governed/trace/${GD_PROJECT}/${mine.artifact}`)
      .set(auth(tokenA));
    expect(traceA.body.count).toBe(1);
  });
});

/**
 * L184 (D3, 2026-09-24): Report OS took the tenant from the request.
 *
 * Seven request schemas in server/routes/report-os.ts carried an
 * `organizationId`, and every handler behind them used it: GET /runs listed the
 * org the query named; POST /runs computed a report over the named org's data
 * and returned it; program groups, snapshots, bundles, deliveries and
 * correspondence capture read and wrote under it. PATCH /program-groups/:id had
 * no org check at all.
 *
 * Under enforcing RLS the database refuses most of that, so — as with governed
 * decisions above — the assertions that tell a fixed handler from a broken one
 * are POSITIVE controls. Every request below comes from tenant B and names
 * tenant A. A handler that uses the named org asks the database for A's rows
 * and RLS answers with nothing, or refuses the write with a 500; a handler that
 * uses the session's org is served B's own. The negative assertions (nothing of
 * A's is returned, nothing lands in A) are what hold if RLS is ever off, which
 * is what the evidence's mutation runs exercise.
 *
 * Row counts are read through the OWNER pool, for the reason given above.
 */
describe('Report OS takes the tenant from the session, never the request (L184, D3)', () => {
  const TYPE_ID = `${TAG}.fixture_status`;
  let ro: express.Express;
  let runA: number;
  let runB: number;
  let groupA: number;
  let submissionA: string;
  let submissionB: string;

  const count = async (table: string, org: number) =>
    Number(
      (await owner.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id=$1`, [org]))
        .rows[0].n
    );

  beforeAll(async () => {
    // Mounted exactly as server/bootstrap/register-inline-routes.ts mounts it:
    // no outer middleware. The router applies server/auth's authMiddleware,
    // which establishes the request's tenant scope itself.
    ro = express();
    ro.use(express.json());
    ro.use('/api/report-os', reportOsRouter);

    /* A deployed database has no report types: no migration seeds
       report_type_registry, so POST /runs answers 404 there until someone seeds
       it through the dev-gated /taxonomy/seed route. The fixture type is the
       smallest row that route would write. */
    await owner.query(
      `INSERT INTO report_type_registry (type_id,label,family,allowed_scopes)
       VALUES ($1,$2,'readiness','["project","program"]'::json)`,
      [TYPE_ID, `${TAG} fixture status`]
    );
    for (const [side, org] of [
      ['A', ORG_A],
      ['B', ORG_B],
    ] as const) {
      const run = await owner.query(
        `INSERT INTO report_runs (organization_id,scope_type,scope_id,report_type_id,status,dependency_summary)
         VALUES ($1,'project',$2,$3,'completed',$4::json) RETURNING id`,
        [org, ids[side].projects, TYPE_ID, JSON.stringify({ summary: { fixture: `fixture-body-${side}` } })]
      );
      const submission = await owner.query(
        `INSERT INTO c2c_submissions (organization_id,project_id,submission_type,regulator,lifecycle_state)
         VALUES ($1,$2,'NDA','FDA','drafting') RETURNING id::text AS id`,
        [org, ids[side].projects]
      );
      if (side === 'A') {
        runA = run.rows[0].id;
        submissionA = submission.rows[0].id;
      } else {
        runB = run.rows[0].id;
        submissionB = submission.rows[0].id;
      }
    }
    const group = await owner.query(
      `INSERT INTO report_program_groups (organization_id,name) VALUES ($1,$2) RETURNING id`,
      [ORG_A, `${TAG}-group-A`]
    );
    groupA = group.rows[0].id;
    await owner.query(
      `INSERT INTO report_program_group_projects (program_group_id,project_id) VALUES ($1,$2)`,
      [groupA, ids.A.projects]
    );
  });

  /* One behaviour per case, so that no failure hides another: a leak and the
     positive control beside it report separately in every run, including the
     mutation runs filed as evidence. Every request is also valid under the old
     request schemas (which REQUIRED organizationId), so a red run fails on the
     handler's behaviour, never on a 400 from validation. */

  it("GET /runs never lists another tenant's run, whatever org the query names", async () => {
    const list = await request(ro)
      .get(`/api/report-os/runs?organizationId=${ORG_A}`)
      .set(auth(tokenB));
    expect(list.status).toBe(200);
    const listed = (list.body.data as Array<{ id: number }>).map(r => r.id);
    expect(listed, "tenant A's run must never be listed to tenant B").not.toContain(runA);
    expect(JSON.stringify(list.body)).not.toContain('fixture-body-A');
  });

  it("GET /runs lists the session tenant's own runs", async () => {
    const list = await request(ro)
      .get(`/api/report-os/runs?organizationId=${ORG_A}`)
      .set(auth(tokenB));
    expect(list.status).toBe(200);
    const listed = (list.body.data as Array<{ id: number }>).map(r => r.id);
    expect(listed, "tenant B's own run must be listed: the org is the session's").toContain(runB);
  });

  it('POST /runs records for the session tenant and user, whatever the body names', async () => {
    const runsInA = await count('report_runs', ORG_A);
    const created = await request(ro)
      .post('/api/report-os/runs')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        scopeType: 'project',
        scopeId: ids.B.projects,
        reportTypeId: TYPE_ID,
        requestedBy: userA,
      });
    expect(
      created.status,
      'a run request naming another org must run for the caller, not reach the database as that org'
    ).toBe(201);
    expect(created.body.data.run.organizationId).toBe(ORG_B);
    expect(created.body.data.run.requestedBy, 'the requester is the session user, not the body').toBe(
      userB
    );
    expect(await count('report_runs', ORG_A), 'nothing may land in tenant A').toBe(runsInA);
  });

  it("POST /runs over another tenant's project is not found and computes nothing", async () => {
    const runsInA = await count('report_runs', ORG_A);
    const overForeign = await request(ro)
      .post('/api/report-os/runs')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        scopeType: 'project',
        scopeId: ids.A.projects,
        reportTypeId: TYPE_ID,
      });
    expect(await count('report_runs', ORG_A), 'nothing may land in tenant A').toBe(runsInA);
    expect(JSON.stringify(overForeign.body)).not.toContain('fixture-body-A');
    expect(overForeign.status, "another tenant's project must read as not found").toBe(404);
  });

  it('a program group is made in the session tenant by the session user, whatever the body names', async () => {
    const groupsInA = await count('report_program_groups', ORG_A);
    const made = await request(ro)
      .post('/api/report-os/program-groups')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        name: `${TAG}-group-B`,
        projectIds: [Number(ids.B.projects)],
        createdBy: userA,
      });
    expect(made.status, 'a group request naming another org must be made for the caller').toBe(201);
    expect(made.body.data.organizationId).toBe(ORG_B);
    expect(made.body.data.createdBy, 'the creator is the session user, not the body').toBe(userB);
    expect(await count('report_program_groups', ORG_A)).toBe(groupsInA);
  });

  it("a program group over another tenant's project is refused", async () => {
    // Naming its OWN org: the request is legitimate in every respect but the
    // member. report_program_group_projects has no RLS, so this is the one
    // check here the database cannot make.
    const groupsInB = await count('report_program_groups', ORG_B);
    const overForeign = await request(ro)
      .post('/api/report-os/program-groups')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_B,
        name: `${TAG}-group-B-foreign`,
        projectIds: [Number(ids.A.projects)],
      });
    const crossMembers = await owner.query(
      `SELECT count(*)::int AS n
         FROM report_program_group_projects m
         JOIN report_program_groups g ON g.id = m.program_group_id
        WHERE g.organization_id = $1 AND m.project_id = $2`,
      [ORG_B, ids.A.projects]
    );
    expect(crossMembers.rows[0].n, "no group of tenant B may hold tenant A's project").toBe(0);
    expect(await count('report_program_groups', ORG_B)).toBe(groupsInB);
    expect(overForeign.status, "a group over another tenant's project must be refused").toBe(400);
  });

  it("another tenant's program group cannot be changed", async () => {
    const patched = await request(ro)
      .patch(`/api/report-os/program-groups/${groupA}`)
      .set(auth(tokenB))
      .send({ name: `${TAG}-TAMPERED`, projectIds: [Number(ids.B.projects)] });
    const stillA = await owner.query(
      `SELECT g.name, array_agg(m.project_id::text) AS members
         FROM report_program_groups g
         LEFT JOIN report_program_group_projects m ON m.program_group_id = g.id
        WHERE g.id = $1 GROUP BY g.name`,
      [groupA]
    );
    expect(stillA.rows[0], "tenant A's group must be exactly as tenant A left it").toEqual({
      name: `${TAG}-group-A`,
      members: [ids.A.projects],
    });
    expect(patched.status, "another tenant's group must read as not found").toBe(404);
  });

  it("another tenant's program group cannot be snapshotted", async () => {
    const snapshotsOfA = async () =>
      Number(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM report_program_group_snapshots WHERE program_group_id=$1',
            [groupA]
          )
        ).rows[0].n
      );
    const before = await snapshotsOfA();
    const snap = await request(ro)
      .post(`/api/report-os/program-groups/${groupA}/snapshots`)
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, snapshotLabel: `${TAG}-snap` });
    expect(
      snap.body?.data?.projectIds ?? [],
      "tenant A's group membership must not be returned to tenant B"
    ).not.toContain(Number(ids.A.projects));
    expect(await snapshotsOfA(), "no snapshot of tenant A's group may be written").toBe(before);
    expect(snap.status, "another tenant's group must read as not found").toBe(404);
  });

  it("a bundle cannot take another tenant's run", async () => {
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/bundles')
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, name: `${TAG}-bundle-foreign`, runIds: [runA] });
    expect(
      foreign.body?.data?.runIds ?? [],
      "tenant A's run must not be bundled for tenant B"
    ).not.toContain(runA);
    expect(await count('project_memory_entries', ORG_A), 'nothing may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's run must read as not found").toBe(400);
  });

  it("a bundle of the session tenant's own run is stored and records the session user", async () => {
    const bundle = await request(ro)
      .post('/api/report-os/bundles')
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, name: `${TAG}-bundle-B`, runIds: [runB], createdBy: userA });
    expect(bundle.status, 'tenant B must be able to bundle its own run whatever org the body names').toBe(
      201
    );
    expect(bundle.body.data.organizationId).toBe(ORG_B);
    expect(bundle.body.data.createdBy, 'the creator is the session user, not the body').toBe(userB);
    const bundlesB = await request(ro).get('/api/report-os/bundles').set(auth(tokenB));
    expect(
      (bundlesB.body.data as Array<{ bundleId: string }>).map(b => b.bundleId),
      'a bundle answered 201 must be one that was stored'
    ).toContain(bundle.body.data.bundleId);
    const bundlesA = await request(ro).get('/api/report-os/bundles').set(auth(tokenA));
    expect(JSON.stringify(bundlesA.body)).not.toContain(bundle.body.data.bundleId);
  });

  it("a delivery cannot take another tenant's run", async () => {
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        runId: runA,
        channel: 'external_pdf_export',
        subject: `${TAG} foreign delivery`,
      });
    expect(
      foreign.body?.data?.organizationId,
      "a delivery of tenant A's run must not be recorded in tenant A"
    ).not.toBe(ORG_A);
    expect(await count('project_memory_entries', ORG_A), 'nothing may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's run must read as not found").toBe(404);
  });

  it("a delivery of the session tenant's own run records the session user", async () => {
    const delivery = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        runId: runB,
        channel: 'external_pdf_export',
        subject: `${TAG} own delivery`,
        requestedBy: userA,
      });
    expect(delivery.status, 'tenant B must be able to deliver its own run').toBe(201);
    expect(delivery.body.data.organizationId).toBe(ORG_B);
    expect(delivery.body.data.requestedBy, 'the requester is the session user, not the body').toBe(
      userB
    );
  });

  it("correspondence cannot be captured into another tenant's project", async () => {
    const inA = await count('c2c_correspondence', ORG_A);
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/correspondence/capture')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        projectId: Number(ids.A.projects),
        submissionId: submissionA,
        subject: `${TAG} planted deficiency`,
        body: 'Refuse to file: planted by another tenant.',
      });
    expect(await count('c2c_correspondence', ORG_A), 'no letter may land in tenant A').toBe(inA);
    expect(await count('project_memory_entries', ORG_A), 'no memory may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's project must read as not found").toBe(404);
  });

  it("correspondence is captured into the session tenant's own project and submission", async () => {
    const inB = await count('c2c_correspondence', ORG_B);
    const own = await request(ro)
      .post('/api/report-os/correspondence/capture')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        projectId: Number(ids.B.projects),
        submissionId: submissionB,
        subject: `${TAG} own correspondence`,
        body: 'Deficiency letter: clarification requested on the stability section.',
      });
    expect(own.status, 'tenant B must be able to capture into its own project').toBe(201);
    expect(own.body.data.persistedToPlatform).toBe(true);
    expect(await count('c2c_correspondence', ORG_B)).toBe(inB + 1);
  });
});
