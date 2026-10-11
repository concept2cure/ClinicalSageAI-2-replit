/**
 * P0-18 (DP-01 residual): a QMS controlled document becomes effective or
 * retired only in the transaction that writes its electronic signature — and
 * the DATABASE refuses it otherwise, not just the route.
 *
 * ── The defect this pins (reproduced 2026-10-01, before the fix) ─────────────
 * e1c224f6 closed the routes: `effective` is reached only through
 * approveQmsDocumentSigned and `retired` only through retireQmsDocumentSigned
 * (server/services/qms/document-approval-signature.ts), each writing one
 * `electronic_signatures` row on the same transaction. Nothing in the database
 * held that. As the runtime role, in its own tenant, with RLS enforcing, a bare
 * `UPDATE qms_documents SET status = 'effective'` committed with no signature at
 * all, and so did an INSERT of an effective row and an UPDATE to `retired`. A
 * revised document whose earlier approval was still live could be put back to
 * effective the same way, with nothing signed for the new version.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * The routes (authMiddleware with a signed access token, reverifySigner with the
 * production wiring, the service's three writes on the route's own transaction)
 * on the runtime pool — app_service, NOSUPERUSER NOBYPASSRLS, app.rls_enforce=on
 * — and the table owner for the cases the owner must not get past either.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbqsr": organisations 93180 (under test) and 93181 (the other tenant),
 * users `dbqsr-*@example.invalid`. Every document, signature and ledger row of
 * those organisations is removed before and after the run, as the owner, each
 * append-only trigger off for that one transaction (the domain-sign-ceremony
 * precedent). The guard on qms_documents is never disabled: a fixture that needs
 * an effective document gives it its signature on the same transaction.
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P0-18/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const ORG = 93180;
const OTHER_ORG = 93181;
const ORGS = [ORG, OTHER_ORG];
const TAG = 'dbqsr';
const RUN = Date.now().toString(36);
const PASSWORD = 'Dbqsr-Qms-Signature-2026!';
const REASON = 'Approving this controlled document for the P0-18 database proof.';
const REFUSED = /QMS_SIGNATURE_REQUIRED/;

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

let owner: Pool;
let app: express.Express;
let orgUuid: string;
let approver: { id: number; token: string };
let author: number;

/** Remove this lane's rows as the owner, each append-only trigger off for this transaction only. */
async function cleanup(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE electronic_signatures DISABLE TRIGGER trg_electronic_signatures_immutable');
    await c.query('DELETE FROM electronic_signatures WHERE organization_id = ANY($1::int[])', [ORGS]);
    await c.query('ALTER TABLE electronic_signatures ENABLE TRIGGER trg_electronic_signatures_immutable');
    await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[])', [ORGS]);
    await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    const { rows } = await c.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_c2c_ana_actions_append_only' AND tgrelid = 'public.c2c_ana_actions'::regclass`,
    );
    if (rows.length > 0) await c.query('ALTER TABLE c2c_ana_actions DISABLE TRIGGER trg_c2c_ana_actions_append_only');
    await c.query('DELETE FROM c2c_ana_actions WHERE org_id = ANY($1::int[])', [ORGS]);
    if (rows.length > 0) await c.query('ALTER TABLE c2c_ana_actions ENABLE TRIGGER trg_c2c_ana_actions_append_only');
    await c.query('DELETE FROM qms_documents WHERE organization_id = ANY($1::int[])', [ORGS]);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

