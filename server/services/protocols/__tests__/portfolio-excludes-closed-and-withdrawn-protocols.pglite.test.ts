/**
 * The protocol portfolio does not bucket a closed or withdrawn protocol as
 * expired or due.
 *
 * What it used to do (until 2026-10-15): getPortfolioAnalytics read every
 * IACUC protocol and IRB submission whatever its status, so a study the IRB had
 * closed, or a protocol the investigator had withdrawn, was bucketed by its
 * dates — "expired", continuing review overdue — and listed as needing
 * attention, for work that has ended.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as null | { query: (t: string, p?: unknown[]) => Promise<unknown> } }));
vi.mock('../../../db', () => ({ pool: { query: (t: string, p?: unknown[]) => h.pg!.query(t, p) } }));

import { getPortfolioAnalytics } from '../protocol-portfolio-service';

const TODAY = '2026-06-10';
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  for (const t of ['iacuc_protocols', 'irb_submissions']) {
    await pg.exec(`CREATE TABLE ${t} (id serial PRIMARY KEY, organization_id int, protocol_number text, title text, status text,
      review_type text, pain_category text, risk_level text, approval_date date, expiration_date date, deleted_at timestamptz)`);
  }
  const add = (t: string, n: string, status: string) =>
    pg.query(`INSERT INTO ${t} (organization_id, protocol_number, title, status, review_type, approval_date, expiration_date)
              VALUES (7, $1, 'T', $2, 'full_board', '2025-01-01', '2026-01-01')`, [n, status]);
  await add('iacuc_protocols', 'A-OPEN', 'approved');
  await add('iacuc_protocols', 'A-WITHDRAWN', 'withdrawn');
  await add('irb_submissions', 'I-OPEN', 'approved');
  await add('irb_submissions', 'I-CLOSED', 'closed');
}, 60_000);

afterAll(async () => { await pg?.close(); });

describe('getPortfolioAnalytics', () => {
  it('leaves closed and withdrawn protocols out of the buckets and the attention lists', async () => {
    const s = await getPortfolioAnalytics(7, TODAY);
    expect(s.needsAttention.map((i) => i.protocolNumber).sort()).toEqual(['A-OPEN', 'I-OPEN']);
    expect(s.counts.combined).toMatchObject({ total: 2, expired: 2 });
  });
});
