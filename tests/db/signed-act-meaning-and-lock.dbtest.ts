/**
 * Plan P1-51 (DP-64, DP-65): a domain route's signed act carries a meaning that
 * is true of the act, and one record is signed once.
 *
 * ── The defects this pins (reproduced 2026-10-01, before the fix) ────────────
 * DP-64. routes/governed-signed-act.ts accepted every meaning of the closed
 * vocabulary on every route, so a biosketch was finalized "as review" and the
 * signature row said so (21 CFR 11.50(a)(3): the manifestation states what the
 * signature means; a meaning the act cannot have is a false record).
 * DP-65. The domain write read the record's state without locking it, so two
 * finalizations of one biosketch that both read it as a draft both wrote: two
 * electronic_signatures rows for one act, both answered 201.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * Everything but the per-signer attempt limiter (its own suite; replaced by a
 * pass-through): the production gate with a signed access token, the runtime
 * role through APP_DATABASE_URL with RLS enforcing, reverifySigner with bcrypt,
 * the biosketch domain write (finalizeBiosketchTx, its readiness gate and its
 * state check), the ledger pair and the electronic_signatures writer.
 *
 * The race is made deterministic: the owner holds the biosketch row
 * (SELECT … FOR UPDATE) while both requests run, and lets go only once two
 * backends are waiting on a lock. Before the fix both requests had read the
 * draft by then and waited at the UPDATE; after it, the second waits at the
 * ceremony's lock on the target, before it reads anything.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbsml": organization 93220, users `dbsml-*@example.invalid`. Signatures
 * are permanent and reference the organization and signer, so those are reused
 * across runs; each run signs biosketches it creates, so no run reads another's.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const ORG = 93220;
const TAG = 'dbsml';
const PASSWORD = 'Dbsml-Signed-Act-2026!';
const REASON = 'Finalizing this biosketch for the P1-51 proof.';

let owner: Pool;
let app: express.Express;
let signer: { id: number; token: string };

async function mintToken(userId: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' });
}

async function upsertSigner(key: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `Signed Act ${key}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'admin', now() - interval '1 day')
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id],
  );
  return id;
}

/** A draft biosketch whose one section is addressed, so it is ready to finalize. */
async function draftBiosketch(): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO biosketches (organization_id, person_name, biosketch_type, status, created_by)
     VALUES ($1, $2, 'nih', 'draft', $3) RETURNING id`,
    [ORG, `${TAG} investigator`, signer.id],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO biosketch_sections (organization_id, biosketch_id, section_key, title, content, addressed, created_by)
     VALUES ($1, $2, 'personal_statement', 'Personal statement', 'Twenty years of translational oncology.', true, $3)`,
    [ORG, id, signer.id],
  );
  return id;
}

function finalize(id: number, meaning: string) {
  return request(app)
    .post(`/api/biosketch/biosketches/${id}/finalize`)
    .set('Authorization', `Bearer ${signer.token}`)
    .send({ reason: REASON, meaning, password: PASSWORD });
}

async function signaturesOf(id: number) {
  const { rows } = await owner.query(
    `SELECT signer_id, signature_meaning FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`,
    [ORG, `biosketch:${id}`],
  );
  return rows;
}

async function statusOf(id: number): Promise<string> {
  const { rows } = await owner.query('SELECT status FROM biosketches WHERE id = $1', [id]);
  return rows[0].status;
}

/** Backends of this database waiting on a lock, other than the owner's own. */
async function lockWaiters(except: number): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> $1`,
    [except],
  );
  return rows[0].n;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbsml] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-signed-act-meaning-and-lock`],
  );
  const signerId = await upsertSigner('signer');
  signer = { id: signerId, token: await mintToken(signerId) };

  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  app.use('/api/biosketch', authMiddleware, (await import('../../server/routes/biosketch')).default);
}, 120_000);

beforeEach(async () => {
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [signer.id]);
});

afterAll(async () => {
  if (!owner) return;
  await owner.query(`DELETE FROM biosketch_sections WHERE organization_id = $1`, [ORG]).catch(() => undefined);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe('a signed act carries a meaning true of the act (DP-64)', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('signed-act-meaning-and-lock.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('refuses a biosketch finalized "as review" before the password, and writes nothing', async () => {
    const id = await draftBiosketch();
    const res = await finalize(id, 'review');
    expect(res.status, `a finalize signed as review: ${JSON.stringify(res.body)}`).toBe(400);
    expect(res.body.error?.code).toBe('MEANING_NOT_ALLOWED');
    expect(await signaturesOf(id)).toEqual([]);
    expect(await statusOf(id)).toBe('draft');
  });

  it('refuses "release" too: nothing is released by finalizing a biosketch', async () => {
    const id = await draftBiosketch();
    const res = await finalize(id, 'release');
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('MEANING_NOT_ALLOWED');
    expect(await signaturesOf(id)).toEqual([]);
  });

  it('refuses "authorship": nothing checks that the signer wrote the biosketch (DP-76)', async () => {
    const id = await draftBiosketch();
    const res = await finalize(id, 'authorship');
    expect(res.status, `a finalize signed as authorship: ${JSON.stringify(res.body)}`).toBe(400);
    expect(res.body.error?.code).toBe('MEANING_NOT_ALLOWED');
    expect(await signaturesOf(id)).toEqual([]);
  });

  it('control: the investigator finalizes "as responsibility", and the signature row says so', async () => {
    const id = await draftBiosketch();
    const res = await finalize(id, 'responsibility');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await signaturesOf(id)).toEqual([{ signer_id: signer.id, signature_meaning: 'responsibility' }]);
    expect(await statusOf(id)).toBe('final');
  });
});

describe('one record is signed once (DP-65)', () => {
  it('two concurrent finalizations of one biosketch: one 201, one 409, one signature', async () => {
    const id = await draftBiosketch();
    const holder: PoolClient = await owner.connect();
    let released = false;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM biosketches WHERE id = $1 FOR UPDATE', [id]);
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);

      const both = Promise.all([finalize(id, 'responsibility'), finalize(id, 'approval')]);
      // Let go once both requests are waiting on a lock, or after 15 s.
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (await lockWaiters(holderPid)) < 2) await new Promise((r) => setTimeout(r, 50));
      const waiting = await lockWaiters(holderPid);
      await holder.query('COMMIT');
      released = true;

      const answers = await both;
      const statuses = answers.map((r) => r.status).sort();
      expect(waiting, 'both requests should have been waiting on a lock when the row was let go').toBe(2);
      expect(statuses, `answers: ${JSON.stringify(answers.map((r) => r.body))}`).toEqual([201, 409]);
      const refused = answers.find((r) => r.status === 409)!;
      expect(refused.body.error?.code).toBe('INVALID_STATE');
      expect(await signaturesOf(id), 'one act, one signature row').toHaveLength(1);
    } finally {
      if (!released) await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }
  }, 60_000);
});
