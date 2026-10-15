/**
 * P0-10a (DP-02): a research-administration sign is an electronic signature.
 *
 * ── The defect this pins (reproduced 2026-10-01, before the fix) ─────────────
 * Eleven routes on nine research-administration routers finalized, certified,
 * executed or approved a record and wrote a `command='sign'` ledger pair
 * (audit_logs + c2c_ana_actions) from a session alone: no password, no second
 * factor, no declared meaning, and no electronic_signatures row. A ledger reader
 * takes a `sign` row as a signature (21 CFR 11.50, 11.70, 11.200); nothing in
 * these routes made it one. Each reason is in scripts/ci/sign-ceremony-baseline.json.
 *
 * ── What is real and what is not ─────────────────────────────────────────────
 * Real: the production gate (authMiddleware with a signed access token), the
 * runtime role through APP_DATABASE_URL with RLS enforcing, reverifySigner with
 * the production wiring (bcrypt, lockout, account standing, TOTP), the ledger
 * pair, and the electronic_signatures writer. Stubbed: each route's domain
 * write (finalizeBiosketchTx and its ten siblings), so the case is the ceremony
 * and not the domain's readiness gate. A stub records that it ran, so "nothing
 * was written" covers the domain write too.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbras": organization 93210, users `dbras-*@example.invalid`. A
 * signature can never be deleted (trg_electronic_signatures_immutable) and it
 * references its organization and signer, so those three are permanent and are
 * reused across runs; each run signs targets numbered from a per-run base, so
 * no run reads another's rows. Ledger rows and committee fixtures are removed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { totp } from '../validation/lib/totp.mjs';

const stubs = vi.hoisted(() => {
  const ran: string[] = [];
  const refuse = { next: false };
  const step = (name: string, result: unknown) => async () => {
    if (refuse.next) {
      refuse.next = false;
      throw Object.assign(new Error('The record is not ready to be signed.'), { code: 'INVALID_STATE' });
    }
    ran.push(name);
    return result;
  };
  return { ran, refuse, step };
});

/* The per-signer attempt limit has its own suite (server/middleware/__tests__/
   signing-attempt-limiter.test.ts) and a budget of 10 per 5 minutes, which this
   file's ~40 requests from one signer would spend. It is replaced by a pass-through
   that records which scope guarded which request, so mounting is still proven. */
const attempts = vi.hoisted(() => ({ seen: [] as string[] }));
vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => (req: { originalUrl: string }, _res: unknown, next: () => void) => {
    attempts.seen.push(`${scope} ${req.originalUrl}`);
    next();
  },
}));

vi.mock('../../server/services/biosketch/biosketch-service', async (orig) => ({
  ...(await orig<object>()),
  finalizeBiosketchTx: stubs.step('biosketch', { completeness: { addressedPct: 100 } }),
}));
vi.mock('../../server/services/committees/committee-service', async (orig) => ({
  ...(await orig<object>()),
  finalizeAgendaItemTx: stubs.step('committees', { outcome: 'approved' }),
  getActorTrainingStatus: async () => ({ trained: true, reason: 'current' }),
}));
vi.mock('../../server/services/coverage-analysis/coverage-service', async (orig) => ({
  ...(await orig<object>()),
  finalizeAnalysisTx: stubs.step('coverage', { readiness: { ready: true } }),
}));
vi.mock('../../server/services/dmsp/dmsp-service', async (orig) => ({
  ...(await orig<object>()),
  finalizePlanTx: stubs.step('dmsp', { completeness: { addressedPct: 100 } }),
}));
vi.mock('../../server/services/effort-certification/effort-service', async (orig) => ({
  ...(await orig<object>()),
  certifyTx: stubs.step('effort', { contentHash: 'ab'.repeat(32), needsRecertification: false }),
}));
vi.mock('../../server/services/export-control/export-control-service', async (orig) => ({
  ...(await orig<object>()),
  determineReviewTx: stubs.step('export', { readiness: { assessment: { licenseRequired: false } } }),
}));
vi.mock('../../server/services/grants/grants-service', async (orig) => ({
  ...(await orig<object>()),
  finalizeCloseoutTx: stubs.step('closeout', { closedAward: true }),
  executeSubawardTx: stubs.step('subaward', undefined),
  approveNceTx: stubs.step('nce', { newEndDate: '2027-06-30' }),
}));
vi.mock('../../server/services/other-support/other-support-service', async (orig) => ({
  ...(await orig<object>()),
  certifyDocumentTx: stubs.step('other-support', { readiness: { summary: { active: { total: 1.2 } } } }),
}));
vi.mock('../../server/services/research-agreements/research-agreements-service', async (orig) => ({
  ...(await orig<object>()),
  executeAgreementTx: stubs.step('agreements', { executed: true }),
}));

