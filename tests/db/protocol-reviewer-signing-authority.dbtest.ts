/**
 * A protocol review is assigned only to someone who can sign its disposition
 * (follow-up decision "Protocol reviewers", docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * ── The defect this pins (reproduced 2026-10-08, before the fix) ─────────────
 * assignReviewerTx admitted any writing role (GOVERNED_WRITE_ROLES), while the
 * disposition's signing ceremony holds the signer to the platform's signing
 * policy (assertSigningAuthority: isSigningAuthorized on the membership-row
 * role, 505f71263). A member or a manager could therefore be assigned a review,
 * and their signature then ended at 403 ESIGNATURE_NO_AUTHORITY. Only the
 * assigned account may sign an account-bound review and nothing reassigns one,
 * so that review could never complete.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * Everything but the per-signer attempt limiter (its own suite; replaced by a
 * pass-through): the production auth gate with a signed access token, the
 * runtime role through APP_DATABASE_URL with RLS enforcing, the reviewers route
 * and its governed transaction, resolveSignerOrgRole through the app's own
 * database handle, the disposition's signing ceremony with bcrypt
 * re-authentication, the ledger and the electronic_signatures writer.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbprv": organization 93270, users `dbprv-*@example.invalid`. Each run
 * creates its own protocol documents, so no run reads another's assignments.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const ORG = 93270;
const TAG = 'dbprv';
const PASSWORD = 'Dbprv-Reviewer-Authority-2026!';
const REASON = 'Assigning the scientific review of this protocol.';

interface Account {
  id: number;
  name: string;
  token: string;
}

let owner: Pool;
let app: express.Express;
let author: Account;
let member: Account;
let manager: Account;
let reviewer: Account;

async function mintToken(userId: number, role: string): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(ORG), role }, activeJwtSecret(), { expiresIn: '10m' });
}

async function upsertAccount(key: string, role: string): Promise<Account> {
  const email = `${TAG}-${key}@example.invalid`;
  const name = `Dr ${key[0].toUpperCase()}${key.slice(1)} ${TAG}`;
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL, password_changed_at = NULL
     RETURNING id`,
    [email, name, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, $3, now() - interval '1 day')
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id, role],
  );
  return { id, name, token: await mintToken(id, role) };
}

async function protocolBy(createdBy: number): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, created_by)
     VALUES ($1, 'clinical', $2, $3) RETURNING id`,
    [ORG, `${TAG} Phase 2 study`, createdBy],
  );
  return Number(rows[0].id);
}

function assign(by: Account, docId: number, to: Account) {
  return request(app)
    .post(`/api/protocol-reviews/documents/${docId}/reviewers`)
    .set('Authorization', `Bearer ${by.token}`)
    .send({ reviewerName: to.name, reviewerUserId: to.id, role: 'scientific', reason: REASON });
}

/** What an assignment attempt left behind on the protocol: assignment rows and ledger rows. */
async function traceOf(docId: number) {
  const assignments = Number(
    (await owner.query(`SELECT count(*)::int AS n FROM protocol_review_assignments WHERE protocol_document_id = $1`, [docId])).rows[0].n,
  );
  const ledger = Number(
    (await owner.query(`SELECT count(*)::int AS n FROM c2c_ana_actions WHERE org_id = $1 AND target = $2`, [ORG, `protocol-document:${docId}`])).rows[0].n,
  );
  return { assignments, ledger };
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error(`[${TAG}] APP_DATABASE_URL is required: owner execution proves nothing about RLS.`);
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(
    `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ORG, `${TAG}-protocol-reviewer-signing-authority`],
  );
  author = await upsertAccount('author', 'admin');
  member = await upsertAccount('member', 'member');
  manager = await upsertAccount('manager', 'manager');
  reviewer = await upsertAccount('reviewer', 'reviewer');

  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  app.use('/api/protocol-reviews', authMiddleware, (await import('../../server/routes/protocol-reviews')).default);
  app.use('/api/tenant-users', authMiddleware, (await import('../../server/routes/tenant-users')).default);
}, 120_000);

afterAll(async () => {
  if (!owner) return;
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe('a protocol review is assigned only to someone who can sign its disposition', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('protocol-reviewer-signing-authority.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it.each([
    ['a member', () => member, 'member'],
    ['a manager', () => manager, 'manager'],
  ])('%s, whose role cannot sign, is refused with 409 in a plain sentence, and nothing is written', async (_who, to, role) => {
    const docId = await protocolBy(author.id);
    const target = to();
    const res = await assign(author, docId, target);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toEqual({
      code: 'REVIEWER_CANNOT_SIGN',
      message:
        `That reviewer's role (${role}) does not permit signing, so they could not sign this review's disposition. ` +
        'Assign someone who can sign, or name a reviewer who has no account here. Nothing was recorded.',
    });
    expect(await traceOf(docId)).toEqual({ assignments: 0, ledger: 0 });
  });

  it('the member list the reviewer picker reads marks who can sign, as the assignment judges it', async () => {
    const res = await request(app).get(`/api/tenant-users/${ORG}`).set('Authorization', `Bearer ${author.token}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ours = [author, member, manager, reviewer].map((a) => a.id);
    const marked = Object.fromEntries(
      (res.body as Array<{ id: number; canSign?: unknown }>).filter((r) => ours.includes(Number(r.id))).map((r) => [Number(r.id), r.canSign]),
    );
    expect(marked).toEqual({ [author.id]: true, [member.id]: false, [manager.id]: false, [reviewer.id]: true });
  });

  it('a reviewer is assigned, and signs the disposition: the assignment does not end at a 403', async () => {
    const docId = await protocolBy(author.id);
    const res = await assign(author, docId, reviewer);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const assignmentId = Number(res.body.assignmentId);
    expect(await traceOf(docId)).toEqual({ assignments: 1, ledger: 1 });

    const signed = await request(app)
      .patch(`/api/protocol-reviews/assignments/${assignmentId}/disposition`)
      .set('Authorization', `Bearer ${reviewer.token}`)
      .send({ disposition: 'approve', reason: 'Scientific review complete; no changes.', meaning: 'review', reauth: { password: PASSWORD } });
    expect(signed.status, JSON.stringify(signed.body)).toBe(201);
    const row = (
      await owner.query(`SELECT status, disposition FROM protocol_review_assignments WHERE id = $1`, [assignmentId])
    ).rows[0];
    expect(row).toEqual({ status: 'completed', disposition: 'approve' });
    const signatures = (
      await owner.query(
        `SELECT signer_id, signature_meaning FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2`,
        [ORG, `protocol-review-assignment:${assignmentId}`],
      )
    ).rows;
    expect(signatures).toEqual([{ signer_id: reviewer.id, signature_meaning: 'review' }]);
  });
});
