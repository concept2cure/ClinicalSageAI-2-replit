/**
 * P0-10b (DP-02): an approval or sign-off outside research administration that
 * writes a `sign` ledger row is an electronic signature, on a real database.
 *
 * ── The defect this pins (reproduced 2026-10-01, before the fix) ─────────────
 * Seven routes (IRB, IACUC and IBC approvals, a RIM label recorded as approved,
 * consent-form approval, deviation closure, BLA assessment sign-off) wrote a
 * `command='sign'` ledger pair from a session alone: no password, no meaning, no
 * electronic_signatures row. Three CMC signatures (batch release, specification
 * approval, register qualification) re-authenticated the signer and still wrote
 * no electronic_signatures row. Each reason is in
 * scripts/ci/sign-ceremony-baseline.json.
 *
 * ── What is real and what is not ─────────────────────────────────────────────
 * Real: authMiddleware with a signed access token, the runtime role through
 * APP_DATABASE_URL with RLS enforcing, reverifySigner / verifyReauth with the
 * production wiring, the ledger pair and the electronic_signatures writer, and
 * the BLA and CMC handlers' own SQL against their own tables. Stubbed: the six
 * research-route service writes (recordReviewTx and siblings), so the case is
 * the ceremony and not the domain's readiness gate; a stub records that it ran,
 * so "nothing was written" covers the domain write too. The Module 3 link the
 * CMC routes run after COMMIT is stubbed (it is not the signature).
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbdsc": organization 93220, users `dbdsc-*@example.invalid`. A signature
 * can never be deleted (trg_electronic_signatures_immutable) and references its
 * organization and signer, so those are permanent and reused; every target is
 * new per run (a per-run number, or a fresh row id). Ledger rows and the BLA,
 * CMC, IRB, IACUC and IBC fixture rows are removed.
 *
 * Fix round (2026-10-01), each reproduced here before its fix: a viewer signed
 * the three CMC acts (no §11.10(g) check); PATCH .../status set 'approved' on an
 * IRB submission, IACUC protocol and IBC registration with no signature or
 * review; a rejected batch was signed 'release'; a specification created with
 * approvalStatus 'approved' was stored approved.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const stubs = vi.hoisted(() => {
  const ran: string[] = [];
  const step = (name: string, result: unknown) => async () => {
    ran.push(name);
    return result;
  };
  return { ran, step };
});

/* The per-signer attempt limit has its own suite; this file's requests from
   one signer would spend its budget. A pass-through records which scope
   guarded which request, so mounting is still proven. */
const attempts = vi.hoisted(() => ({ seen: [] as string[] }));
vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => (req: { originalUrl: string }, _res: unknown, next: () => void) => {
    attempts.seen.push(`${scope} ${req.originalUrl}`);
    next();
  },
}));
const review = { reviewId: 1, expirationDate: null, provenanceLinkId: null };
vi.mock('../../server/services/irb/irb-service', async (orig) => ({ ...(await orig<object>()), recordReviewTx: stubs.step('irb', review) }));
vi.mock('../../server/services/iacuc/iacuc-service', async (orig) => ({ ...(await orig<object>()), recordReviewTx: stubs.step('iacuc', review) }));
vi.mock('../../server/services/ibc/ibc-service', async (orig) => ({ ...(await orig<object>()), recordReviewTx: stubs.step('ibc', review) }));
vi.mock('../../server/services/rim/rim-service', async (orig) => ({ ...(await orig<object>()), addLabelTx: stubs.step('rim', { id: 1, supersededCount: 0 }) }));
vi.mock('../../server/services/protocol-consent/protocol-consent-service', async (orig) => ({
  ...(await orig<object>()),
  approveConsentFormTx: stubs.step('consent', { approved: true, completeness: { requiredPresentPct: 100 } }),
}));
vi.mock('../../server/services/protocol-deviations/protocol-deviations-service', async (orig) => ({
  ...(await orig<object>()),
  closeDeviationTx: stubs.step('deviations', { closed: true }),
}));
vi.mock('../../server/services/cmc/link-to-module3', () => ({
  linkToModule3: async () => ({ module3Linked: false, module3Warning: 'Module 3 linkage is not under test here.' }),
}));

