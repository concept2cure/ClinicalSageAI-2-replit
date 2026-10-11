/**
 * ADR-0014 §4 (P1-2b), enforced from P-25 (2026-10-08): in production, a
 * signer with no enrolled authenticator is refused, and nothing is signed.
 *
 * ── The defect this pins (reproduced 2026-10-08, before the fix) ─────────────
 * The ADR decided that, in production, anyone applying a governed electronic
 * signature uses an authenticator app. Nothing enforced it: reverifySigner
 * asked for a code only when one was enrolled, so a production signer with no
 * authenticator signed with the password alone. Enrolment now exists (the
 * account panel, e6fbacf33), so the founder's decision of 2026-10-08 makes the
 * rule live.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * Everything but the per-signer attempt limiter (its own suite; replaced by a
 * pass-through): the production auth gate with a signed access token, the
 * runtime role through APP_DATABASE_URL with RLS enforcing, reverifySigner with
 * bcrypt and the real TOTP verifier, the biosketch domain write
 * (routes/governed-signed-act.ts, the ceremony every research-administration
 * act uses), the ledger pair and the electronic_signatures writer. "Production"
 * is NODE_ENV=production for the request alone (vi.stubEnv): the rule reads it
 * at each signature, and the rest of the process keeps its test configuration.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbsar": organization 93240, users `dbsar-*@example.invalid`. Signatures
 * are permanent and reference the organization and signer, so those are reused
 * across runs; each run signs biosketches it creates, so no run reads another's.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { totp } from '../validation/lib/totp.mjs';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const ORG = 93240;
const TAG = 'dbsar';
const PASSWORD = 'Dbsar-Authenticator-2026!';
const REASON = 'Finalizing this biosketch for the P1-2b proof.';
const REFUSAL = 'Enrol an authenticator in Account to sign. Nothing was signed.';

interface Signer {
  id: number;
  email: string;
  token: string;
  secret: string | null;
}

let owner: Pool;
let app: express.Express;
let plain: Signer;
let enrolled: Signer;

async function mintToken(userId: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
}

/** A signer with no authenticator: the row is reset to that on every run. */
async function upsertSigner(key: string): Promise<Signer> {
  const email = `${TAG}-${key}@example.invalid`;
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_backup_codes = NULL, mfa_verified_at = NULL, mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [email, `Authenticator ${key}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'admin', now() - interval '1 day')
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id],
  );
  return { id, email, token: await mintToken(id), secret: null };
}

/**
 * Enrol through the functions /mfa/setup and /mfa/enable call, in the member's
 * scope. Confirmed with the previous step's code (inside the verifier's window),
 * so the current step's code is still unused when the signature asks for it.
 */
async function enrol(s: Signer): Promise<Signer> {
  const mfa = await import('../../server/services/mfaService');
  const secret = await runWithTenantScope(
    { tenantId: String(ORG), role: 'admin', source: 'test', caller: `${TAG}:enrol` },
    async () => {
      const issued = (await mfa.generateSecret(s.id, s.email)).secret;
      const enabled = await mfa.enableMfa(s.id, totp(issued, Date.now() - 30_000));
      if (!enabled.success) throw new Error(`[${TAG}] enrolment was refused`);
      return issued;
    },
  );
  return { ...s, secret };
}

/** A draft biosketch whose one section is addressed, so it is ready to finalize. */
async function draftBiosketch(createdBy: number): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO biosketches (organization_id, person_name, biosketch_type, status, created_by)
     VALUES ($1, $2, 'nih', 'draft', $3) RETURNING id`,
    [ORG, `${TAG} investigator`, createdBy],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO biosketch_sections (organization_id, biosketch_id, section_key, title, content, addressed, created_by)
     VALUES ($1, $2, 'personal_statement', 'Personal statement', 'Twenty years of translational oncology.', true, $3)`,
    [ORG, id, createdBy],
  );
  return id;
}

function finalize(s: Signer, id: number, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/biosketch/biosketches/${id}/finalize`)
    .set('Authorization', `Bearer ${s.token}`)
    .send({ reason: REASON, meaning: 'responsibility', password: PASSWORD, ...extra });
}

/** What the act left behind: signature rows, ledger rows, the record's status, the signer's failure count. */
async function traceOf(id: number, signer: Signer) {
  const target = `biosketch:${id}`;
  const signatures = (
    await owner.query(
      `SELECT signer_id, signature_meaning, authentication_method, second_factor_verified
         FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`,
      [ORG, target],
    )
  ).rows;
  const ledger = (
    await owner.query(`SELECT command FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY id`, [ORG, target])
  ).rows.map((r) => r.command);
  const status = (await owner.query('SELECT status FROM biosketches WHERE id = $1', [id])).rows[0].status;
  const failed = Number(
    (await owner.query('SELECT failed_login_attempts FROM users WHERE id = $1', [signer.id])).rows[0].failed_login_attempts ?? 0,
  );
  return { signatures, ledger, status, failed };
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error(`[${TAG}] APP_DATABASE_URL is required: owner execution proves nothing about RLS.`);
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbsar-mfa-encryption-key-at-least-32-chars';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-signer-authenticator-required`],
  );
  plain = await upsertSigner('plain');
  enrolled = await enrol(await upsertSigner('enrolled'));

  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  app.use('/api/biosketch', authMiddleware, (await import('../../server/routes/biosketch')).default);
}, 120_000);

beforeEach(async () => {
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ANY($1::int[])', [
    [plain.id, enrolled.id],
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  if (!owner) return;
  await owner.query(`DELETE FROM biosketch_sections WHERE organization_id = $1`, [ORG]).catch(() => undefined);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe('ADR-0014 P1-2b: in production a signer needs an authenticator', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('signer-authenticator-required.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('production, no authenticator: refused in the decided words, and nothing is written or counted', async () => {
    const id = await draftBiosketch(plain.id);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await finalize(plain, id);
    vi.unstubAllEnvs();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toEqual({ code: 'AUTHENTICATOR_REQUIRED', message: REFUSAL });
    expect(await traceOf(id, plain)).toEqual({ signatures: [], ledger: [], status: 'draft', failed: 0 });
  });

  it('production, an authenticator and no code: it goes on to the code check, and nothing is written', async () => {
    const id = await draftBiosketch(enrolled.id);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await finalize(enrolled, id);
    vi.unstubAllEnvs();
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code).toBe('MFA_TOKEN_REQUIRED');
    expect(await traceOf(id, enrolled)).toEqual({ signatures: [], ledger: [], status: 'draft', failed: 0 });
  });

  it('production, an authenticator and its current code: signed, and the row says both factors were verified', async () => {
    const id = await draftBiosketch(enrolled.id);
    vi.stubEnv('NODE_ENV', 'production');
    const res = await finalize(enrolled, id, { mfaToken: totp(enrolled.secret as string, Date.now()) });
    vi.unstubAllEnvs();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const trace = await traceOf(id, enrolled);
    expect(trace.signatures).toEqual([
      { signer_id: enrolled.id, signature_meaning: 'responsibility', authentication_method: 'password+mfa', second_factor_verified: true },
    ]);
    expect(trace.ledger).toContain('sign');
    expect(trace.status).toBe('final');
  });

  it('outside production nothing changes: the password alone signs for a signer with no authenticator', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    const id = await draftBiosketch(plain.id);
    const res = await finalize(plain, id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const trace = await traceOf(id, plain);
    expect(trace.signatures).toEqual([
      { signer_id: plain.id, signature_meaning: 'responsibility', authentication_method: 'password', second_factor_verified: false },
    ]);
    expect(trace.status).toBe('final');
  });
});