const ORG = 93210;
const TAG = 'dbras';
const PASSWORD = 'Dbras-Research-Sign-2026!';
const REASON = 'Signing this record for the P0-10a ceremony proof.';
/** Per-run target numbers: signatures are permanent, so a run never reuses a target. */
const BASE = Math.floor(Date.now() / 1000) % 1_000_000_000;

interface Route {
  key: string;
  mount: string;
  path: (id: number) => string;
  target: (id: number) => string;
  extra?: Record<string, unknown>;
}

/** The eleven sign routes, as server/bootstrap/register-inline-routes.ts mounts them. */
const ROUTES: Route[] = [
  { key: 'biosketch', mount: '/api/biosketch', path: (id) => `/biosketches/${id}/finalize`, target: (id) => `biosketch:${id}` },
  { key: 'committees', mount: '/api/committees', path: (id) => `/agenda/${id}/finalize`, target: (id) => `committee-agenda:${id}` },
  { key: 'coverage', mount: '/api/coverage-analysis', path: (id) => `/analyses/${id}/finalize`, target: (id) => `coverage-analysis:${id}` },
  { key: 'dmsp', mount: '/api/dmsp', path: (id) => `/plans/${id}/finalize`, target: (id) => `dms-plan:${id}` },
  { key: 'effort', mount: '/api/effort-certification', path: (id) => `/${id}/certify`, target: (id) => `effort-certification:${id}` },
  { key: 'export', mount: '/api/export-control', path: (id) => `/reviews/${id}/determine`, target: (id) => `export-control:${id}` },
  { key: 'closeout', mount: '/api/grants', path: (id) => `/awards/${id}/closeout/finalize`, target: (id) => `grant-award:${id}` },
  { key: 'subaward', mount: '/api/grants', path: (id) => `/subawards/${id}/execute`, target: (id) => `grant-subaward:${id}` },
  { key: 'nce', mount: '/api/grants', path: (id) => `/nce/${id}/approve`, target: (id) => `grant-nce:${id}`, extra: { authority: 'grantee' } },
  { key: 'other-support', mount: '/api/other-support', path: (id) => `/documents/${id}/certify`, target: (id) => `other-support:${id}` },
  { key: 'agreements', mount: '/api/research-agreements', path: (id) => `/agreements/${id}/execute`, target: (id) => `research-agreement:${id}` },
];

type Case = 'bare' | 'wrong' | 'signed' | 'meaning' | 'refused' | 'no-authority' | 'mfa-bare' | 'mfa-signed';
const CASES: Case[] = ['bare', 'wrong', 'signed', 'meaning', 'refused', 'no-authority', 'mfa-bare', 'mfa-signed'];

let owner: Pool;
let app: express.Express;
let signer: { id: number; token: string };
let mfaSigner: { id: number; token: string; secret: string };
let viewer: { id: number; token: string };
let meetingId: number | null = null;
/** committee agenda items, one per route case: the committees route reads the row before it signs. */
const agenda = new Map<Case, number>();

function idFor(route: Route, c: Case): number {
  if (route.key === 'committees') return agenda.get(c)!;
  return BASE + ROUTES.indexOf(route) * 10 + CASES.indexOf(c);
}

async function mintToken(userId: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), {
    expiresIn: '10m',
  });
}

/** A permanent signer: reused across runs, password and standing reset each run. */
async function upsertSigner(key: string, role = 'admin'): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `Research Signer ${key}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id, role],
  );
  return id;
}

async function enrolTotp(userId: number, email: string): Promise<string> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const mfa = await import('../../server/services/mfaService');
  return runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: 'dbras:enrol' }, async () => {
    const { secret } = await mfa.generateSecret(userId, email);
    const enabled = await mfa.enableMfa(userId, totp(secret, Date.now()));
    if (!enabled.success) throw new Error('[dbras] TOTP enrolment was refused');
    return secret;
  });
}

async function clearLedger(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    // audit_logs is append-only on the deploy path; a suite removes its own rows as the
    // owner with the DELETE trigger off for this transaction only (signing-lockout.dbtest.ts).
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [ORG]);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    // c2c_ana_actions is append-only too since P1-24 (20261001_domain_history_append_only.sql);
    // the same owner-side removal, its trigger off for this transaction only. Guarded so the
    // suite also runs against a database that predates that file.
    const { rows: ledgerTrigger } = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_c2c_ana_actions_append_only' AND tgrelid = 'public.c2c_ana_actions'::regclass`,
    );
    if (ledgerTrigger.length > 0) await client.query('ALTER TABLE c2c_ana_actions DISABLE TRIGGER trg_c2c_ana_actions_append_only');
    await client.query('DELETE FROM c2c_ana_actions WHERE org_id = $1', [ORG]);
    if (ledgerTrigger.length > 0) await client.query('ALTER TABLE c2c_ana_actions ENABLE TRIGGER trg_c2c_ana_actions_append_only');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM committee_agenda_items WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM committee_meetings WHERE organization_id = $1', [ORG]);
}

