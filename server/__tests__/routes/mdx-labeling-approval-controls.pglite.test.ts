/**
 * The labeling approval controls, against real tables (D5, 2026-10-29;
 * docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/).
 *
 * 96537cfe made a translation's approval a signed act and left four gaps:
 *   1. a labeling DOCUMENT could be created as, or PATCHed to, approved or
 *      effective with no signature, and the table had no approver column;
 *   2. a translation recorded no author, so its author could sign it;
 *   3. an approved translation could be edited and stay approved with its
 *      stamp, and moving it out of approved left the stamp set;
 *   4. (client, labelingViewerHidesWrites.test.tsx) a viewer saw Approve.
 * The QMS controlled document is the lifecycle each one follows (CLAUDE.md
 * Rule 3): approval only from review; a record with no recorded author is
 * signed with twoPersonRule 'not_applicable_no_author_recorded'; withdrawing
 * an approval is a revision, with a reason and a ledger row; superseding is
 * the retirement, signed with the meaning QMS signs it with.
 *
 * The router, its SQL, the migration and the separation-of-duties check run
 * for real, on an in-process PGlite: 20260511_qms_and_labeling.sql and then
 * 20261029b, applied twice as every deploy replays it. The ceremony's outer
 * pieces are stubbed at their module boundaries: the password check, the
 * signer's role, the ledger pair and the signature row. The stubs record what
 * was signed, so "nothing was signed" is asserted, not assumed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = 'migrations/20261029b_labeling_approval_stamps_and_creators.sql';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORG = 7;
const AUTHOR = 3;
const SIGNER = 5;
const COLLEAGUE = 6;
const GOOD = 'correct horse battery staple';
const SIGNATURE = { meaning: 'approval', reason: 'Checked against the design output and the risk file', password: GOOD };

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> },
  /** The caller on the request. */
  userId: 5,
  role: 'member' as string,
  /** What the ceremony signed, and every ledger row, in order. */
  signed: [] as Array<{ kind: 'ledger' | 'signature'; target: string; payload: Record<string, unknown>; command?: string; reason?: string | null }>,
  limited: 0,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => { h.limited += 1; next(); },
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async (_u: number, creds: { password?: string }) => (creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: async (_c: unknown, p: { command: string; target: string; reason: string | null; payload: Record<string, unknown> }) => {
    h.signed.push({ kind: 'ledger', command: p.command, target: p.target, reason: p.reason, payload: p.payload });
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' };
  },
}));
vi.mock('../../services/part11/signature-persistence', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistGovernedSignSignature: async (_c: unknown, p: { target: string; payload: Record<string, unknown> }) => {
    h.signed.push({ kind: 'signature', target: p.target, payload: p.payload });
    return { id: 314, signedAt: new Date('2026-10-29T10:00:00Z') };
  },
}));

import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: h.userId, organizationId: ORG, role: h.role };
    next();
  });
  a.use('/api/mdx', labelingRouter);
  return a;
}

type Row = Record<string, any>;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await h.pg.query(sql, params)).rows[0];
const doc = (id: number) => one(
  `SELECT status, approved_by, approved_at, effective_date::text AS effective_date, created_by, version
     FROM labeling_documents WHERE id = $1`, [id]);
const trans = (id: number) => one(
  `SELECT status, approved_by, approved_at, language, created_by FROM labeling_translations WHERE id = $1`, [id]);

/** A document as the database holds it, inserted directly. */
async function seedDoc(fields: Row = {}): Promise<number> {
  const f = { status: 'review', created_by: AUTHOR, approved_by: null, approved_at: null, effective_date: null, ...fields };
  const r = await one(
    `INSERT INTO labeling_documents (organization_id, device_name, doc_kind, status, created_by, approved_by, approved_at, effective_date)
     VALUES ($1, 'Aurora CGM', 'ifu', $2, $3, $4, $5, $6) RETURNING id`,
    [ORG, f.status, f.created_by, f.approved_by, f.approved_at, f.effective_date]);
  return r.id;
}
async function seedTrans(fields: Row = {}): Promise<number> {
  const docId = await seedDoc({ status: 'draft' });
  const f = { status: 'review', created_by: AUTHOR, approved_by: null, approved_at: null, ...fields };
  const r = await one(
    `INSERT INTO labeling_translations (labeling_document_id, organization_id, language, status, created_by, approved_by, approved_at)
     VALUES ($1, $2, 'de', $3, $4, $5, $6) RETURNING id`,
    [docId, ORG, f.status, f.created_by, f.approved_by, f.approved_at]);
  return r.id;
}