const ORG = 93220;
const TAG = 'dbdsc';
const PASSWORD = 'Dbdsc-Domain-Sign-2026!';
const REASON = 'Signing this record for the P0-10b ceremony proof.';
/** Per-run target numbers: signatures are permanent, so a run never reuses a target. */
const BASE = Math.floor(Date.now() / 1000) % 1_000_000_000;

type Case = 'bare' | 'wrong' | 'signed' | 'viewer' | 'rejected';
const CASES: Case[] = ['bare', 'wrong', 'signed', 'viewer'];
/** Fixture rows are made for these; 'rejected' is the batch disposition case. */
const ROW_CASES: Case[] = [...CASES, 'rejected'];

interface Route {
  key: string;
  mount: string;
  path: (id: string) => string;
  target: (id: string) => string;
  /** The act's own fields. */
  act: Record<string, unknown>;
  /** The BLA and CMC handlers read a real row: one per case, made in beforeAll. */
  rows?: 'bla' | 'batch' | 'spec' | 'closure';
  /** The router mounts requireEditorAccessForWrites, which refuses a viewer before the ceremony
   *  (IRB, IACUC, IBC, RIM and BLA joined consent and deviations on 2026-10-01). */
  writeGate?: true;
}

/** The seven routes that now run signGovernedAct (body: meaning, password, mfaToken). */
const CEREMONY: Route[] = [
  { key: 'irb', mount: '/api/irb', path: (id) => `/submissions/${id}/reviews`, target: (id) => `irb-submission:${id}`, act: { reviewType: 'full_board', outcome: 'approved' }, writeGate: true },
  { key: 'iacuc', mount: '/api/iacuc', path: (id) => `/protocols/${id}/reviews`, target: (id) => `iacuc-protocol:${id}`, act: { reviewType: 'full_committee_review', outcome: 'approved' }, writeGate: true },
  { key: 'ibc', mount: '/api/ibc', path: (id) => `/registrations/${id}/reviews`, target: (id) => `ibc-registration:${id}`, act: { outcome: 'approved' }, writeGate: true },
  { key: 'rim', mount: '/api/rim', path: (id) => `/products/${id}/labels`, target: (id) => `rim-product:${id}`, act: { labelType: 'uspi', status: 'approved' }, writeGate: true },
  { key: 'consent', mount: '/api/protocol-consent', path: (id) => `/forms/${id}/approve`, target: (id) => `consent-form:${id}`, act: {}, writeGate: true },
  { key: 'deviations', mount: '/api/protocol-deviations', path: (id) => `/deviations/${id}/close`, target: (id) => `protocol-deviation:${id}`, act: {}, writeGate: true },
  { key: 'bla', mount: '/api/biopharma/bla', path: (id) => `/assessments/${id}/sign`, target: (id) => `bla_assessment:${id}`, act: {}, rows: 'bla', writeGate: true },
];

/** The three CMC signatures: they re-authenticated already (verifyReauth, body `reauth`) and now write the row. */
const CMC: Route[] = [
  {
    key: 'batch', mount: '/api/cmc/batch-records', path: (id) => `/${id}/release`, target: (id) => `batch:${id}`,
    act: { decision: 'approved', releasedBy: 'QA Head', releaseTesting: { assay: 'pass' } }, rows: 'batch',
  },
  { key: 'spec', mount: '/api/cmc/specifications', path: (id) => `/${id}/approve`, target: (id) => `specification:${id}`, act: { meaning: 'approval' }, rows: 'spec' },
  { key: 'closure', mount: '/api/cmc', path: (id) => `/container-closures/${id}/qualify`, target: (id) => `container_closure:${id}`, act: { meaning: 'approval' }, rows: 'closure' },
];

let owner: Pool;
let app: express.Express;
let signer: { id: number; token: string };
/** A member whose role carries no signing authority, with a password of their own. */
let viewer: { id: number; token: string };
const fixtureRows = new Map<string, string>();

function idFor(route: Route, c: Case): string {
  if (route.rows) return fixtureRows.get(`${route.key}:${c}`)!;
  return String(BASE + CEREMONY.indexOf(route) * 10 + CASES.indexOf(c));
}

async function mintToken(userId: number, role = 'admin'): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(ORG), role }, activeJwtSecret(), { expiresIn: '10m' });
}

