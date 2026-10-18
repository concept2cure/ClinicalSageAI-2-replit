/**
 * irb_submissions.expiration_date holds the expiration the BOARD set, or NULL.
 *
 * recordReviewTx used to compute determination + 1 year (full board) and write
 * it into expiration_date, and lifecycle.ts reads that column back as
 * expirationSource 'recorded' — "the expiration the board set". Nothing
 * accepted the board's own date, so a board that approved for six months read
 * as current for six months after the approval lapsed. Now the board's
 * expirationDate is accepted on an approval and stored; without one the column
 * stays NULL and the lifecycle labels its one-year date 'computed'.
 *
 * Real creating migration on PGlite; the route case goes through the real router.
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
vi.mock('../../irb-metrics', () => ({
  recordIrbSubmissionCreated: vi.fn(),
  recordIrbApproval: vi.fn(),
  recordIrbReportableEvent: vi.fn(),
}));

import irbRouter from '../../../routes/irb';
import { recordReviewTx, getLifecycleStatus, IrbError } from '../irb-service';

const ORG = 7;
const USER = 3;
const TODAY = '2026-10-15';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const client = { query: (s: string, p?: unknown[]) => query(s, p) };

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

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
  await pglite.exec(migration('migrations/20260610_irb_submissions.sql'));
  await pglite.exec(migration('migrations/20260922d_irb_submission_context.sql'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE irb_reviews, irb_submissions RESTART IDENTITY CASCADE;');
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, status, risk_level)
     VALUES ($1, 'P-1', 'A study', $2, 'under_review', 'greater_than_minimal') RETURNING id`,
    [ORG, USER],
  );
  id = r.rows[0].id;
});

async function storedExpiration(): Promise<string | null> {
  const r = await pglite.query<{ expiration_date: string | Date | null }>(`SELECT expiration_date FROM irb_submissions WHERE id = $1`, [id]);
  const v = r.rows[0].expiration_date;
  return v instanceof Date ? v.toISOString().slice(0, 10) : v;
}

describe('the expiration on file is the board’s, or none', () => {
  it('an approval with no board expiration stores none, and the lifecycle labels its date computed', async () => {
    const out = await recordReviewTx(client, ORG, USER, id, { reviewType: 'full_board', outcome: 'approved', determinationDate: '2026-03-02' });

    expect(out.expirationDate).toBeNull();
    expect(await storedExpiration()).toBeNull();
    const { status } = await getLifecycleStatus(ORG, id, TODAY);
    expect(status.expirationSource).toBe('computed');
    expect(status.expirationDate).toBe('2027-03-02');
  });

  it('records the board’s own expiration, and a six-month approval lapses on its date', async () => {
    const out = await recordReviewTx(client, ORG, USER, id, {
      reviewType: 'full_board', outcome: 'approved', determinationDate: '2026-03-02', expirationDate: '2026-09-02',
    });

    expect(out.expirationDate).toBe('2026-09-02');
    expect(await storedExpiration()).toBe('2026-09-02');
    const { status } = await getLifecycleStatus(ORG, id, TODAY);
    expect(status.expirationSource).toBe('recorded');
    expect(status.approval).toBe('expired');
  });

  it.each([
    ['not after the determination', { outcome: 'approved' as const, expirationDate: '2026-03-02' }],
    ['not a calendar date', { outcome: 'approved' as const, expirationDate: '2026-09-31' }],
    ['on an outcome that is not an approval', { outcome: 'modifications_required' as const, expirationDate: '2026-09-02' }],
  ])('refuses an expiration %s, and records nothing', async (_why, over) => {
    await expect(
      recordReviewTx(client, ORG, USER, id, { reviewType: 'full_board', determinationDate: '2026-03-02', ...over }),
    ).rejects.toThrow(IrbError);
    const reviews = await pglite.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM irb_reviews`);
    expect(reviews.rows[0].n).toBe(0);
    expect(await storedExpiration()).toBeNull();
  });

  it('the route passes the board’s expirationDate to the service rather than dropping it', async () => {
    // A non-approval outcome, so no signing ceremony: the service's refusal
    // proves the field arrived (a schema that stripped it would answer 201).
    const res = await request(app).post(`/api/irb/submissions/${id}/reviews`).send({
      reviewType: 'full_board', outcome: 'modifications_required', determinationDate: '2026-03-02',
      expirationDate: '2026-09-02', reason: 'Recording the board determination.',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/expirationDate/);
  });
});
