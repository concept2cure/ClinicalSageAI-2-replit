/**
 * The fixture both compliance-review-record suites share (P1-25 audit-trail
 * review, P1-43 access review; ADR-0014 §8):
 *
 *   compliance-review-records.dbtest.ts   the ceremony, its refusals, immutability
 *   compliance-review-reports.dbtest.ts   the reports that name the latest review
 *
 * Lane "dbcrr": organisations 93260 (A) and 93261 (B), users
 * `dbcrr-*@example.invalid`. A signature can never be deleted and references
 * its organisation and signer, so those are permanent and reused across runs,
 * as in research-admin-sign-ceremony.dbtest.ts. A signed review record refuses
 * DELETE too. cleanup() removes this lane's own rows as the table owner, each
 * store's guard off for that one transaction only, the way
 * compliance-reports.dbtest.ts removes its probe signatures, so each run starts
 * from no review at all.
 *
 * The stack is production's: createAuthBoundary (token → membership role →
 * tenant scope) and the compliance report router on the runtime pool, which
 * is app_service, NOSUPERUSER, NOBYPASSRLS, with app.rls_enforce=on.
 *
 * Fix round (DP-69, 2026-10-01). Each run makes the lane's memberships afresh,
 * so every one of them was created today: a member list read as of yesterday
 * is empty, which is the shape of probe (c). A review names a sealed report
 * run (recordRuns: one user access review and one audit trail integrity
 * attestation, run through the real report route). Three more plain members
 * exist for the carried-out remove cases.
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { sha256CanonicalJson } from '../../server/services/part11/signature-persistence';
import { databaseUrl } from '../setup.db';

export const ORG_A = 93260;
export const ORG_B = 93261;
export const ORGS = [ORG_A, ORG_B];
export const TAG = 'dbcrr';
export const PASSWORD = 'Dbcrr-Review-Record-2026!';
export const REASON = 'Recording the quarterly review for the P1-25 and P1-43 proof.';

export interface Person {
  id: number;
  token: string;
}
type Key = 'reviewer' | 'admin2' | 'member' | 'viewer' | 'reviewerB' | 'leaver' | 'scimLeaver' | 'deactivated';
export const people = {} as Record<Key, Person>;
export let owner: Pool;

const saved = { key: process.env.AUDIT_EXPORT_SIGNING_KEY, keyId: process.env.AUDIT_EXPORT_SIGNING_KEY_ID };

export async function mintToken(userId: number, org: number, role: string): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(org), role }, activeJwtSecret(), { expiresIn: '10m' });
}

export function auth(p: Person) {
  return { Authorization: `Bearer ${p.token}` };
}

/** A permanent user: reused across runs, password and standing reset each run. */
async function upsertUser(key: Key, org: number, role: string): Promise<Person> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${key.toLowerCase()}@example.invalid`, `Review ${key}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [org, id, role],
  );
  return { id, token: await mintToken(id, org, role) };
}

/** Remove a store's rows as its owner, with its named guard off for this one transaction. */
async function ownerDelete(c: PoolClient, table: string, trigger: string | null, where: string, params: unknown[]) {
  const present = (await c.query('SELECT to_regclass($1) IS NOT NULL AS ok', [table])).rows[0].ok as boolean;
  if (!present) return;
  const armed = trigger
    ? (await c.query('SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2', [table, trigger])).rows.length > 0
    : false;
  if (armed) await c.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  await c.query(`DELETE FROM ${table} WHERE ${where}`, params);
  if (armed) await c.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
}

/** Everything this lane wrote: review records, their signatures, the ledger pairs and audit rows. */
export async function cleanup(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await ownerDelete(c, 'public.compliance_review_records', 'trg_compliance_review_records_guard', 'organization_id = ANY($1::int[])', [ORGS]);
    await ownerDelete(
      c,
      'public.electronic_signatures',
      'trg_electronic_signatures_immutable',
      "organization_id = ANY($1::int[]) AND signed_target LIKE 'compliance-review:%'",
      [ORGS],
    );
    await ownerDelete(c, 'public.audit_logs', 'trg_audit_logs_no_delete', 'tenant_id = ANY($1::int[])', [ORGS]);
    await ownerDelete(c, 'public.audit_events', 'trg_audit_events_no_delete', 'organization_id = ANY($1::int[])', [ORGS]);
    await ownerDelete(c, 'public.c2c_ana_actions', 'trg_c2c_ana_actions_append_only', 'org_id = ANY($1::int[])', [ORGS]);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export async function provision(): Promise<void> {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbcrr] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
  process.env.AUDIT_EXPORT_SIGNING_KEY = `dbcrr-export-key-${'x'.repeat(32)}`;
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k-dbcrr';
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  for (const [id, suffix] of [[ORG_A, 'a'], [ORG_B, 'b']] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
       ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [id, `${TAG}-review-records-${suffix}`],
    );
  }
  await cleanup();
  // Every membership is made afresh, so each was created today (see the header).
  await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ORGS]);
  people.reviewer = await upsertUser('reviewer', ORG_A, 'admin');
  people.admin2 = await upsertUser('admin2', ORG_A, 'admin');
  people.member = await upsertUser('member', ORG_A, 'member');
  people.viewer = await upsertUser('viewer', ORG_A, 'viewer');
  people.reviewerB = await upsertUser('reviewerB', ORG_B, 'admin');
  people.leaver = await upsertUser('leaver', ORG_A, 'member');
  people.scimLeaver = await upsertUser('scimLeaver', ORG_A, 'member');
  people.deactivated = await upsertUser('deactivated', ORG_A, 'member');
}

export async function teardown(): Promise<void> {
  process.env.AUDIT_EXPORT_SIGNING_KEY = saved.key;
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = saved.keyId;
  if (!owner) return;
  await cleanup().catch((err) => console.warn('[dbcrr] cleanup left rows:', (err as Error).message));
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
}

