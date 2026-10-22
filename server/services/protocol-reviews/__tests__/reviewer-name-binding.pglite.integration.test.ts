/**
 * A review assigned to a member's account is listed under that account's name
 * (periodic review 2026-09-28, editor family, SEC-C-7), against the REAL
 * migrations in PGlite.
 *
 * The assignment took a free-text `reviewer_name` beside `reviewer_user_id` and
 * stored it as typed. So a review bound to colleague B could be listed as "Dr A",
 * and once B signed, the Reviews pane and the signing dialog printed "Dr A" over
 * B's disposition. `assignReviewerTx` is the one writer: the HTTP route and the
 * AnA tool `assign_protocol_reviewer` both call it, so the name is resolved and
 * checked here, not in either caller.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const holder = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
}));
vi.mock('../../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => holder.query(s, p) }, db: {} }));
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => holder.query(s, p) }, db: {} }));
// The reviewer's signing authority is read as the signing ceremony reads it:
// the membership row (resolveSignerOrgRole). The real lookup goes through
// drizzle, which this suite does not wire; this reads the same PGlite row.
vi.mock('../../part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: async (userId: number, orgId: number) =>
    (await holder.query('SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2', [userId, orgId])).rows[0]?.role ?? null,
}));

import { assignReviewerTx } from '../protocol-reviews-service';

const ORG = 42;
const OTHER_ORG = 99;
const AUTHOR = 7;
const OKAFOR = 21;
const NO_NAME = 23;
const NOBODY = 24;
const STRANGER = 10;

let pglite: PGlite;
const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[] };
};
const client = { query: q };

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

async function protocol(): Promise<number> {
  const d = await q(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, created_by)
     VALUES ($1,'clinical','A Phase 2 Study',$2) RETURNING id`,
    [ORG, AUTHOR],
  );
  return Number(d.rows[0].id);
}

async function stored(assignmentId: number): Promise<{ reviewer_name: string; reviewer_user_id: number | null }> {
  return (await q(`SELECT reviewer_name, reviewer_user_id FROM protocol_review_assignments WHERE id = $1`, [assignmentId])).rows[0];
}

async function refusal(p: Promise<unknown>): Promise<{ code: string; message: string }> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, 'the assignment was expected to be refused').not.toBeNull();
  return { code: String((err as { code?: string }).code), message: String((err as Error).message) };
}

const assignments = async (docId: number) =>
  Number((await q(`SELECT COUNT(*)::int AS n FROM protocol_review_assignments WHERE protocol_document_id = $1`, [docId])).rows[0].n);

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    -- shared/schema.ts users: the columns resolveSignerIdentity reads.
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, name TEXT, title TEXT);
    CREATE TABLE research_personnel (id SERIAL PRIMARY KEY);
    CREATE TABLE organization_users (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', UNIQUE (user_id, organization_id));
    INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');
    INSERT INTO users (id, email, name) VALUES
      (${AUTHOR},'a@e.test','Author'), (${OKAFOR},'okafor@e.test','Dr Amara Okafor'),
      (${NO_NAME},'lead@e.test',''), (${NOBODY},NULL,NULL), (${STRANGER},'s@e.test','Stranger');
    -- The reviewers hold signing roles: a review is assigned only to someone
    -- who can sign its disposition ("Protocol reviewers", follow-up decision).
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (${ORG},${AUTHOR},'member'), (${ORG},${OKAFOR},'reviewer'), (${ORG},${NO_NAME},'approver'), (${ORG},${NOBODY},'reviewer'),
      (${OTHER_ORG},${STRANGER},'reviewer');
  `);
  for (const m of [
    'migrations/20260621_protocol_development.sql',
    'migrations/20260629_protocol_reviews.sql',
    'migrations/20260921_protocol_documents_sponsor_pi.sql',
  ]) await pglite.exec(migration(m));
  holder.query = q;
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

describe('a review assigned to an account is listed under that account’s name (SEC-C-7)', () => {
  it('a different name typed beside the account is refused, and nothing is recorded', async () => {
    const docId = await protocol();
    const r = await refusal(assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: 'Dr Someone Else', reviewerUserId: OKAFOR }));
    expect(r.code).toBe('BAD_INPUT');
    expect(r.message).toContain('Dr Amara Okafor');
    expect(r.message).toContain('Nothing was recorded.');
    expect(await assignments(docId)).toBe(0);
  });

  it('the same name, typed with other capitals or spacing, is stored as the account spells it', async () => {
    const docId = await protocol();
    const { id } = await assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '  dr   AMARA okafor ', reviewerUserId: OKAFOR });
    expect(await stored(id)).toEqual({ reviewer_name: 'Dr Amara Okafor', reviewer_user_id: OKAFOR });
  });

  it('a blank name means the account’s name', async () => {
    const docId = await protocol();
    const { id } = await assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '   ', reviewerUserId: OKAFOR });
    expect(await stored(id)).toEqual({ reviewer_name: 'Dr Amara Okafor', reviewer_user_id: OKAFOR });
  });

  it('an account with no name on record is listed under its email, the name a signature from it would print', async () => {
    const docId = await protocol();
    const { id } = await assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '', reviewerUserId: NO_NAME });
    expect(await stored(id)).toEqual({ reviewer_name: 'lead@e.test', reviewer_user_id: NO_NAME });
    const r = await refusal(assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: 'The Lead', reviewerUserId: NO_NAME }));
    expect(r.code).toBe('BAD_INPUT');
  });

  it('an account with neither a name nor an email cannot be listed, and says so', async () => {
    const docId = await protocol();
    const r = await refusal(assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '', reviewerUserId: NOBODY }));
    expect(r.code).toBe('BAD_INPUT');
    expect(r.message).toMatch(/no name or email on record/);
    expect(await assignments(docId)).toBe(0);
  });

  it('the membership checks still come first: another organisation’s user is refused', async () => {
    const docId = await protocol();
    const r = await refusal(assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: 'Stranger', reviewerUserId: STRANGER }));
    expect(r.code).toBe('BAD_INPUT');
    expect(r.message).toMatch(/not a member of this organization/);
    expect(await assignments(docId)).toBe(0);
  });
});

describe('a reviewer with no account is named as typed', () => {
  it('stores the typed name, trimmed', async () => {
    const docId = await protocol();
    const { id } = await assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '  Dr Iyer (external) ' });
    expect(await stored(id)).toEqual({ reviewer_name: 'Dr Iyer (external)', reviewer_user_id: null });
  });

  it('needs a name', async () => {
    const docId = await protocol();
    const r = await refusal(assignReviewerTx(client, ORG, AUTHOR, docId, { reviewerName: '  ' }));
    expect(r.code).toBe('BAD_INPUT');
    expect(await assignments(docId)).toBe(0);
  });
});
