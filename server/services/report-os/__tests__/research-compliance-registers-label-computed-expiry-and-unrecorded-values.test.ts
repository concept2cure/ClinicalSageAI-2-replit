/**
 * The IACUC, IBC and IRB registers count what is not on record, and say so
 * (2026-10-15).
 *
 * iacuc.protocol_register counted expiringOrExpired over expiration_date alone,
 * so an approval with no expiry on record (normal since the approve path stores
 * only a date the committee set) dropped out: a protocol past its 3-year de novo
 * date read as not expiring. byBsl and byReviewType keyed a NULL value "null".
 * Now the expiry is the one on record, else approval + 3 years, counted apart
 * as computed; an approval with neither date is counted as not determined; and
 * an unrecorded value reads not_declared / not_recorded.
 *
 * Real PostgreSQL (PGlite) over the columns these queries read.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: q.query }, db: {} }));
import { computeDomainReport } from '../research-compliance-report-providers';

let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE iacuc_protocols (id integer PRIMARY KEY, organization_id integer, status text, approval_date date, expiration_date date, deleted_at timestamp);
    CREATE TABLE ibc_registrations (id integer PRIMARY KEY, organization_id integer, status text, biosafety_level text, deleted_at timestamp);
    CREATE TABLE irb_submissions (id integer PRIMARY KEY, organization_id integer, status text, review_type text, deleted_at timestamp);
    INSERT INTO iacuc_protocols VALUES
      (1, 7, 'approved', (CURRENT_DATE - INTERVAL '3 years' + INTERVAL '30 days')::date, NULL, NULL),
      (2, 7, 'approved', (CURRENT_DATE - INTERVAL '4 years')::date, NULL, NULL),
      (3, 7, 'approved', (CURRENT_DATE - INTERVAL '10 days')::date, NULL, NULL),
      (4, 7, 'approved', (CURRENT_DATE - INTERVAL '300 days')::date, (CURRENT_DATE + INTERVAL '10 days')::date, NULL),
      (5, 7, 'approved', NULL, NULL, NULL),
      (6, 7, 'draft', NULL, NULL, NULL),
      (7, 7, 'approved', (CURRENT_DATE - INTERVAL '4 years')::date, NULL, CURRENT_TIMESTAMP),
      (8, 8, 'approved', (CURRENT_DATE - INTERVAL '4 years')::date, NULL, NULL);
    INSERT INTO ibc_registrations VALUES (1, 7, 'draft', 'BSL-2', NULL), (2, 7, 'draft', NULL, NULL), (3, 7, 'approved', NULL, NULL), (4, 8, 'draft', NULL, NULL);
    INSERT INTO irb_submissions VALUES (1, 7, 'approved', 'full_board', NULL), (2, 7, 'draft', NULL, NULL);
  `);
  q.query.mockImplementation((text: string, params: unknown[]) => database.query(text, params));
});
afterAll(async () => { await database?.close(); });

describe('iacuc.protocol_register', () => {
  /* 1: computed expiry in 30 days; 2: computed a year ago; 3: computed ~3 years
     out; 4: on record in 10 days; 5: neither date; 6 draft, 7 deleted, 8 another org. */
  it('counts an approval with no expiry on record by approval + 3 years, and says how many dates were computed', async () => {
    const report = await computeDomainReport('iacuc.protocol_register', 7);
    expect(report?.summary).toMatchObject({
      protocols: 6,
      expiringOrExpired: 3,
      expiringOrExpiredByExpirySource: { recorded: 1, computed_approval_plus_3_years: 2 },
      approvedExpiryNotDetermined: 1,
    });
  });
});

describe('an unrecorded value is labelled, not keyed "null"', () => {
  it('reads an undeclared containment level as not_declared', async () => {
    const report = await computeDomainReport('ibc.registration_register', 7);
    expect(report?.summary.byBsl).toEqual({ 'BSL-2': 1, not_declared: 2 });
  });

  it('reads an unrecorded review type as not_recorded', async () => {
    const report = await computeDomainReport('irb.submission_register', 7);
    expect(report?.summary.byReviewType).toEqual({ full_board: 1, not_recorded: 1 });
  });
});