/** The production stack: the auth boundary, then the compliance report router (which mounts the review routes). */
export async function stack(): Promise<express.Express> {
  const { createAuthBoundary } = await import('../../server/middleware/authBoundary');
  const { createComplianceReportRoutes } = await import('../../server/routes/audit-compliance-reports');
  const { getPool } = await import('../../server/db/runtime');
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthBoundary());
  a.use('/api', createComplianceReportRoutes(getPool()));
  return a;
}

/**
 * Run `fn` as the runtime role on its own transaction, stamped with `org` the
 * way a governed write stamps it. COMMIT is the last statement, so a deferred
 * guard's refusal is the promise's rejection.
 */
export async function asRuntime<T>(org: number, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const { getPool } = await import('../../server/db/runtime');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(org), role: 'admin', source: 'test', caller: 'dbcrr' }, async () => {
    const c = await getPool().connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [String(org)]);
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
  });
}

/**
 * A review of organisation A signed `signedAgo` before now, laid down as the
 * ceremony lays one down: the record and its `review` signature on one
 * transaction, which the database guard checks at COMMIT exactly as it checks
 * the ceremony's. The ceremony stamps the time it runs, and refuses a stale
 * period (DP-69), so a review signed in the past, or of an old period, can
 * only be written this way. Returns the record id.
 */
export async function laySignedReview(o: { kind: 'access' | 'audit_trail'; periodStart: string; periodEnd: string; signedAgo: string }): Promise<number> {
  const decisions = o.kind === 'access' ? [{ userId: people.reviewer.id, role: 'admin', decision: 'keep' }] : [];
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query(
      `INSERT INTO compliance_review_records (organization_id, kind, period_start, period_end, scope, outcome, decisions, reviewer_user_id)
       VALUES ($1, $2, $3::date, $4::date, $5::jsonb, 'Laid down by the dbcrr fixture.', $6::jsonb, $7)
       RETURNING id, organization_id, kind, period_start::text AS period_start, period_end::text AS period_end, scope, outcome, decisions, reviewer_user_id`,
      [ORG_A, o.kind, o.periodStart, o.periodEnd, JSON.stringify({ description: 'historic' }), JSON.stringify(decisions), people.reviewer.id],
    );
    const r = rows[0];
    const hash = sha256CanonicalJson({
      version: 1, id: r.id, organizationId: r.organization_id, kind: r.kind, periodStart: r.period_start, periodEnd: r.period_end,
      scope: r.scope, outcome: r.outcome, decisions: r.decisions, reviewerUserId: r.reviewer_user_id,
    });
    await c.query(
      `UPDATE compliance_review_records SET status = 'signed', content_hash = $2, signed_at = now() - $3::interval WHERE id = $1`,
      [r.id, hash, o.signedAgo],
    );
    await c.query(
      `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signature_meaning,
         signer_id, signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash, signature_manifest,
         is_valid, signed_at, binding_basis)
       VALUES ($1, $2, 'governed-action', 'historic fixture', 'review', $3, 'Review reviewer', 'dbcrr-reviewer@example.invalid',
               'password', now() - $5::interval, 'dbcrr-historic', $4::json, true, now() - $5::interval,
               'governed-action-sha256-chain')`,
      [ORG_A, `compliance-review:${r.id}`, people.reviewer.id, JSON.stringify({ act: { reviewId: r.id, contentHash: hash } }), o.signedAgo],
    );
    await c.query('COMMIT');
    return Number(r.id);
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

export interface RunReference {
  reportExportId: string;
  reportDataHash: string;
}
/** The sealed report run each kind of review names; filled by recordRuns(). */
export const runs = {} as Record<'access' | 'audit_trail', RunReference>;

/** Run a report through the real route (a fresh stack, so the run allowance is its own) and name it as a review does. */
export async function sealedRun(reportId: string, query: string, who: Person = people.reviewer): Promise<RunReference> {
  const res = await request(await stack()).get(`/api/audit/reports/${reportId}${query}`).set(auth(who));
  if (res.status !== 200) throw new Error(`[dbcrr] the ${reportId} run answered ${res.status}: ${JSON.stringify(res.body)}`);
  return { reportExportId: String(res.body.export.manifest.exportId), reportDataHash: String(res.body.export.manifest.dataHash) };
}

/** One user access review and one audit trail integrity attestation, run by organisation A's reviewer. */
export async function recordRuns(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  runs.access = await sealedRun('access-review', `?to=${today}`);
  runs.audit_trail = await sealedRun('audit-trail-integrity', `?from=2026-07-01&to=${today}`);
}

/** The decision lines a complete access review of organisation A carries: every privileged account, as it is now. */
export function decisionsForA(): Record<string, unknown>[] {
  return [
    { userId: people.reviewer.id, role: 'admin', decision: 'keep' },
    { userId: people.admin2.id, role: 'admin', decision: 'keep' },
  ];
}

export function accessDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    kind: 'access',
    periodStart: '2026-07-01',
    periodEnd: today,
    scope: { description: 'Members, roles and signing authority of organisation A, as listed by the user access review.', ...runs.access },
    outcome: 'Every privileged account was reviewed and kept.',
    decisions: decisionsForA(),
    ...overrides,
  };
}

export function auditTrailDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    kind: 'audit_trail',
    periodStart: '2026-07-01',
    periodEnd: today,
    scope: { description: 'Administrative changes, sign-in events and the integrity attestation for the quarter.', ...runs.audit_trail },
    outcome: 'No unexplained change was found. The integrity checks were intact.',
    decisions: [{ finding: 'Two role changes, both with a recorded reason.', action: 'None required.' }],
    ...overrides,
  };
}
