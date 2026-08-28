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

const TAG = `wo03_${process.pid}_${Date.now().toString(36)}`;
const APP_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';
const ORG_A = 90301;
const ORG_B = 90302;

type Domain = 'projects' | 'documents' | 'audit_logs';
const domains: Domain[] = ['projects', 'documents', 'audit_logs'];
const tableFor: Record<Domain, string> = {
  projects: 'public.projects',
  documents: 'public.documents',
  audit_logs: 'public.audit_logs',
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
      `SELECT id::text FROM ${tableFor[domain]} WHERE ($1 = '' OR id::text = $1) ORDER BY id::text`,
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
      `SELECT 1 FROM ${tableFor[domain]} WHERE id::text=$1`,
      [req.params.id]
    );
    return res.sendStatus(result.rows.length ? 204 : 404);
  });
  app.get('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
    const result = await requestPgClient(req).query(
      `SELECT id::text FROM ${tableFor[domain]} WHERE id::text=$1`,
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
      } else {
        await requestPgClient(req).query(
          `INSERT INTO audit_logs (tenant_id,user_id,action,table_name,record_id)
           VALUES ($1,$2,'FORGED','wo03',$3)`,
          [foreignOrg, userA, `${TAG}-forged-audit`]
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
      `UPDATE ${tableFor[domain]} SET ${
        domain === 'audit_logs' ? 'action' : domain === 'projects' ? 'status' : 'status'
      }=$1 WHERE id::text=$2 RETURNING id`,
      ['TAMPERED', req.params.id]
    );
    return result.rows.length ? res.sendStatus(204) : res.sendStatus(404);
  });
  app.delete('/proof/:domain/:id', async (req, res) => {
    const domain = safeDomain(req.params.domain);
    if (!domain) return res.sendStatus(404);
    const result = await requestPgClient(req).query(
      `DELETE FROM ${tableFor[domain]} WHERE id::text=$1 RETURNING id`,
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
        await cleanup.query('DELETE FROM documents WHERE document_code LIKE $1', [`${TAG}%`]);
        await cleanup.query('DELETE FROM projects WHERE name LIKE $1', [`${TAG}%`]);
        await cleanup.query('DELETE FROM saved_precedent_queries WHERE label LIKE $1', [`${TAG}%`]);
        await cleanup.query(
          'DELETE FROM project_industry_profiles WHERE program_id=ANY($1::uuid[])',
          [[programA, programB]]
        );
        await cleanup.query('DELETE FROM client_workspaces WHERE id=ANY($1::int[])', [
          [workspaceA, workspaceB],
        ]);
        await cleanup.query('DELETE FROM organization_users WHERE user_id=ANY($1::int[])', [
          [userA, userB],
        ]);
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::int[])', [[userA, userB]]);
        await cleanup.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [[ORG_A, ORG_B]]);
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
        [domain]
      );
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