async function upsertUser(handle: string, name: string, role: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
       failed_login_attempts = 0, locked_until = NULL, mfa_enabled = false, mfa_secret = NULL,
       mfa_totp_last_step = NULL, password_changed_at = NULL
     RETURNING id`,
    [`${TAG}-${handle}@example.invalid`, name, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [ORG, id, role],
  );
  return id;
}

/** One transaction on the runtime pool, in this organisation's scope — the route's own shape. */
async function asRuntime<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  return runWithTenantScope(
    { tenantId: String(ORG), orgUuid, role: 'admin', source: 'request', caller: 'tests/db/qms-document-signature-required.dbtest.ts' },
    async () => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(c as unknown as Client);
        await c.query('COMMIT');
        return out;
      } catch (err) {
        await c.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        c.release();
      }
    },
  );
}

/** One transaction as the table owner. */
async function asOwner<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** A draft controlled document in this organisation, authored by someone other than the approver. */
async function draftDoc(label: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, author_id)
     VALUES ($1, $2, $3, 'sop', '1.0', 'draft', $4) RETURNING id`,
    [ORG, `${TAG}-${RUN}-${label}`, `P0-18 probe ${label}`, author],
  );
  return Number(rows[0].id);
}

/** Send a draft for review: the only state an approval signs (QA walk 2026-10-08, J8 — a draft is no longer approvable). */
async function toReview(docId: number): Promise<void> {
  await owner.query(`UPDATE qms_documents SET status = 'in_review' WHERE id = $1`, [docId]);
}

interface SigOpts { type?: string; org?: number; revoked?: boolean }

/** A signature row shaped as the governed writer anchors one, on the caller's transaction. */
async function signatureRow(c: Client, docId: number, label: string, opts: SigOpts = {}): Promise<void> {
  await c.query(
    `INSERT INTO electronic_signatures
       (organization_id, signed_target, signature_type, signature_purpose, signature_meaning, signer_id, signer_name,
        signer_email, authentication_method, authentication_timestamp, signature_hash, signature_manifest, is_valid,
        verification_status)
     VALUES ($1, $2, $3, 'P0-18 probe', 'APPROVED', $4, 'Dbqsr Approver', $5, 'password', now(), $6, '{}'::json, $7, $8)`,
    [
      opts.org ?? ORG, `qms-document:${docId}`, opts.type ?? 'qms-document-approval', approver.id,
      `${TAG}-approver@example.invalid`, `${TAG}-${RUN}-${label}`, !opts.revoked, opts.revoked ? 'revoked' : null,
    ],
  );
}

async function statusOf(docId: number): Promise<string> {
  const { rows } = await owner.query('SELECT status FROM qms_documents WHERE id = $1', [docId]);
  return String(rows[0].status);
}

async function signaturesOn(docId: number) {
  const { rows } = await owner.query(
    `SELECT signature_type, signer_id, xmin::text AS xmin FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`,
    [ORG, `qms-document:${docId}`],
  );
  return rows;
}

function post(path: string, body: Record<string, unknown>) {
  return request(app).post(`/api/mdx/qms/documents${path}`).set('Authorization', `Bearer ${approver.token}`).send(body);
}

