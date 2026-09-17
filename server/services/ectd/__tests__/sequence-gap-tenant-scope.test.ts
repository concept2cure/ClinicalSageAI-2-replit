/**
 * Sequence-history reads are tenant-scoped.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * `detectSequenceGaps` queried both history tables on `application_number`
 * ALONE:
 *
 *     SELECT sequence_number FROM ectd_compilations WHERE application_number = $1
 *     SELECT sequence_number FROM ectd_submissions  WHERE application_number = $1
 *
 * — a cross-tenant read, in a codebase that tenant-scopes every other regulated
 * query. It is also wrong in both directions functionally: on a shared
 * application number, one org's history reports SEQ_DUPLICATE against another
 * org's legitimate 0000, or manufactures a SEQ_GAP from filings the caller
 * never made. FDA-assigned numbers are unique in production, but nothing in
 * this code enforces that and the CRO multi-sponsor model makes a shared-number
 * environment ordinary.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 *   1. every history query carries the organization id;
 *   2. a missing/invalid tenant BLOCKS rather than falling back to an unscoped
 *      read — an ungatekeepable gate is not a gate; and
 *   3. a secondary table that cannot BE scoped (no organization_id column) is
 *      dropped from the history rather than read across tenants, and the drop
 *      fails toward blocking.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db.js', () => ({
  pool: { query },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

import { detectSequenceGaps } from '../ectd-validator-hardening';

const APP = 'IND123456';
const ORG = 42;

/** A Postgres-shaped error carrying a SQLSTATE. */
function pgError(code: string) {
  return Object.assign(new Error(`pg ${code}`), { code });
}

beforeEach(() => {
  query.mockReset();
});

describe('every sequence-history query is tenant-scoped', () => {
  it('passes the organization id to the primary history table', async () => {
    query.mockResolvedValue({ rows: [] });
    await detectSequenceGaps(APP, '0000', ORG);

    expect(query).toHaveBeenCalled();
    const [sqlText, params] = query.mock.calls[0];
    expect(String(sqlText)).toMatch(/ectd_compilations/);
    expect(String(sqlText)).toMatch(/organization_id\s*=\s*\$2/);
    expect(params).toEqual([APP, ORG]);
  });

  it('passes the organization id to the secondary history table too', async () => {
    query.mockResolvedValue({ rows: [] });
    await detectSequenceGaps(APP, '0000', ORG);

    const secondary = query.mock.calls.find(c => /ectd_submissions/.test(String(c[0])));
    expect(secondary, 'the secondary history table must be queried').toBeTruthy();
    expect(String(secondary![0])).toMatch(/organization_id\s*=\s*\$2/);
    expect(secondary![1]).toEqual([APP, ORG]);
  });

  it('never issues a history query without an organization parameter', async () => {
    query.mockResolvedValue({ rows: [] });
    await detectSequenceGaps(APP, '0000', ORG);

    for (const [sqlText, params] of query.mock.calls) {
      if (!/ectd_compilations|ectd_submissions/.test(String(sqlText))) continue;
      expect(params, `unscoped history query: ${String(sqlText)}`).toContain(ORG);
    }
  });
});

describe('an unusable tenant scope blocks rather than falling back', () => {
  it.each([0, -1, Number.NaN])('blocks on organizationId=%s and issues NO query', async bad => {
    query.mockResolvedValue({ rows: [] });
    const findings = await detectSequenceGaps(APP, '0001', bad as number);

    expect(findings.some(f => f.code === 'SEQ_TENANT_SCOPE_MISSING')).toBe(true);
    expect(findings.every(f => f.severity === 'error')).toBe(true);
    // The point of failing closed: no unscoped read is attempted at all.
    expect(query).not.toHaveBeenCalled();
  });

  it('says the history was not verified, never that there is none', async () => {
    const findings = await detectSequenceGaps(APP, '0001', 0);
    const f = findings.find(x => x.code === 'SEQ_TENANT_SCOPE_MISSING')!;
    expect(f.message).toMatch(/could not be verified/i);
    expect(f.message).toMatch(/never read across tenants/i);
  });
});

describe('a secondary table that cannot be scoped is dropped, not read', () => {
  it('carries on with the primary when ectd_submissions has no organization_id', async () => {
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(String(sqlText))) throw pgError('42703'); // undefined_column
      return { rows: [{ sequence_number: '0000' }] };
    });

    const findings = await detectSequenceGaps(APP, '0001', ORG);
    // 0000 known from the primary, 0001 is the expected next → no gap finding.
    expect(findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });

  it('still tolerates the table being absent entirely', async () => {
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(String(sqlText))) throw pgError('42P01'); // undefined_table
      return { rows: [{ sequence_number: '0000' }] };
    });

    const findings = await detectSequenceGaps(APP, '0001', ORG);
    expect(findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });

  it('dropping the secondary fails toward BLOCKING, never toward a silent pass', async () => {
    // Primary empty + secondary unscopable: the history is now empty, and an
    // empty history with a non-0000 sequence must block rather than wave it
    // through as a first-ever submission.
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(String(sqlText))) throw pgError('42703');
      return { rows: [] };
    });

    const findings = await detectSequenceGaps(APP, '0007', ORG);
    expect(findings.some(f => f.code === 'SEQ_FIRST_NOT_0000' && f.severity === 'error')).toBe(true);
  });

  it('a real outage on the secondary still blocks (not treated as unscopable)', async () => {
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(String(sqlText))) throw pgError('57P01'); // admin_shutdown
      return { rows: [] };
    });

    const findings = await detectSequenceGaps(APP, '0001', ORG);
    expect(findings.some(f => f.code === 'SEQ_QUERY_FAILED' && f.severity === 'error')).toBe(true);
  });
});

describe('tenant scoping changes the verdict, not just the SQL', () => {
  it('does not see another tenant’s sequence as a duplicate', async () => {
    // The scoped query returns only THIS org's history — empty — so a 0000
    // filing is a legitimate first submission even though another tenant holds
    // 0000 under the same application number.
    query.mockResolvedValue({ rows: [] });

    const findings = await detectSequenceGaps(APP, '0000', ORG);
    expect(findings.some(f => f.code === 'SEQ_DUPLICATE')).toBe(false);
    expect(findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });
});