/** Everything written for a target: the ledger pair, the signature row, the domain write. */
async function written(target: string) {
  const ledger = await owner.query(`SELECT id, xmin::text AS xmin FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 AND command = 'sign'`, [ORG, target]);
  const audit = await owner.query(`SELECT id, ana_action_id, xmin::text AS xmin FROM audit_logs WHERE tenant_id = $1 AND target = $2`, [ORG, target]);
  const signatures = await owner.query(
    `SELECT signer_id, signature_meaning, authentication_method, second_factor_verified, signature_manifest,
            binding_basis, signature_purpose, xmin::text AS xmin
       FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2`,
    [ORG, target],
  );
  return { ledger: ledger.rows, audit: audit.rows, signatures: signatures.rows };
}

function post(route: Route, c: Case, body: Record<string, unknown>, token = signer.token) {
  return request(app)
    .post(`${route.mount}${route.path(idFor(route, c))}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: REASON, ...(route.extra ?? {}), ...body });
}

/** The request went through the shared per-signer attempt limit before the handler. */
function expectAttemptLimited(route: Route, c: Case): void {
  expect(attempts.seen, `${route.key}: no signing-attempt limit in front of the sign`).toContain(
    `governed-signed-act ${route.mount}${route.path(idFor(route, c))}`,
  );
}

async function expectNothingWritten(route: Route, c: Case): Promise<void> {
  const rows = await written(route.target(idFor(route, c)));
  expect(rows.ledger, `${route.key}: a refused sign wrote a ledger row`).toEqual([]);
  expect(rows.audit, `${route.key}: a refused sign wrote an audit row`).toEqual([]);
  expect(rows.signatures, `${route.key}: a refused sign wrote a signature row`).toEqual([]);
  expect(stubs.ran, `${route.key}: the domain write ran for a refused sign`).not.toContain(route.key);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbras] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbras-mfa-encryption-key-at-least-32-chars';
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-research-admin-signing`],
  );
  await clearLedger();
  const signerId = await upsertSigner('signer');
  const mfaId = await upsertSigner('mfa-signer');
  const secret = await enrolTotp(mfaId, `${TAG}-mfa-signer@example.invalid`);
  signer = { id: signerId, token: await mintToken(signerId) };
  mfaSigner = { id: mfaId, token: await mintToken(mfaId), secret };
  const viewerId = await upsertSigner('viewer', 'viewer');
  viewer = { id: viewerId, token: await mintToken(viewerId) };

  const meeting = await owner.query(
    `INSERT INTO committee_meetings (organization_id, committee_type, title, created_by) VALUES ($1, 'irb', $2, $3) RETURNING id`,
    [ORG, `${TAG} meeting`, signerId],
  );
  meetingId = Number(meeting.rows[0].id);
  for (const c of CASES) {
    const item = await owner.query(
      `INSERT INTO committee_agenda_items (organization_id, meeting_id, committee_type, protocol_kind, protocol_id, title, status, created_by)
       VALUES ($1, $2, 'irb', 'irb_submission', $3, $4, 'voted', $5) RETURNING id`,
      [ORG, meetingId, BASE, `${TAG} ${c}`, signerId],
    );
    agenda.set(c, Number(item.rows[0].id));
  }

  const { authMiddleware } = await import('../../server/auth');
  const routers = {
    '/api/biosketch': (await import('../../server/routes/biosketch')).default,
    '/api/committees': (await import('../../server/routes/committees')).default,
    '/api/coverage-analysis': (await import('../../server/routes/coverage-analysis')).default,
    '/api/dmsp': (await import('../../server/routes/dmsp')).default,
    '/api/effort-certification': (await import('../../server/routes/effort-certification')).default,
    '/api/export-control': (await import('../../server/routes/export-control')).default,
    '/api/grants': (await import('../../server/routes/grants')).default,
    '/api/other-support': (await import('../../server/routes/other-support')).default,
    '/api/research-agreements': (await import('../../server/routes/research-agreements')).default,
  };
  app = express();
  app.use(express.json());
  for (const [mount, router] of Object.entries(routers)) app.use(mount, authMiddleware, router);
}, 120_000);

beforeEach(async () => {
  stubs.ran.length = 0;
  stubs.refuse.next = false;
  attempts.seen.length = 0;
  // A wrong password counts against the account (VSR-001 F-27); every case starts unlocked.
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ANY($1::int[])', [
    [signer.id, mfaSigner.id, viewer.id],
  ]);
});