const approve = (id: number) => post(`/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: REASON });
const retire = (id: number) => post(`/${id}/retire`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Retiring this controlled document for the P0-18 proof.' });
const revise = (id: number) => post(`/${id}/revise`, { reason: 'Opening a revision for the P0-18 proof.' });

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbqsr] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  for (const id of ORGS) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $2, 'active') ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [id, `${TAG}-qms-signature-${id}`],
    );
  }
  orgUuid = String((await owner.query('SELECT uuid FROM organizations WHERE id = $1', [ORG])).rows[0].uuid);
  await cleanup();
  const approverId = await upsertUser('approver', 'Dbqsr Approver', 'admin');
  author = await upsertUser('author', 'Dbqsr Author', 'member');
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  approver = {
    id: approverId,
    token: jwt.sign({ type: 'access', userId: approverId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), { expiresIn: '10m' }),
  };
  const { authMiddleware } = await import('../../server/auth');
  const qms = (await import('../../server/routes/mdx-qms')).default;
  app = express();
  app.use(express.json());
  app.use('/api/mdx', authMiddleware, qms);
}, 120_000);

beforeEach(async () => {
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [approver.id]);
});

afterAll(async () => {
  if (!owner) return;
  await cleanup().catch((err) => console.warn('[dbqsr] cleanup left rows:', (err as Error).message));
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner.end();
});

describe('P0-18: the database refuses an effective or retired controlled document without its signature', () => {
  it('runs as the runtime role, under RLS, in its own tenant', async () => {
    const who = await asRuntime((c) =>
      c.query(`SELECT current_user AS role, current_setting('app.rls_enforce', true) AS rls, current_setting('app.current_tenant_id', true) AS tenant`),
    );
    expect(who.rows[0]).toEqual({ role: 'app_service', rls: 'on', tenant: String(ORG) });
  });

  it('a direct UPDATE to effective with no signature is refused, and the document stays draft', async () => {
    const id = await draftDoc('bare-effective');
    await expect(asRuntime((c) => c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [id]))).rejects.toThrow(REFUSED);
    expect(await statusOf(id)).toBe('draft');
  });

  it('a direct INSERT of an effective document is refused', async () => {
    const insert = asRuntime((c) =>
      c.query(
        `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, status, author_id)
         VALUES ($1, $2, 'P0-18 inserted effective', 'sop', 'effective', $3)`,
        [ORG, `${TAG}-${RUN}-insert-effective`, author],
      ),
    );
    await expect(insert).rejects.toThrow(REFUSED);
    const { rows } = await owner.query('SELECT 1 FROM qms_documents WHERE doc_number = $1', [`${TAG}-${RUN}-insert-effective`]);
    expect(rows).toEqual([]);
  });

  it('a direct UPDATE to retired with no retirement signature is refused', async () => {
    const id = await draftDoc('bare-retired');
    await expect(asRuntime((c) => c.query(`UPDATE qms_documents SET status = 'retired' WHERE id = $1`, [id]))).rejects.toThrow(REFUSED);
    expect(await statusOf(id)).toBe('draft');
  });

  it('the table owner is refused too', async () => {
    const id = await draftDoc('owner-effective');
    await expect(owner.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [id])).rejects.toThrow(REFUSED);
    expect(await statusOf(id)).toBe('draft');
  });

  it('a signature of the wrong kind, of another organisation, or already revoked does not count', async () => {
    const wrongKind = await draftDoc('wrong-kind');
    await expect(
      asRuntime(async (c) => {
        await signatureRow(c, wrongKind, 'wrong-kind', { type: 'qms-document-retirement' });
        await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [wrongKind]);
      }),
    ).rejects.toThrow(REFUSED);
    const otherOrg = await draftDoc('other-org');
    await expect(
      asOwner(async (c) => {
        await signatureRow(c, otherOrg, 'other-org', { org: OTHER_ORG });
        await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [otherOrg]);
      }),
    ).rejects.toThrow(REFUSED);
    const revoked = await draftDoc('revoked');
    await expect(
      asRuntime(async (c) => {
        await signatureRow(c, revoked, 'revoked', { revoked: true });
        await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [revoked]);
      }),
    ).rejects.toThrow(REFUSED);
    for (const id of [wrongKind, otherOrg, revoked]) expect(await statusOf(id)).toBe('draft');
  });

  it('an approval written by an earlier transaction does not make a revised version effective', async () => {
    const id = await draftDoc('revised');
    await toReview(id);
    expect((await approve(id)).status).toBe(200);
    expect((await revise(id)).status).toBe(200);
    expect(await statusOf(id)).toBe('draft');
    // Version 1's approval is still live (nothing revoked it); version 2 was never signed.
    expect((await signaturesOn(id)).map((s) => s.signature_type)).toEqual(['qms-document-approval']);
    await expect(asRuntime((c) => c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [id]))).rejects.toThrow(REFUSED);
    expect(await statusOf(id)).toBe('draft');
  });
});

describe('P0-18: the governed path, and fixtures that sign, still commit', () => {
  it('approve: the route makes the document effective with one approval signature from the same transaction', async () => {
    const id = await draftDoc('route-approve');
    await toReview(id);
    const res = await approve(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const doc = await owner.query('SELECT status, approver_id, xmin::text AS xmin FROM qms_documents WHERE id = $1', [id]);
    expect(doc.rows[0]).toMatchObject({ status: 'effective', approver_id: approver.id });
    const sigs = await signaturesOn(id);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ signature_type: 'qms-document-approval', signer_id: approver.id, xmin: doc.rows[0].xmin });
  });

  it('retire: the route retires the effective document with its retirement signature', async () => {
    const id = await draftDoc('route-retire');
    await toReview(id);
    expect((await approve(id)).status).toBe(200);
    const res = await retire(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statusOf(id)).toBe('retired');
    expect((await signaturesOn(id)).map((s) => s.signature_type)).toEqual(['qms-document-approval', 'qms-document-retirement']);
  });

  it('a revised document is approved again through the route', async () => {
    const id = await draftDoc('route-reapprove');
    await toReview(id);
    expect((await approve(id)).status).toBe(200);
    expect((await revise(id)).status).toBe(200);
    await toReview(id);
    const res = await approve(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statusOf(id)).toBe('effective');
    expect(await signaturesOn(id)).toHaveLength(2);
  });

  it('the service writes the status before the signature, so the check is deferred to COMMIT; checked per statement it refuses', async () => {
    const { approveQmsDocumentSigned } = await import('../../server/services/qms/document-approval-signature');
    const params = (documentId: number) => ({
      orgId: ORG, userId: approver.id, documentId, reason: REASON, meaning: 'APPROVED', effectiveDate: null,
      authenticationMethod: 'password' as const, secondFactorVerified: false, ipAddress: null,
    });
    const immediate = await draftDoc('immediate');
    await toReview(immediate);
    await expect(
      asRuntime(async (c) => {
        await c.query('SET CONSTRAINTS trg_qms_documents_signed_status_upd IMMEDIATE');
        await approveQmsDocumentSigned(c as never, params(immediate));
      }),
    ).rejects.toThrow(REFUSED);
    expect(await statusOf(immediate)).toBe('in_review');
    expect(await signaturesOn(immediate)).toEqual([]);
    const deferred = await draftDoc('deferred');
    await toReview(deferred);
    await asRuntime((c) => approveQmsDocumentSigned(c as never, params(deferred)));
    expect(await statusOf(deferred)).toBe('effective');
  });

  it('a fixture gives an effective document its signature on the same transaction, before or after the status', async () => {
    const after = await draftDoc('fixture-after');
    await asOwner(async (c) => {
      await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [after]);
      await signatureRow(c, after, 'fixture-after');
    });
    expect(await statusOf(after)).toBe('effective');
    const inserted = await asRuntime(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, status, author_id)
         VALUES ($1, $2, 'P0-18 fixture inserted effective', 'sop', 'effective', $3) RETURNING id`,
        [ORG, `${TAG}-${RUN}-fixture-insert`, author],
      );
      await signatureRow(c, Number(rows[0].id), 'fixture-insert');
      return Number(rows[0].id);
    });
    expect(await statusOf(inserted)).toBe('effective');
  });

  it('a document already effective is not re-checked: an edit that leaves its status alone commits', async () => {
    const id = await draftDoc('already-effective');
    await asOwner(async (c) => {
      await signatureRow(c, id, 'already-effective');
      await c.query(`UPDATE qms_documents SET status = 'effective' WHERE id = $1`, [id]);
    });
    // A later transaction with no signature of its own touches the effective row.
    await asRuntime((c) => c.query(`UPDATE qms_documents SET next_review_date = DATE '2027-10-01', updated_at = now() WHERE id = $1`, [id]));
    await asRuntime((c) => c.query(`UPDATE qms_documents SET status = 'effective', title = title WHERE id = $1`, [id]));
    const { rows } = await owner.query('SELECT status, next_review_date::text AS d FROM qms_documents WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'effective', d: '2027-10-01' });
  });
});
