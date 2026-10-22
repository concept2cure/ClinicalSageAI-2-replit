/**
 * iacuc_protocols.expiration_date holds the expiration the COMMITTEE set, or NULL.
 *
 * recordReviewTx computed determination + 3 years and stored it in
 * expiration_date, and GET /api/iacuc/protocols served that column as the
 * protocol's expiration: a date no committee set. Nothing accepted the
 * committee's own date, so a protocol it approved for one year read as current
 * for two more years. Now the committee's expirationDate is accepted on an
 * approval and stored; without one the column stays NULL, and the review
 * status labels its approval + 3 years date 'computed'.
 *
 * Real creating migration on PGlite; the route cases go through the real router.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const query = async (sql: string, params?: unknown[]) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) return { rows: [], rowCount: 0 };
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};

vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined }),
  },
  db: {},
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 1 })) }));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../iacuc-metrics', () => ({
  recordIacucProtocolCreated: vi.fn(),
  recordIacucApproval: vi.fn(),
  recordIacucReview: vi.fn(),
}));

import iacucRouter from '../../../routes/iacuc';
import { recordReviewTx, IacucError } from '../iacuc-service';

const ORG = 7;
const USER = 3;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const client = { query: (s: string, p?: unknown[]) => query(s, p) };
const asDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/iacuc', iacucRouter);

let id: number;

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pglite.exec(migration('migrations/20260610_iacuc_animal_governance.sql'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE iacuc_reviews, iacuc_protocols RESTART IDENTITY CASCADE;');
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO iacuc_protocols (organization_id, protocol_number, title, pain_category, status, created_by)
     VALUES ($1, 'A-1', 'Tox study', 'C', 'submitted', $2) RETURNING id`,
    [ORG, USER],
  );
  id = r.rows[0].id;
});

async function storedExpiration(): Promise<unknown> {
  const r = await pglite.query<{ expiration_date: unknown }>(`SELECT expiration_date FROM iacuc_protocols WHERE id = $1`, [id]);
  return asDay(r.rows[0].expiration_date);
}

describe('the expiration on file is the committee’s, or none', () => {
  it('an approval with no committee expiration stores none, the list serves none, and the status labels its date computed', async () => {
    const out = await recordReviewTx(client, ORG, USER, id, { reviewType: 'designated_member_review', outcome: 'approved', determinationDate: '2026-03-02' });

    expect(out.expirationDate).toBeNull();
    expect(await storedExpiration()).toBeNull();
    const list = await request(app).get('/api/iacuc/protocols');
    expect(list.body.find((p: { id: number }) => p.id === id).expiration_date).toBeNull();
    const res = await request(app).get(`/api/iacuc/protocols/${id}/completeness`);
    expect(res.body.reviewStatus).toMatchObject({ undetermined: false, expirationDate: '2029-03-02', expirationSource: 'computed' });
  });

  it('records the committee’s own expiration, and a one-year approval lapses on its date', async () => {
    const out = await recordReviewTx(client, ORG, USER, id, {
      reviewType: 'full_committee_review', reviewerCount: 9, outcome: 'approved', determinationDate: '2025-03-02', expirationDate: '2026-03-02',
    });

    expect(out.expirationDate).toBe('2026-03-02');
    expect(await storedExpiration()).toBe('2026-03-02');
    const res = await request(app).get(`/api/iacuc/protocols/${id}/completeness`);
    expect(res.body.reviewStatus).toMatchObject({ expirationDate: '2026-03-02', expirationSource: 'recorded', expired: true, annualReviewDue: false });
  });

  it.each([
    ['not after the determination', { outcome: 'approved' as const, expirationDate: '2026-03-02' }],
    ['not a calendar date', { outcome: 'approved' as const, expirationDate: '2027-02-30' }],
    ['on an outcome that is not an approval', { outcome: 'conditional' as const, expirationDate: '2027-03-02' }],
  ])('refuses an expiration %s, and records nothing', async (_why, over) => {
    await expect(
      recordReviewTx(client, ORG, USER, id, { reviewType: 'designated_member_review', determinationDate: '2026-03-02', ...over }),
    ).rejects.toThrow(IacucError);
    const reviews = await pglite.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM iacuc_reviews`);
    expect(reviews.rows[0].n).toBe(0);
    expect(await storedExpiration()).toBeNull();
  });

  it('the route passes the committee’s expirationDate to the service rather than dropping it', async () => {
    // A non-approval outcome, so no signing ceremony: the service's refusal
    // proves the field arrived (a schema that stripped it would answer 201).
    const res = await request(app).post(`/api/iacuc/protocols/${id}/reviews`).send({
      reviewType: 'designated_member_review', outcome: 'conditional', determinationDate: '2026-03-02',
      expirationDate: '2027-03-02', reason: 'Recording the committee determination.',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expirationDate/);
  });
});
