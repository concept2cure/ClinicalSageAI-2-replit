/**
 * A reportable event is recorded with the date it was reported to the board.
 *
 * addReportableEventTx used to stamp a missing reportedDate with the day the
 * row was entered, under status 'reported', and the route accepted any string
 * there unchecked. An unanticipated problem entered a week after it reached the
 * board read as reported that day, and lifecycle finding IRB-LC-022 ("no
 * reported date, so promptness CANNOT BE DETERMINED") could never fire for an
 * event this service created. The date is now required as a real calendar
 * date, the way determinationDate is.
 *
 * Through the real router and the real creating migration, on PGlite.
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
import { addReportableEventTx, getLifecycleStatus, IrbError } from '../irb-service';

const ORG = 7;
const USER = 3;
const REASON = 'Recording the event the board was told about.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

let submissionId: number;

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
  await pglite.exec('TRUNCATE irb_reportable_events, irb_submissions RESTART IDENTITY CASCADE;');
  const r = await pglite.query<{ id: number }>(
    `INSERT INTO irb_submissions (organization_id, protocol_number, title, created_by, status)
     VALUES ($1, 'P-1', 'A study', $2, 'approved') RETURNING id`,
    [ORG, USER],
  );
  submissionId = r.rows[0].id;
});

async function events(): Promise<Array<{ reported_date: string | null }>> {
  const r = await pglite.query<{ reported_date: string | Date | null }>(`SELECT reported_date FROM irb_reportable_events ORDER BY id`);
  return r.rows.map((x) => ({
    reported_date: x.reported_date instanceof Date ? x.reported_date.toISOString().slice(0, 10) : x.reported_date,
  }));
}

const EVENT = { eventType: 'unanticipated_problem', description: 'Dosing error at site 2', reason: REASON };

describe('a reportable event needs the date it was reported', () => {
  it('POST refuses an event with no reportedDate, and records nothing', async () => {
    const res = await request(app).post(`/api/irb/submissions/${submissionId}/reportable-events`).send(EVENT);
    expect(res.status).toBe(400);
    expect(await events()).toEqual([]);
  });

  it('POST refuses a reportedDate that is not YYYY-MM-DD', async () => {
    const res = await request(app)
      .post(`/api/irb/submissions/${submissionId}/reportable-events`)
      .send({ ...EVENT, reportedDate: 'last Tuesday' });
    expect(res.status).toBe(400);
    expect(await events()).toEqual([]);
  });

  it('the service refuses a missing or impossible date before writing anything', async () => {
    const sql: string[] = [];
    const client = { query: vi.fn(async (text: string, params?: unknown[]) => { sql.push(text); return query(text, params); }) };
    for (const reportedDate of [undefined, null, '', '2026-02-30']) {
      await expect(
        addReportableEventTx(client, ORG, USER, submissionId, { eventType: 'unanticipated_problem', description: 'x', reportedDate }),
      ).rejects.toThrow(IrbError);
    }
    await expect(
      addReportableEventTx(client, ORG, USER, submissionId, { eventType: 'unanticipated_problem', description: 'x' }),
    ).rejects.toThrow(/reportedDate is required/);
    expect(sql.filter((s) => /INSERT/i.test(s))).toEqual([]);
  });

  it('records the date the board was told, as given', async () => {
    const res = await request(app)
      .post(`/api/irb/submissions/${submissionId}/reportable-events`)
      .send({ ...EVENT, reportedDate: '2026-09-01' });
    expect(res.status).toBe(201);
    expect(await events()).toEqual([{ reported_date: '2026-09-01' }]);
  });

  it('an undated event already on file still reads as promptness undetermined (IRB-LC-022)', async () => {
    await pglite.query(
      `INSERT INTO irb_reportable_events (organization_id, irb_submission_id, event_type, description, reported_date, created_by)
       VALUES ($1, $2, 'other', 'entered before 2026-10-15', NULL, $3)`,
      [ORG, submissionId, USER],
    );
    const { status } = await getLifecycleStatus(ORG, submissionId, '2026-10-15');
    expect(status.findings.map((f) => f.code)).toContain('IRB-LC-022');
  });
});
