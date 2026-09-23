/**
 * The approval lifecycle, read from the real tables.
 *
 * The engine is covered by `lifecycle.test.ts`. What this proves is the reader,
 * and one property in particular: the amendment and reportable-event lists are
 * passed as REAL ARRAYS, never omitted. `lifecycleStatus` treats an absent list
 * as "not assessed" and an empty list as "none", and a reader that forgot to
 * pass them would turn every submission into "modifications were not assessed"
 * — technically honest, permanently useless.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import { getLifecycleStatus } from '../irb-service';

const ORG = 7;
const OTHER = 9;
const TODAY = '2026-09-22';

const DDL = `
CREATE TABLE irb_submissions (id serial PRIMARY KEY, organization_id int NOT NULL, protocol_number text, title text, review_type text, risk_level text DEFAULT 'minimal', status text NOT NULL DEFAULT 'draft', approval_date date, expiration_date date, deleted_at timestamptz);
CREATE TABLE irb_amendments (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, description text, substantive boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'submitted', deleted_at timestamptz);
CREATE TABLE irb_reportable_events (id serial PRIMARY KEY, organization_id int NOT NULL, irb_submission_id int NOT NULL, event_type text, description text, reported_date date, status text NOT NULL DEFAULT 'reported', deleted_at timestamptz);
`;

/**
 * `pick` rather than `??` on purpose. The first version of this helper wrote
 * `over.approvalDate ?? '2026-03-01'`, which turned an EXPLICIT null in the
 * override into the default date — so the test that meant to seed an approval
 * with no date silently seeded one with a date, and failed. That is the exact
 * defect class these suites exist to catch, in the test helper itself.
 */
function pick<T>(over: Record<string, unknown>, key: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(over, key) ? (over[key] as T) : fallback;
}

async function seed(over: Record<string, unknown> = {}): Promise<number> {
  const r = await pool.query(
    `INSERT INTO irb_submissions (organization_id, protocol_number, title, review_type, status, approval_date, expiration_date)
     VALUES ($1,'P-1','A study',$2,$3,$4,$5) RETURNING id`,
    [
      pick(over, 'org', ORG),
      pick(over, 'reviewType', 'full_board'),
      pick(over, 'status', 'approved'),
      pick<string | null>(over, 'approvalDate', '2026-03-01'),
      pick<string | null>(over, 'expirationDate', null),
    ],
  );
  return Number(r.rows[0].id);
}

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); });
beforeEach(async () => { await pglite.exec('TRUNCATE irb_submissions, irb_amendments, irb_reportable_events RESTART IDENTITY;'); });

describe('the reader passes real lists, not absent ones', () => {
  it('reports a submission with no amendments as having none, not as unassessed', async () => {
    const id = await seed();

    const { status } = await getLifecycleStatus(ORG, id, TODAY);
    const codes = status.findings.map((f) => f.code);

    // IRB-LC-010 / IRB-LC-020 are the "not supplied, so not assessed" findings.
    expect(codes).not.toContain('IRB-LC-010');
    expect(codes).not.toContain('IRB-LC-020');
  });

  it('flags a substantive amendment awaiting approval', async () => {
    const id = await seed();
    await pool.query(`INSERT INTO irb_amendments (organization_id, irb_submission_id, description, substantive, status) VALUES ($1,$2,'x',true,'submitted')`, [ORG, id]);

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.findings.map((f) => f.code)).toContain('IRB-LC-011');
  });

  /* irb_amendments has no protocol_amendment_id column, so the trace from an
     IRB amendment to the protocol amendment it came from does not exist. The
     reader passes null and the engine reports that, rather than the reader
     inventing a link. */
  it('reports every IRB amendment as untraceable to a protocol amendment, because the column does not exist', async () => {
    const id = await seed();
    await pool.query(`INSERT INTO irb_amendments (organization_id, irb_submission_id, description, substantive, status) VALUES ($1,$2,'x',false,'approved')`, [ORG, id]);

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.findings.map((f) => f.code)).toContain('IRB-LC-012');
  });

  it('reports an undated reportable event as promptness-undeterminable', async () => {
    const id = await seed();
    await pool.query(`INSERT INTO irb_reportable_events (organization_id, irb_submission_id, event_type, description, reported_date, status) VALUES ($1,$2,'noncompliance','x',NULL,'closed')`, [ORG, id]);

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.findings.map((f) => f.code)).toContain('IRB-LC-022');
  });
});

describe('the reader does not invent dates', () => {
  it('reports an approved submission with no approval date as unknown, never current', async () => {
    const id = await seed({ approvalDate: null });

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.approval).toBe('unknown');
    expect(status.undetermined).toBe(true);
    expect(status.findings.map((f) => f.code)).toContain('IRB-LC-001');
  });

  it("prefers the board's recorded expiration over the computed one", async () => {
    const id = await seed({ approvalDate: '2026-03-01', expirationDate: '2026-09-01' });

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.expirationDate).toBe('2026-09-01');
    expect(status.expirationSource).toBe('recorded');
    expect(status.approval).toBe('expired');
  });

  it('computes one year from approval when the board recorded no expiration', async () => {
    const id = await seed({ approvalDate: '2026-03-01' });

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.expirationDate).toBe('2027-03-01');
    expect(status.expirationSource).toBe('computed');
    expect(status.approval).toBe('current');
  });

  it('answers for the date it is given, not for now', async () => {
    const id = await seed({ approvalDate: '2026-03-01' });

    expect((await getLifecycleStatus(ORG, id, '2026-09-22')).status.approval).toBe('current');
    expect((await getLifecycleStatus(ORG, id, '2027-06-01')).status.approval).toBe('expired');
  });
});

describe('tenant scope', () => {
  it("does not read another organization's submission", async () => {
    const id = await seed({ org: OTHER });

    await expect(getLifecycleStatus(ORG, id, TODAY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("does not read another organization's amendments or events", async () => {
    const id = await seed();
    await pool.query(`INSERT INTO irb_amendments (organization_id, irb_submission_id, description, substantive, status) VALUES ($1,$2,'x',true,'submitted')`, [OTHER, id]);

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.findings.map((f) => f.code)).not.toContain('IRB-LC-011');
  });

  it('ignores a soft-deleted amendment', async () => {
    const id = await seed();
    await pool.query(`INSERT INTO irb_amendments (organization_id, irb_submission_id, description, substantive, status, deleted_at) VALUES ($1,$2,'x',true,'submitted',now())`, [ORG, id]);

    const { status } = await getLifecycleStatus(ORG, id, TODAY);

    expect(status.findings.map((f) => f.code)).not.toContain('IRB-LC-011');
  });
});