afterAll(async () => {
  if (!owner) return;
  await clearLedger().catch((err) => console.warn('[dbras] cleanup left rows:', (err as Error).message));
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe.each(ROUTES)('$key: the sign is an electronic signature', (route) => {
  it('refuses a sign without credentials, and writes nothing', async () => {
    const res = await post(route, 'bare', {});
    expect(res.status, `${route.key} signed with a session alone: ${JSON.stringify(res.body)}`).toBe(400);
    expect(res.body.error?.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    await expectNothingWritten(route, 'bare');
    expectAttemptLimited(route, 'bare');
  });

  it('refuses a wrong password, and writes nothing', async () => {
    const res = await post(route, 'wrong', { meaning: 'approval', password: 'not-the-password' });
    expect(res.status, `${route.key} accepted a wrong password: ${JSON.stringify(res.body)}`).toBe(401);
    expect(res.body.error?.code).toBe('PASSWORD_VERIFICATION_FAILED');
    await expectNothingWritten(route, 'wrong');
    expectAttemptLimited(route, 'wrong');
  });

  it('with the ceremony, writes the ledger pair and the signature row in one transaction', async () => {
    const target = route.target(idFor(route, 'signed'));
    const res = await post(route, 'signed', { meaning: 'approval', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await written(target);
    expect(rows.ledger, `${route.key}: no sign ledger row`).toHaveLength(1);
    expect(rows.audit, `${route.key}: no audit row`).toHaveLength(1);
    expect(rows.signatures, `${route.key}: the sign has no electronic_signatures row`).toHaveLength(1);
    const [action] = rows.ledger;
    const [audit] = rows.audit;
    const [sig] = rows.signatures;
    expect(audit.ana_action_id).toBe(action.id);
    expect(sig).toMatchObject({
      signer_id: signer.id,
      signature_meaning: 'approval',
      authentication_method: 'password',
      second_factor_verified: false,
      signature_purpose: REASON,
    });
    expect(sig.signature_manifest).toMatchObject({ actionId: action.id, auditId: audit.id, target, meaning: 'approval' });
    // One transaction: every row carries the same inserting transaction id.
    expect(new Set([action.xmin, audit.xmin, sig.xmin]).size, `${route.key}: rows from more than one transaction`).toBe(1);
    expect(res.body).toMatchObject({ actionId: action.id, meaning: 'approval' });
    expect(res.body.signatureId).toBeTruthy();
    expect(stubs.ran).toEqual([route.key]);
  });
});

describe('the ceremony refuses before it writes', () => {
  const route = ROUTES[0];

  it('a meaning outside the closed vocabulary is refused before the password is checked', async () => {
    const res = await post(route, 'meaning', { meaning: 'endorsed', password: 'not-the-password' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('SIGNATURE_MEANING_UNKNOWN');
    await expectNothingWritten(route, 'meaning');
    const { rows } = await owner.query('SELECT failed_login_attempts FROM users WHERE id = $1', [signer.id]);
    expect(Number(rows[0].failed_login_attempts ?? 0), 'a refused meaning spent a password guess').toBe(0);
  });

  it('a member whose role carries no signing authority is refused, with the right password, before it is checked (§11.10(g))', async () => {
    const res = await post(route, 'no-authority', { meaning: 'approval', password: PASSWORD }, viewer.token);
    expect(res.status, `a viewer signed: ${JSON.stringify(res.body)}`).toBe(403);
    expect(res.body.error?.code).toBe('ESIGNATURE_NO_AUTHORITY');
    await expectNothingWritten(route, 'no-authority');
    const { rows } = await owner.query('SELECT failed_login_attempts FROM users WHERE id = $1', [viewer.id]);
    expect(Number(rows[0].failed_login_attempts ?? 0)).toBe(0);
  });

  it('a domain refusal after the credential rolls the whole sign back', async () => {
    stubs.refuse.next = true;
    const res = await post(route, 'refused', { meaning: 'approval', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATE');
    await expectNothingWritten(route, 'refused');
  });
});

describe('a signer with an enrolled second factor', () => {
  const route = ROUTES[0];

  it('cannot sign with the password alone', async () => {
    const res = await post(route, 'mfa-bare', { meaning: 'approval', password: PASSWORD }, mfaSigner.token);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code).toBe('MFA_TOKEN_REQUIRED');
    await expectNothingWritten(route, 'mfa-bare');
  });

  it('signs with the password and a current code, and the row says both were verified', async () => {
    // Enrolment consumed the current step's code; the next step's is inside the window and unused.
    const mfaToken = totp(mfaSigner.secret, Date.now() + 30_000);
    const res = await post(route, 'mfa-signed', { meaning: 'approval', password: PASSWORD, mfaToken }, mfaSigner.token);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await written(route.target(idFor(route, 'mfa-signed')));
    expect(rows.signatures).toHaveLength(1);
    expect(rows.signatures[0]).toMatchObject({
      signer_id: mfaSigner.id,
      authentication_method: 'password+mfa',
      second_factor_verified: true,
    });
  });
});