const patchDoc = (id: number, body: Row) => request(app()).patch(`/api/mdx/labeling/${id}`).send(body);
const patchTrans = (id: number, body: Row) => request(app()).patch(`/api/mdx/labeling/translations/${id}`).send(body);
const APPROVED_EARLIER = '2026-10-01T09:00:00.000Z';

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as typeof h.pg;
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id), deleted_at timestamptz);
    INSERT INTO organizations VALUES (${ORG}), (8);
    INSERT INTO users VALUES (${AUTHOR}), (${SIGNER}), (${COLLEAGUE});`);
  await pg.exec(read('migrations/20260511_qms_and_labeling.sql'));
  // Every deploy replays the set (CLAUDE.md Rule 1): twice, and nothing changes.
  await pg.exec(read(MIGRATION));
  await pg.exec(read(MIGRATION));
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  await h.pg.query('DELETE FROM labeling_translations');
  await h.pg.query('DELETE FROM labeling_documents');
  h.userId = SIGNER;
  h.role = 'member';
  h.signed.length = 0;
  h.limited = 0;
});

describe('the migration', () => {
  it('is in the set after the tables it alters and before the tenant sweep', () => {
    const at = C2C_MIGRATION_FILES.indexOf(MIGRATION);
    expect(at).toBeGreaterThan(C2C_MIGRATION_FILES.indexOf('migrations/20260511_qms_and_labeling.sql'));
    expect(at).toBeLessThan(C2C_MIGRATION_FILES.indexOf('db/migrations/20260801_tenant_isolation_sweep.sql'));
  });

  it('adds the approval stamp and the creators, nullable, keyed to users', async () => {
    const cols = await h.pg.query(
      `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name IN ('labeling_documents', 'labeling_translations')
          AND column_name IN ('approved_by', 'approved_at', 'created_by') ORDER BY table_name, column_name`);
    expect(cols.rows).toEqual([
      { table_name: 'labeling_documents', column_name: 'approved_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { table_name: 'labeling_documents', column_name: 'approved_by', data_type: 'integer', is_nullable: 'YES' },
      { table_name: 'labeling_documents', column_name: 'created_by', data_type: 'integer', is_nullable: 'YES' },
      { table_name: 'labeling_translations', column_name: 'approved_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      { table_name: 'labeling_translations', column_name: 'approved_by', data_type: 'integer', is_nullable: 'YES' },
      { table_name: 'labeling_translations', column_name: 'created_by', data_type: 'integer', is_nullable: 'YES' },
    ]);
    await expect(seedDoc({ created_by: 999 })).rejects.toMatchObject({ code: '23503' });
  });
});

const SUPERSEDE = { ...SIGNATURE, meaning: 'retirement' };
const WITHDRAWAL_REASON = 'The German artwork changed after review; re-review it';
const ledgerRows = () => h.signed.filter((s) => s.kind === 'ledger');
const signatures = () => h.signed.filter((s) => s.kind === 'signature');

describe('1. a labeling document moves to approved, effective or superseded only by a signature', () => {
  it.each(['approved', 'effective', 'superseded'])('a PATCH to %s with no signature: 400, and the document is unchanged', async (status) => {
    const id = await seedDoc();
    const res = await patchDoc(id, { status });
    expect(await doc(id)).toMatchObject({ status: 'review', approved_by: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(h.signed).toEqual([]);
  });

  it.each(['approved', 'effective', 'superseded'])('a create as %s: 428, and nothing is inserted', async (status) => {
    const res = await request(app()).post('/api/mdx/labeling').send({ deviceName: 'Aurora CGM', docKind: 'ifu', status });
    expect((await h.pg.query('SELECT id FROM labeling_documents')).rows).toEqual([]);
    expect(res.status).toBe(428);
    expect(res.body.details.code).toBe('LABELING_DOCUMENT_APPROVAL_REQUIRES_SIGNATURE');
    expect(res.body.error).toMatch(/Nothing was saved\.$/);
  });

  it('a signed approval of a document in review records the signer as approver, with the ledger pair and the signature row', async () => {
    const id = await seedDoc();
    const res = await patchDoc(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(201);
    const row = await doc(id);
    expect(row).toMatchObject({ status: 'approved', approved_by: SIGNER, effective_date: null });
    expect(row.approved_at).not.toBeNull();
    expect(h.signed.map((s) => `${s.kind}:${s.target}`)).toEqual([`ledger:labeling-document:${id}`, `signature:labeling-document:${id}`]);
    expect(h.signed[1].payload).toMatchObject({ labelingDocumentId: id, previousStatus: 'review', status: 'approved', meaning: 'approval' });
    expect(res.body).toMatchObject({ data: { id, status: 'approved', approved_by: SIGNER }, signatureId: 314 });
    expect(h.limited).toBe(1);
  });

  it('a signed move to effective keeps the approval it carries, and stamps the date it takes effect', async () => {
    const id = await seedDoc({ status: 'approved', approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER });
    const res = await patchDoc(id, { status: 'effective', effectiveDate: '2026-11-02', ...SIGNATURE });
    expect(res.status).toBe(201);
    const row = await doc(id);
    expect(row).toMatchObject({ status: 'effective', approved_by: COLLEAGUE, effective_date: '2026-11-02' });
    expect(new Date(row.approved_at).toISOString()).toBe(APPROVED_EARLIER);
    expect(h.signed[1].payload).toMatchObject({ status: 'effective', previousStatus: 'approved', effectiveDate: '2026-11-02' });
  });

  it('a document approved before its approver was recorded, made effective today: the signer is recorded', async () => {
    const id = await seedDoc({ status: 'approved' });
    const res = await patchDoc(id, { status: 'effective', ...SIGNATURE });
    expect(res.status).toBe(201);
    const today = (await one(`SELECT CURRENT_DATE::text AS d`)).d;
    expect(await doc(id)).toMatchObject({ status: 'effective', approved_by: SIGNER, effective_date: today });
  });

  it('a signed move that also edits the document: 400, the signature covers the document as it stands', async () => {
    const id = await seedDoc();
    const res = await patchDoc(id, { status: 'approved', version: '2.0', ...SIGNATURE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LABELING_DOCUMENT_SIGNING_EDITS_FIELDS');
    expect(await doc(id)).toMatchObject({ status: 'review', version: '1.0', approved_by: null });
  });
});

describe('the order of the steps, as QMS orders them', () => {
  it.each([
    ['approved', 'draft', 'LABELING_DOCUMENT_NOT_IN_REVIEW', /a draft\. Send it for review first: only a document in review can be approved/],
    ['approved', 'approved', 'LABELING_DOCUMENT_NOT_IN_REVIEW', /is approved; only a document in review can be approved/],
    ['approved', 'effective', 'LABELING_DOCUMENT_NOT_IN_REVIEW', /is effective; only a document in review can be approved/],
    ['approved', 'superseded', 'LABELING_DOCUMENT_NOT_IN_REVIEW', /is superseded; only a document in review can be approved/],
    ['effective', 'draft', 'LABELING_DOCUMENT_NOT_APPROVED', /is draft; only an approved document can be made effective/],
    ['effective', 'review', 'LABELING_DOCUMENT_NOT_APPROVED', /is review; only an approved document can be made effective/],
    ['effective', 'effective', 'LABELING_DOCUMENT_NOT_APPROVED', /is effective; only an approved document can be made effective/],
    ['superseded', 'superseded', 'LABELING_DOCUMENT_ALREADY_SUPERSEDED', /already superseded/],
  ])('a document cannot be signed %s from %s: 409, in words, and nothing is signed', async (to, from, code, words) => {
    const id = await seedDoc({ status: from, approved_by: from === 'draft' || from === 'review' ? null : COLLEAGUE });
    const res = await patchDoc(id, { status: to, ...(to === 'superseded' ? SUPERSEDE : SIGNATURE) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.message).toMatch(words);
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(await doc(id)).toMatchObject({ status: from });
    expect(h.signed).toEqual([]);
  });

  it.each(['pending', 'in_progress', 'rejected'])('a translation %s cannot be approved: 409, in words, and nothing is signed', async (status) => {
    const id = await seedTrans({ status });
    const res = await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSLATION_NOT_IN_REVIEW');
    expect(res.body.error.message).toMatch(/only a translation in review can be approved\. Nothing was signed\.$/);
    expect(await trans(id)).toMatchObject({ status, approved_by: null });
    expect(h.signed).toEqual([]);
  });
});

describe('2. the record\'s creator cannot approve it, and a record with none recorded is signed as QMS signs it', () => {
  it('a create records who added the document and the translation', async () => {
    h.userId = AUTHOR;
    const created = await request(app()).post('/api/mdx/labeling').send({ deviceName: 'Aurora CGM', docKind: 'ifu' });
    expect(created.status).toBe(201);
    expect(await doc(created.body.data.id)).toMatchObject({ created_by: AUTHOR });
    const added = await request(app()).post(`/api/mdx/labeling/${created.body.data.id}/translations`).send({ language: 'fr' });
    expect(added.status).toBe(201);
    expect(await trans(added.body.data.id)).toMatchObject({ created_by: AUTHOR, status: 'pending' });
  });

  it('the translation\'s creator signing its approval: 403, and it stays in review', async () => {
    const id = await seedTrans({ created_by: SIGNER });
    const res = await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect(await trans(id)).toMatchObject({ status: 'review', approved_by: null });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SEPARATION_OF_DUTIES');
    expect(res.body.error.message).toMatch(/translation creator/);
    expect(res.body.error.message).toMatch(/Nothing was signed\.$/);
    expect(h.signed).toEqual([]);
  });

  it('a colleague of the creator approves it, and the two-person rule is recorded as enforced', async () => {
    const id = await seedTrans({ created_by: AUTHOR });
    const res = await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(await trans(id)).toMatchObject({ status: 'approved', approved_by: SIGNER });
    for (const s of h.signed) expect(s.payload).toMatchObject({ twoPersonRule: 'enforced', originalAuthorId: AUTHOR });
  });

  it('a translation that records no creator is approved, and the ledger and signature say the rule did not apply', async () => {
    const id = await seedTrans({ created_by: null });
    const res = await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(await trans(id)).toMatchObject({ status: 'approved', approved_by: SIGNER });
    expect(h.signed.map((s) => s.kind)).toEqual(['ledger', 'signature']);
    for (const s of h.signed) expect(s.payload).toMatchObject({ twoPersonRule: 'not_applicable_no_author_recorded', originalAuthorId: null });
  });

  it.each([['approved', 'review'], ['effective', 'approved']])('the document\'s creator signing it %s: 403, and nothing is signed', async (to, from) => {
    const id = await seedDoc({ status: from, created_by: SIGNER, approved_by: from === 'approved' ? COLLEAGUE : null });
    const res = await patchDoc(id, { status: to, ...SIGNATURE });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SEPARATION_OF_DUTIES');
    expect(await doc(id)).toMatchObject({ status: from });
    expect(h.signed).toEqual([]);
  });

  it.each([['approved', 'review'], ['effective', 'approved']])('a document with no recorded creator is signed %s, recorded as not applicable', async (to, from) => {
    const id = await seedDoc({ status: from, created_by: null });
    const res = await patchDoc(id, { status: to, ...SIGNATURE });
    expect(res.status).toBe(201);
    expect(await doc(id)).toMatchObject({ status: to, approved_by: SIGNER });
    for (const s of h.signed) expect(s.payload).toMatchObject({ twoPersonRule: 'not_applicable_no_author_recorded', originalAuthorId: null });
  });
});

describe('superseding a document is its retirement: signed, with the QMS meaning', () => {
  it('signed as a retirement: superseded, the approval and effective date kept, no two-person rule', async () => {
    const id = await seedDoc({ status: 'effective', created_by: SIGNER, approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER, effective_date: '2026-10-02' });
    const res = await patchDoc(id, { status: 'superseded', ...SUPERSEDE });
    expect(res.status).toBe(201);
    expect(await doc(id)).toMatchObject({ status: 'superseded', approved_by: COLLEAGUE, effective_date: '2026-10-02' });
    expect(h.signed.map((s) => `${s.kind}:${s.target}`)).toEqual([`ledger:labeling-document:${id}`, `signature:labeling-document:${id}`]);
    expect(h.signed[1].payload).toMatchObject({ previousStatus: 'effective', status: 'superseded', meaning: 'retirement' });
    expect(h.signed[1].payload).not.toHaveProperty('twoPersonRule');
    expect(h.limited).toBe(1);
  });

  it.each(['approval', 'responsibility', 'review'])('signed with the meaning %s: 400 before the password, and nothing changes', async (meaning) => {
    const id = await seedDoc({ status: 'effective', approved_by: COLLEAGUE });
    const res = await patchDoc(id, { status: 'superseded', ...SIGNATURE, meaning });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MEANING_NOT_ALLOWED');
    expect(await doc(id)).toMatchObject({ status: 'effective' });
    expect(h.signed).toEqual([]);
  });
});

describe('3. an approval never outlives what it signed', () => {
  it.each([
    ['language', { language: 'fr' }],
    ['translator', { translator: 'Another agency' }],
    ['method', { translationMethod: 'machine' }],
  ])('editing an approved translation (%s): 409, and it stays as signed', async (_f, edit) => {
    const id = await seedTrans({ status: 'approved', approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER });
    const res = await patchTrans(id, edit);
    expect(await trans(id)).toMatchObject({ status: 'approved', approved_by: COLLEAGUE, language: 'de' });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('TRANSLATION_APPROVED_LOCKED');
  });

  it('moving an approved translation back with no reason: 400, it stays approved, and no ledger row is written', async () => {
    const id = await seedTrans({ status: 'approved', approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER });
    const res = await patchTrans(id, { status: 'review' });
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('APPROVAL_WITHDRAWAL_REASON_REQUIRED');
    expect(res.body.error).toMatch(/withdraws its approval, so it needs a reason/);
    expect(await trans(id)).toMatchObject({ status: 'approved', approved_by: COLLEAGUE });
    expect(h.signed).toEqual([]);
  });

  it('moving it back with a reason withdraws the approval: no stamp is left, and a transition ledger row records why', async () => {
    const id = await seedTrans({ status: 'approved', approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER });
    const res = await patchTrans(id, { status: 'review', reason: WITHDRAWAL_REASON });
    expect(res.status).toBe(200);
    expect(await trans(id)).toMatchObject({ status: 'review', approved_by: null, approved_at: null });
    expect(res.body.data).toMatchObject({ status: 'review', approved_by: null, approved_at: null });
    expect(signatures()).toEqual([]);
    expect(ledgerRows()).toEqual([{
      kind: 'ledger', command: 'transition', target: `labeling-translation:${id}`, reason: WITHDRAWAL_REASON,
      payload: { kind: 'withdraw-approval', from: 'approved', to: 'review', withdrawnApprovalBy: COLLEAGUE },
    }]);
  });

  it('a translation not yet approved can still be edited and moved, with no reason and no ledger row', async () => {
    const id = await seedTrans({ status: 'in_progress' });
    expect((await patchTrans(id, { translator: 'Agency B' })).status).toBe(200);
    expect((await patchTrans(id, { status: 'review' })).status).toBe(200);
    expect(await trans(id)).toMatchObject({ status: 'review', approved_by: null });
    expect(h.signed).toEqual([]);
  });

  it.each(['approved', 'effective', 'superseded'])('editing a %s document: 409, and it stays as signed', async (status) => {
    const id = await seedDoc({ status, approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER, effective_date: '2026-10-02' });
    const res = await patchDoc(id, { version: '2.0' });
    expect(await doc(id)).toMatchObject({ status, version: '1.0', approved_by: COLLEAGUE });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('LABELING_DOCUMENT_CONTROLLED');
  });

  it.each(['approved', 'effective', 'superseded'])('moving a %s document back to draft with no reason: 400, and it stays as signed', async (status) => {
    const id = await seedDoc({ status, approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER, effective_date: '2026-10-02' });
    const res = await patchDoc(id, { status: 'draft' });
    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('APPROVAL_WITHDRAWAL_REASON_REQUIRED');
    expect(await doc(id)).toMatchObject({ status, approved_by: COLLEAGUE, effective_date: '2026-10-02' });
    expect(h.signed).toEqual([]);
  });

  it.each([
    ['approved', 'draft', '2026-10-02'],
    ['approved', 'review', '2026-10-02'],
    ['effective', 'draft', null],
    ['effective', 'review', null],
    ['superseded', 'draft', null],
  ])('moving a %s document back to %s with a reason withdraws its approval (effective date kept: %s), with a ledger row', async (from, to, kept) => {
    const id = await seedDoc({ status: from, approved_by: COLLEAGUE, approved_at: APPROVED_EARLIER, effective_date: '2026-10-02' });
    const res = await patchDoc(id, { status: to, reason: WITHDRAWAL_REASON });
    expect(res.status).toBe(200);
    expect(await doc(id)).toMatchObject({ status: to, approved_by: null, approved_at: null, effective_date: kept });
    expect(signatures()).toEqual([]);
    expect(ledgerRows()).toEqual([{
      kind: 'ledger', command: 'transition', target: `labeling-document:${id}`, reason: WITHDRAWAL_REASON,
      payload: { kind: 'withdraw-approval', from, to, withdrawnApprovalBy: COLLEAGUE },
    }]);
  });

  it('a draft can still be edited and sent for review, with no reason and no ledger row', async () => {
    const id = await seedDoc({ status: 'draft' });
    expect((await patchDoc(id, { version: '1.1' })).status).toBe(200);
    expect((await patchDoc(id, { status: 'review' })).status).toBe(200);
    expect(await doc(id)).toMatchObject({ status: 'review', version: '1.1' });
    expect(h.signed).toEqual([]);
  });

  it('an edit or a move of a document the organization does not hold is still a 404', async () => {
    expect((await patchDoc(424242, { version: '2.0' })).status).toBe(404);
    expect((await patchDoc(424242, { status: 'draft', reason: WITHDRAWAL_REASON })).status).toBe(404);
  });
});