/** A permanent member: reused across runs, password, standing and role reset each run. */
async function upsertMember(who: 'signer' | 'viewer', role: 'admin' | 'viewer'): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${who}@example.invalid`, who === 'signer' ? 'Domain Signer' : 'Domain Viewer', await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id, role],
  );
  return id;
}

/** One BLA assessment and one row per CMC register, per case, in this organization. */
async function makeFixtureRows(): Promise<void> {
  for (const c of ROW_CASES) {
    const bla = await owner.query(`INSERT INTO c2c_bla_assessments (org_id, kind, title) VALUES ($1, 'comparability', $2) RETURNING id`, [ORG, `${TAG} ${c}`]);
    fixtureRows.set(`bla:${c}`, String(bla.rows[0].id));
    const batch = await owner.query(
      `INSERT INTO cmc_batch_records (organization_id, tenant_id, project_id, batch_number, product_name, status)
       VALUES ($1, $2, gen_random_uuid(), $3, 'Dbdsc 5 mg', 'in-progress') RETURNING id, project_id`,
      [ORG, String(ORG), `${TAG}-${BASE}-${c}`],
    );
    fixtureRows.set(`batch:${c}`, String(batch.rows[0].id));
    /* A release is signed over the batch's RECORDED, reviewed QC results
       (services/cmc/batch-release-evidence): one passing result, reviewed. */
    await owner.query(
      `INSERT INTO qc_testing (organization_id, sample_id, sample_type, batch_number, project_id, test_method, test_date, pass_fail_status, reviewed_by)
       VALUES ($1, $2, 'drug substance', $3, $4, 'AM-001', NOW(), 'pass', $5)`,
      [ORG, `${TAG}-${c}-S1`, `${TAG}-${BASE}-${c}`, String(batch.rows[0].project_id), signer.id],
    );
    const spec = await owner.query(
      `INSERT INTO quality_specifications (tenant_id, material_type, material_name) VALUES ($1, 'drug_substance', $2) RETURNING id`,
      [ORG, `${TAG} ${c}`],
    );
    fixtureRows.set(`spec:${c}`, String(spec.rows[0].id));
    const closure = await owner.query(
      `INSERT INTO cmc_container_closures (organization_id, system_name, container_description, closure_description)
       VALUES ($1, $2, 'Type I glass vial', 'Bromobutyl stopper') RETURNING id`,
      [ORG, `${TAG} ${c}`],
    );
    fixtureRows.set(`closure:${c}`, String(closure.rows[0].id));
  }
}

async function cleanup(): Promise<void> {
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
  await owner.query('DELETE FROM c2c_bla_assessments WHERE org_id = $1', [ORG]);
  await owner.query('DELETE FROM specification_audit_log WHERE specification_id IN (SELECT id FROM quality_specifications WHERE tenant_id = $1)', [ORG]);
  await owner.query('DELETE FROM quality_specifications WHERE tenant_id = $1', [ORG]);
  await owner.query('DELETE FROM qc_testing WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM cmc_batch_records WHERE organization_id = $1', [ORG]);
  await owner.query('DELETE FROM cmc_container_closures WHERE organization_id = $1', [ORG]);
  for (const table of ['irb_submissions', 'iacuc_protocols', 'ibc_registrations']) {
    await owner.query(`DELETE FROM ${table} WHERE organization_id = $1`, [ORG]);
  }
}

/** Everything written for a target: the ledger pair and the signature row. */
async function written(target: string) {
  const ledger = await owner.query(`SELECT id, command, xmin::text AS xmin FROM c2c_ana_actions WHERE org_id = $1 AND target = $2`, [ORG, target]);
  const audit = await owner.query(`SELECT id, ana_action_id, xmin::text AS xmin FROM audit_logs WHERE tenant_id = $1 AND target = $2`, [ORG, target]);
  const signatures = await owner.query(
    `SELECT signer_id, signature_meaning, authentication_method, second_factor_verified, signature_manifest,
            binding_basis, signature_purpose, xmin::text AS xmin
       FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2`,
    [ORG, target],
  );
  return { ledger: ledger.rows, audit: audit.rows, signatures: signatures.rows };
}

function post(route: Route, c: Case, body: Record<string, unknown>, as: { token: string } = signer) {
  return request(app)
    .post(`${route.mount}${route.path(idFor(route, c))}`)
    .set('Authorization', `Bearer ${as.token}`)
    .send({ reason: REASON, ...route.act, ...body });
}

/** The CMC record's own signed column, read as the owner. */
async function cmcSignedState(route: Route, c: Case): Promise<unknown> {
  const sql: Record<string, string> = {
    batch: 'SELECT release_status AS v FROM cmc_batch_records WHERE id = $1',
    spec: 'SELECT approval_status AS v FROM quality_specifications WHERE id = $1',
    closure: 'SELECT status AS v FROM cmc_container_closures WHERE id = $1',
  };
  const { rows } = await owner.query(sql[route.key], [idFor(route, c)]);
  return rows[0]?.v ?? null;
}

async function expectNothingWritten(route: Route, c: Case): Promise<void> {
  const rows = await written(route.target(idFor(route, c)));
  expect(rows.ledger, `${route.key}: a refused sign wrote a ledger row`).toEqual([]);
  expect(rows.audit, `${route.key}: a refused sign wrote an audit row`).toEqual([]);
  expect(rows.signatures, `${route.key}: a refused sign wrote a signature row`).toEqual([]);
  expect(stubs.ran, `${route.key}: the domain write ran for a refused sign`).not.toContain(route.key);
}

/** The ledger pair and one electronic_signatures row, from one transaction, naming the signer. */
async function expectSignedTogether(route: Route, c: Case, meaning: string): Promise<void> {
  const target = route.target(idFor(route, c));
  const rows = await written(target);
  expect(rows.ledger.map((r) => r.command), `${route.key}: no sign ledger row`).toEqual(['sign']);
  expect(rows.audit, `${route.key}: no audit row`).toHaveLength(1);
  expect(rows.signatures, `${route.key}: the sign has no electronic_signatures row`).toHaveLength(1);
  const [action] = rows.ledger;
  const [audit] = rows.audit;
  const [sig] = rows.signatures;
  expect(audit.ana_action_id).toBe(action.id);
  expect(sig).toMatchObject({
    signer_id: signer.id,
    signature_meaning: meaning,
    authentication_method: 'password',
    second_factor_verified: false,
    signature_purpose: REASON,
    // No content basis is registered for these records, and none is claimed.
    binding_basis: 'governed-action-sha256-chain',
  });
  expect(sig.signature_manifest).toMatchObject({ actionId: action.id, auditId: audit.id, target, meaning, signerName: 'Domain Signer' });
  expect(new Set([action.xmin, audit.xmin, sig.xmin]).size, `${route.key}: rows from more than one transaction`).toBe(1);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbdsc] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-domain-signing`],
  );
  await cleanup();
  const signerId = await upsertMember('signer', 'admin');
  signer = { id: signerId, token: await mintToken(signerId) };
  const viewerId = await upsertMember('viewer', 'viewer');
  viewer = { id: viewerId, token: await mintToken(viewerId, 'viewer') };
  await makeFixtureRows();

  const { authMiddleware } = await import('../../server/auth');
  const routers: Array<[string, express.Router]> = [
    ['/api/irb', (await import('../../server/routes/irb')).default],
    ['/api/iacuc', (await import('../../server/routes/iacuc')).default],
    ['/api/ibc', (await import('../../server/routes/ibc')).default],
    ['/api/rim', (await import('../../server/routes/rim')).default],
    ['/api/protocol-consent', (await import('../../server/routes/protocol-consent')).default],
    ['/api/protocol-deviations', (await import('../../server/routes/protocol-deviations')).default],
    ['/api/biopharma/bla', (await import('../../server/routes/biopharma/bla-workbench')).default],
    ['/api/cmc/batch-records', (await import('../../server/api/cmc/batchRecordRoutes')).default],
    ['/api/cmc/specifications', (await import('../../server/api/cmc/specificationRoutes')).default],
    ['/api/cmc', (await import('../../server/api/cmc/routes')).default],
  ];
  app = express();
  app.use(express.json());
  for (const [mount, router] of routers) app.use(mount, authMiddleware, router);
}, 120_000);

