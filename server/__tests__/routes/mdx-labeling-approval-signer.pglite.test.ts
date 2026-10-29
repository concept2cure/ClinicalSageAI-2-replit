/**
 * GET /api/mdx/labeling/:id says, for each translation, whether the reader may
 * sign its approval (D5, 2026-10-29;
 * docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 *
 * The approval refuses a translation's own creator (separation of duties,
 * mdx-labeling-approvals.ts). The Labeling screen offered Approve to that
 * creator anyway, and the refusal arrived after the password was typed. The
 * read now carries `approvalSigner: { state }`, asked of the sign step's own
 * check (signerIndependenceOf), so the screen can warn in advance and cannot
 * disagree with what the approval will do.
 *
 * Runs for real on an in-process PGlite: the labeling router and its SQL, the
 * authorship lookup (resolveTargetAuthors over labeling_translations.created_by,
 * from 20261029b) and the signed-content read. Stubbed: the database module,
 * so the route's pool is the PGlite, and the request's user.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ORG = 7;
const CREATOR = 3;
const COLLEAGUE = 5;

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> },
  /** The reader's user id; null for a request with no user id. */
  userId: 0 as number | null,
  /** Make the authorship lookup fail, as an unreachable database would. */
  authorshipFails: false,
  /** Make the check itself throw, which the real one never does. */
  checkThrows: false,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    if (h.authorshipFails && /SELECT created_by FROM labeling_translations/.test(sql)) {
      throw Object.assign(new Error('connection terminated'), { code: '57P01' });
    }
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/governance/separation-of-duties', async (orig) => {
  const actual = await orig<typeof import('../../services/governance/separation-of-duties')>();
  return {
    ...actual,
    signerIndependenceOf: (...a: Parameters<typeof actual.signerIndependenceOf>) =>
      (h.checkThrows ? Promise.reject(new Error('check failed')) : actual.signerIndependenceOf(...a)),
  };
});

import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = h.userId === null
      ? { organizationId: ORG, role: 'member' }
      : { id: h.userId, organizationId: ORG, role: 'member' };
    next();
  });
  a.use('/api/mdx', labelingRouter);
  return a;
}

type Row = Record<string, any>;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await h.pg.query(sql, params)).rows[0];

/** A document with a German translation the creator added and a French one with no creator recorded. */
async function seed(): Promise<{ docId: number; mine: number; noCreator: number }> {
  const d = await one(
    `INSERT INTO labeling_documents (organization_id, device_name, doc_kind, version, status, language, created_by)
     VALUES ($1, 'Aurora CGM', 'ifu', '2.1', 'draft', 'en', $2) RETURNING id`, [ORG, CREATOR]);
  const mine = await one(
    `INSERT INTO labeling_translations (labeling_document_id, organization_id, language, translation_method, status, created_by)
     VALUES ($1, $2, 'de', 'human', 'review', $3) RETURNING id`, [d.id, ORG, CREATOR]);
  const none = await one(
    `INSERT INTO labeling_translations (labeling_document_id, organization_id, language, translation_method, status, created_by)
     VALUES ($1, $2, 'fr', 'human', 'review', NULL) RETURNING id`, [d.id, ORG]);
  return { docId: d.id, mine: mine.id, noCreator: none.id };
}

/** Each translation's approvalSigner state, by language. */
async function signersAsRead(docId: number): Promise<Record<string, unknown>> {
  const res = await request(app()).get(`/api/mdx/labeling/${docId}`);
  expect(res.status).toBe(200);
  return Object.fromEntries((res.body.data.translations as Row[]).map((t) => [t.language, t.approvalSigner]));
}

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as typeof h.pg;
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY, name text, email text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL REFERENCES organizations(id), deleted_at timestamptz);
    INSERT INTO organizations VALUES (${ORG}), (8);
    INSERT INTO users VALUES (${CREATOR}, 'Ana Author', 'author@example.com'), (${COLLEAGUE}, 'Sam Signer', 'signer@example.com');`);
  await pg.exec(read('migrations/20260511_qms_and_labeling.sql'));
  await pg.exec(read('migrations/20261029b_labeling_approval_stamps_and_creators.sql'));
  await pg.exec(`CREATE TABLE electronic_signatures (
    id serial PRIMARY KEY, organization_id integer, signed_target text, signature_type varchar(50) NOT NULL DEFAULT 'governed',
    signer_name text, signed_at timestamp DEFAULT now() NOT NULL, signature_meaning text, signature_hash text,
    signature_manifest json, binding_basis text, bound_payload_digest text NOT NULL DEFAULT '',
    is_valid boolean DEFAULT true, superseded_by integer, verification_status varchar(50))`);
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  h.userId = COLLEAGUE;
  h.authorshipFails = false;
  h.checkThrows = false;
  await h.pg.query('DELETE FROM labeling_translations');
  await h.pg.query('DELETE FROM labeling_documents');
});

describe('approvalSigner: the approval\'s own separation-of-duties check, asked in advance', () => {
  it("tells a translation's creator they are its author", async () => {
    const { docId } = await seed();
    h.userId = CREATOR;
    expect((await signersAsRead(docId)).de).toEqual({ state: 'author' });
  });

  it('tells a colleague they are independent of it', async () => {
    const { docId } = await seed();
    expect((await signersAsRead(docId)).de).toEqual({ state: 'independent' });
  });

  it("says 'unresolved' for a translation with no creator recorded, for every reader (the approval then signs it, not applicable)", async () => {
    const { docId } = await seed();
    expect((await signersAsRead(docId)).fr).toEqual({ state: 'unresolved' });
    h.userId = CREATOR;
    expect((await signersAsRead(docId)).fr).toEqual({ state: 'unresolved' });
  });

  it('is asked of each translation by its own target and the reader, organisation-scoped', async () => {
    const { docId } = await seed();
    await h.pg.query(`UPDATE labeling_translations SET organization_id = 8 WHERE language = 'de'`);
    h.userId = CREATOR;
    // The same row in another organisation is not this reader's authorship to answer for.
    expect((await signersAsRead(docId)).de).toEqual({ state: 'unresolved' });
  });
});

describe('a check that cannot run does not fail the read', () => {
  it("an authorship lookup that fails reads 'unverified', never 'independent', and the document is still returned", async () => {
    const { docId } = await seed();
    h.authorshipFails = true;
    const res = await request(app()).get(`/api/mdx/labeling/${docId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.device_name).toBe('Aurora CGM');
    expect(res.body.data.signedContent).toMatchObject({ state: 'unsigned' });
    for (const t of res.body.data.translations as Row[]) expect(t.approvalSigner).toEqual({ state: 'unverified' });
  });

  it("a check that throws reads 'unverified', and the read answers 200", async () => {
    const { docId } = await seed();
    h.checkThrows = true;
    const signers = await signersAsRead(docId);
    expect(signers).toEqual({ de: { state: 'unverified' }, fr: { state: 'unverified' } });
  });

  it("a reader with no user id reads 'unverified' for every translation", async () => {
    const { docId } = await seed();
    h.userId = null;
    expect(await signersAsRead(docId)).toEqual({ de: { state: 'unverified' }, fr: { state: 'unverified' } });
  });
});
