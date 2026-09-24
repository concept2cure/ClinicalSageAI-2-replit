/**
 * The WO-03 two-tenant fixture: two reserved organizations, a member user in
 * each, and one row per proven domain on each side, seeded through the OWNER
 * pool. Shared by every suite that proves a tenant contract on it:
 *
 *   two-tenant-application-rls.dbtest.ts       the generic domains, governed
 *                                              decisions (D3)
 *   report-os-tenant-from-session.dbtest.ts    Report OS (L184, D3)
 *
 * Moved out of two-tenant-application-rls.dbtest.ts on 2026-09-24, unchanged,
 * so that a new tenant contract gets its own file instead of lengthening that
 * one past the 500-line limit (the ESLint warning ratchet failed on exactly
 * that). vitest.db.config.ts runs files one at a time (fileParallelism:
 * false), and the teardown is scoped by the reserved org ids, so each suite
 * provisions, and clears, the same two tenants in turn.
 *
 * The bindings below are live ES-module exports: provisionTwoTenantFixture()
 * assigns them, and a suite reads them after its beforeAll has run.
 */
import { expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { invalidateOrgMembershipCache } from '../../server/middleware/orgMembership';
import { runWithTenantScope } from '../../server/db/tenantStore';
import type { Domain } from './tenant-proof-routes';

export const TAG = `wo03_${process.pid}_${Date.now().toString(36)}`;
export const APP_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';
export const ORG_A = 90301;
export const ORG_B = 90302;
/* Reserved for this probe alone. Teardown deletes by these ids, so anything else
   that borrowed them would be deleted with the fixtures. */
export const FIXTURE_ORGS = [ORG_A, ORG_B];

/* The domains this probe proves isolation FOR, and why each is on the list (and
   why electronic_signatures is not), are in ./tenant-proof-routes.ts with the
   /proof surface that addresses them. */
export let owner: Pool;
export let tokenA: string;
export let tokenB: string;
export let userA: number;
export let userB: number;
/** Permanent: a signature can never be deleted, so neither can its signer. */
export let signerA: number;
export let signerB: number;
export let workspaceA: number;
export let workspaceB: number;
export const ids = { A: {} as Record<Domain, string>, B: {} as Record<Domain, string> };
export const programA = '90301000-0000-4000-8000-000000000001';
export const programB = '90302000-0000-4000-8000-000000000002';
export let savedQueryA: number;
export let savedQueryB: number;

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
export function accessToken(userId: number, organizationId: number): string {
  return jwt.sign(
    { type: 'access', userId, organizationId: String(organizationId), role: 'member' },
    activeJwtSecret(),
    { expiresIn: '5m' }
  );
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Seeds both tenants and asserts the runtime pool is the production posture.
 * Call from beforeAll; pair with teardownTwoTenantFixture in afterAll, which
 * runs even when this throws part-way.
 */
// eslint-disable-next-line max-lines-per-function
export async function provisionTwoTenantFixture(): Promise<void> {
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

  /* Permanent signers, for the signatures domain (see tenant-proof-routes.ts).
     ON CONFLICT (email) makes this a lookup after the first run on a database;
     DO UPDATE (not NOTHING) so RETURNING yields the id either way. NULL
     default_organization_id keeps them out of the teardown's users-by-org
     delete, which a signature's FK to its signer would otherwise turn into a
     23503 that strands every fixture after it (observed on 2026-09-19, which is
     how signatures came to be excluded until 2026-09-24). */
  const signers = await owner.query(
    `INSERT INTO users (email,name,password_hash)
     VALUES ('wo03-fixture-signer-a@example.invalid','WO03 signer A','not-a-real-password'),
            ('wo03-fixture-signer-b@example.invalid','WO03 signer B','not-a-real-password')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, email`
  );
  const signerByEmail = new Map(signers.rows.map(r => [r.email as string, Number(r.id)]));
  signerA = signerByEmail.get('wo03-fixture-signer-a@example.invalid')!;
  signerB = signerByEmail.get('wo03-fixture-signer-b@example.invalid')!;

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

    /* ── The two domains added 2026-09-24 ────────────────────────────────── */
    // One fixture signature per org, reused for the life of the database:
    // looked up first, inserted only when absent, never deleted (§11.70).
    const sigHash = `wo03-fixture-signature-${side}`;
    const signer = side === 'A' ? signerA : signerB;
    const found = await owner.query(
      `SELECT id FROM electronic_signatures
        WHERE organization_id=$1 AND signature_hash=$2 ORDER BY id LIMIT 1`,
      [org, sigHash]
    );
    const sig =
      found.rows[0] ??
      (
        await owner.query(
          `INSERT INTO electronic_signatures
             (organization_id,signature_type,signature_purpose,signer_id,signer_name,signer_email,
              authentication_method,authentication_timestamp,signature_hash,signed_target)
           VALUES ($1,'approval',$2,$3,$4,$5,'password',NOW(),$6,$7) RETURNING id`,
          [
            org,
            `fixture-body-${side}`,
            signer,
            `WO03 signer ${side}`,
            `wo03-fixture-signer-${side.toLowerCase()}@example.invalid`,
            sigHash,
            `wo03-fixture-target-${side}`,
          ]
        )
      ).rows[0];
    ids[side].signatures = String(sig.id);

    const run = await owner.query(
      `INSERT INTO submission_orchestrator_runs
         (run_id,organization_id,submission_id,application_number,region,submission_type,started_at,status)
       VALUES (gen_random_uuid(),$1,$2,$3,'US','IND',NOW(),'complete') RETURNING run_id`,
      [org, `${TAG}-submission-${side}`, `fixture-body-${side}`]
    );
    ids[side].orchestrator_runs = String(run.rows[0].run_id);
  }

  tokenA = accessToken(userA, ORG_A);
  tokenB = accessToken(userB, ORG_B);
  invalidateOrgMembershipCache();
}

/** Clears everything the fixture, or a suite on it, left under the two reserved orgs. */
export async function teardownTwoTenantFixture(): Promise<void> {
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
        await cleanup.query(
          'DELETE FROM submission_orchestrator_runs WHERE organization_id=ANY($1::int[])',
          [FIXTURE_ORGS]
        );
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
        /* The two organization rows are NOT deleted, as of 2026-09-24. Each
           carries a fixture signature, which §11.70 makes permanent and which
           references its organization, so this delete could only ever fail with
           23503. provisionTwoTenantFixture upserts both ids on every run, so
           leaving them costs nothing; every row that hangs off them is removed
           above. This retires the property "no fixture org remains after a
           run", which could not coexist with signatures in the contract. */
      } finally {
        cleanup.release();
      }
    }
    await owner.end();
  }
}