beforeEach(async () => {
  stubs.ran.length = 0;
  attempts.seen.length = 0;
  // A wrong password counts against the account (VSR-001 F-27); every case starts unlocked.
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ANY($1::int[])', [[signer.id, viewer.id]]);
});

afterAll(async () => {
  if (!owner) return;
  await cleanup().catch((err) => console.warn('[dbdsc] cleanup left rows:', (err as Error).message));
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe.each(CEREMONY)('$key: the approval is an electronic signature', (route) => {
  it('refuses a sign without credentials, and writes nothing', async () => {
    const res = await post(route, 'bare', {});
    expect(res.status, `${route.key} signed with a session alone: ${JSON.stringify(res.body)}`).toBe(400);
    expect(res.body.error?.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    await expectNothingWritten(route, 'bare');
  });

  it('refuses a wrong password, and writes nothing', async () => {
    const res = await post(route, 'wrong', { meaning: 'approval', password: 'not-the-password' });
    expect(res.status, `${route.key} accepted a wrong password: ${JSON.stringify(res.body)}`).toBe(401);
    expect(res.body.error?.code).toBe('PASSWORD_VERIFICATION_FAILED');
    await expectNothingWritten(route, 'wrong');
  });

  it('with the ceremony, writes the act, the ledger pair and the signature row in one transaction', async () => {
    const res = await post(route, 'signed', { meaning: 'approval', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await expectSignedTogether(route, 'signed', 'approval');
    expect(res.body.signatureId).toBeTruthy();
    expect(attempts.seen, `${route.key}: no signing-attempt limit in front of the sign`).toContain(
      `governed-signed-act ${route.mount}${route.path(idFor(route, 'signed'))}`,
    );
    if (!route.rows) expect(stubs.ran).toEqual([route.key]);
  });

  it('refuses a viewer who knows their own password (§11.10(g)), and writes nothing', async () => {
    const res = await post(route, 'viewer', { meaning: 'approval', password: PASSWORD }, viewer);
    expect(res.status, `${route.key}: a viewer signed: ${JSON.stringify(res.body)}`).toBe(403);
    if (!route.writeGate) expect(res.body.error?.code).toBe('ESIGNATURE_NO_AUTHORITY');
    await expectNothingWritten(route, 'viewer');
  });
});

describe('a determination that is not an approval is not a signature', () => {
  it('an IRB deferral is recorded under resolve, with no password and no signature row', async () => {
    const route = CEREMONY[0];
    const id = String(BASE + 900);
    const res = await request(app)
      .post(`${route.mount}${route.path(id)}`)
      .set('Authorization', `Bearer ${signer.token}`)
      .send({ reason: REASON, reviewType: 'full_board', outcome: 'deferred' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await written(route.target(id));
    expect(rows.ledger.map((r) => r.command)).toEqual(['resolve']);
    expect(rows.signatures).toEqual([]);
    expect(attempts.seen.filter((s) => s.includes(id)), 'a deferral was metered as a signing attempt').toEqual([]);
  });
});

describe.each(CMC)('CMC $key: the signature row lands with the ledger sign', (route) => {
  it('refuses a sign without credentials, and writes nothing', async () => {
    const res = await post(route, 'bare', {});
    expect(res.status, JSON.stringify(res.body)).toBe(401);
    await expectNothingWritten(route, 'bare');
  });

  it('refuses a wrong password, and writes nothing', async () => {
    const res = await post(route, 'wrong', { reauth: { password: 'not-the-password' } });
    expect(res.status, JSON.stringify(res.body)).toBe(401);
    await expectNothingWritten(route, 'wrong');
  });

  it('with re-authentication, writes the ledger pair and the electronic_signatures row in one transaction', async () => {
    const res = await post(route, 'signed', { reauth: { password: PASSWORD } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await expectSignedTogether(route, 'signed', route.key === 'batch' ? 'release' : 'approval');
  });

  it('refuses a viewer who knows their own password (§11.10(g)), and changes nothing', async () => {
    const before = await cmcSignedState(route, 'viewer');
    const res = await post(route, 'viewer', { reauth: { password: PASSWORD } }, viewer);
    expect(res.status, `${route.key}: a viewer signed: ${JSON.stringify(res.body)}`).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
    await expectNothingWritten(route, 'viewer');
    expect(await cmcSignedState(route, 'viewer')).toEqual(before);
  });
});

describe('CMC batch release: a rejected batch is not signed as released', () => {
  it("signs a rejection with meaning 'responsibility', on the ledger and the signature row", async () => {
    const route = CMC[0];
    const res = await post(route, 'rejected', { decision: 'rejected', reauth: { password: PASSWORD } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    await expectSignedTogether(route, 'rejected', 'responsibility');
    expect(await cmcSignedState(route, 'rejected')).toBe('rejected');
  });
});

/*
 * The second door: PATCH .../status set the status a committee determination
 * sets, 'approved' included, under a 'transition' ledger row, with no signature
 * and no review. Real rows, the runtime role, RLS on.
 */
const STATUS_DOORS = [
  {
    key: 'irb', mount: '/api/irb', path: (id: string) => `/submissions/${id}/status`, target: (id: string) => `irb-submission:${id}`,
    determined: ['approved', 'modifications_required'], lifecycle: 'suspended',
    table: 'irb_submissions', insert: `(organization_id, protocol_number, title, status, created_by) VALUES ($1, $2, $2, 'under_review', $3)`,
  },
  {
    key: 'iacuc', mount: '/api/iacuc', path: (id: string) => `/protocols/${id}/status`, target: (id: string) => `iacuc-protocol:${id}`,
    determined: ['approved', 'conditional'], lifecycle: 'expired',
    table: 'iacuc_protocols', insert: `(organization_id, protocol_number, title, pain_category, status, created_by) VALUES ($1, $2, $2, 'C', 'fcr', $3)`,
  },
  {
    key: 'ibc', mount: '/api/ibc', path: (id: string) => `/registrations/${id}/status`, target: (id: string) => `ibc-registration:${id}`,
    determined: ['approved', 'conditional'], lifecycle: 'closed',
    table: 'ibc_registrations', insert: `(organization_id, registration_number, title, status, created_by) VALUES ($1, $2, $2, 'under_review', $3)`,
  },
];

describe.each(STATUS_DOORS)('$key: PATCH status cannot set what a determination sets', (door) => {
  const freshRow = async (label: string) =>
    String((await owner.query(`INSERT INTO ${door.table} ${door.insert} RETURNING id`, [ORG, `${TAG}-${BASE}-${door.key}-${label}`, signer.id])).rows[0].id);
  const statusOf = async (id: string) => (await owner.query(`SELECT status FROM ${door.table} WHERE id = $1`, [id])).rows[0].status;
  const patch = (id: string, status: string) =>
    request(app).patch(`${door.mount}${door.path(id)}`).set('Authorization', `Bearer ${signer.token}`).send({ status, reason: REASON });

  it.each(door.determined)("an admin's PATCH to '%s' is refused, and nothing is written", async (status) => {
    const id = await freshRow(status);
    const before = await statusOf(id);
    const res = await patch(id, status);
    expect(res.status, `${door.key}: PATCH set '${status}': ${JSON.stringify(res.body)}`).toBe(409);
    expect(res.body.error?.code).toBe('STATUS_SET_BY_DETERMINATION');
    expect(await statusOf(id)).toBe(before);
    expect(await written(door.target(id))).toEqual({ ledger: [], audit: [], signatures: [] });
  });

  it('a status no determination sets still moves, under a transition ledger row', async () => {
    const id = await freshRow('lifecycle');
    const res = await patch(id, door.lifecycle);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await statusOf(id)).toBe(door.lifecycle);
    expect((await written(door.target(id))).ledger.map((r) => r.command)).toEqual(['transition']);
  });
});

describe('a specification is created unsigned', () => {
  const create = (body: Record<string, unknown>) =>
    request(app)
      .post('/api/cmc/specifications')
      .set('Authorization', `Bearer ${signer.token}`)
      .send({ materialType: 'drug_substance', ...body });
  const stored = async (name: string) =>
    (await owner.query('SELECT id, approval_status FROM quality_specifications WHERE tenant_id = $1 AND material_name = $2', [ORG, name])).rows;

  it("refuses approvalStatus 'approved' and stores nothing", async () => {
    const name = `${TAG} ${BASE} created-approved`;
    const res = await create({ materialName: name, approvalStatus: 'approved' });
    expect(res.status, `create stored an approved specification: ${JSON.stringify(res.body)}`).toBe(400);
    expect(await stored(name)).toEqual([]);
  });

  it("stores 'review' as asked, and names the creator on the audit row", async () => {
    const name = `${TAG} ${BASE} created-review`;
    const res = await create({ materialName: name, approvalStatus: 'review' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rows = await stored(name);
    expect(rows.map((r) => r.approval_status)).toEqual(['review']);
    const log = await owner.query(`SELECT changed_by FROM specification_audit_log WHERE specification_id = $1 AND action = 'created'`, [rows[0].id]);
    expect(log.rows).toEqual([{ changed_by: String(signer.id) }]);
  });
});
