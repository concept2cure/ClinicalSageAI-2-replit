/**
 * An IACUC protocol with no approval date on record has no expiry verdict.
 *
 * reviewStatus(null) returned `{ expirationDate: null, expired: false,
 * annualReviewDue: false }`, and GET /api/iacuc/protocols/:id/completeness and
 * AnA's review_iacuc_protocol served it as the protocol's review status: an
 * approval nobody dated read as not expired and no annual review due. They now
 * serve `approvalReviewStatus`, which says the status is undetermined and why.
 *
 * Through the real router and the real creating migration, on PGlite.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
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

const ORG = 7;
const USER = 3;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/iacuc', iacucRouter);

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

async function protocol(status: string, approvalDate: string | null): Promise<number> {
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO iacuc_protocols (organization_id, protocol_number, title, pain_category, status, approval_date, created_by)
     VALUES ($1, 'A-1', 'Tox study', 'C', $2, $3, $4) RETURNING id`,
    [ORG, status, approvalDate, USER],
  );
  return r.rows[0].id;
}

describe('the review status served for a protocol', () => {
  it('is undetermined, not "not expired", for a protocol recorded as approved with no approval date', async () => {
    const id = await protocol('approved', null);
    const res = await request(app).get(`/api/iacuc/protocols/${id}/completeness`);
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus.expired).toBeNull();
    expect(res.body.reviewStatus.annualReviewDue).toBeNull();
    expect(res.body.reviewStatus.undetermined).toBe(true);
    expect(res.body.reviewStatus.reason).toMatch(/approval date/i);
  });

  it('is computed from a recorded approval date', async () => {
    const id = await protocol('approved', '2023-01-01');
    const res = await request(app).get(`/api/iacuc/protocols/${id}/completeness`);
    expect(res.body.reviewStatus).toMatchObject({ undetermined: false, expirationDate: '2026-01-01' });
    expect(typeof res.body.reviewStatus.expired).toBe('boolean');
  });
});
