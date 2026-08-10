/**
 * checkProgramQuota — the enforceable licensed-program count.
 *
 * The behaviour under test is the one the old checkProjectQuota got wrong in
 * three separate ways: it counted the legacy integer-keyed `projects` table
 * that the shipped UI never writes to, it returned { withinQuota: true } from
 * its catch, and nothing called it on a create path. These lock the replacement
 * so it cannot regress into any of those.
 *
 * The fail-closed case is the important one. pool.query is wrapped by
 * instrumentPool, which applies the AsyncLocalStorage tenant scope and raises
 * when no scope is active — so "the count threw" is a reachable production
 * state, not a hypothetical, and under the old fail-open shape it granted
 * unlimited programs precisely when the control stopped working.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { checkProgramQuota } from '../license-manager';

beforeEach(() => {
  query.mockReset();
});

/** Both statements the check issues, in the order Promise.all resolves them. */
function mockQuota(maxProjects: unknown, count: number) {
  query
    .mockResolvedValueOnce({ rows: [{ max_projects: maxProjects }] })
    .mockResolvedValueOnce({ rows: [{ cnt: count }] });
}

describe('checkProgramQuota', () => {
  it('counts regulatory_programs, not the legacy projects table', async () => {
    mockQuota(10, 3);
    const result = await checkProgramQuota(7);

    expect(result).toEqual({ withinQuota: true, currentCount: 3, maxAllowed: 10, unlimited: false });
    const counted = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(counted).toContain('FROM regulatory_programs');
    // The old check counted `projects`, which the v2 wizard never writes to, so
    // it returned 0 forever and could not trip.
    expect(counted).not.toMatch(/FROM\s+projects\b/);
  });

  it('excludes soft-deleted programs so an archived one stops consuming a seat', async () => {
    mockQuota(10, 3);
    await checkProgramQuota(7);
    const counted = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(counted).toContain('deleted_at IS NULL');
  });

  it('scopes both statements to the organization', async () => {
    mockQuota(10, 3);
    await checkProgramQuota(7);

    // Every statement is parameterised on the caller's org and nothing else —
    // the entitlement is read by organizations.id, the count by the programs'
    // organization_id, and neither interpolates.
    expect(query.mock.calls).toHaveLength(2);
    for (const call of query.mock.calls) {
      expect(call[1]).toEqual([7]);
    }
    const [entitlementSql, countSql] = query.mock.calls.map((c) => String(c[0]));
    expect(entitlementSql).toContain('FROM organizations');
    expect(entitlementSql).toContain('id = $1');
    expect(countSql).toContain('organization_id = $1');
  });

  it('trips at the limit — the Nth program is refused, not the Nth+1', async () => {
    mockQuota(10, 10);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({ withinQuota: false });

    query.mockReset();
    mockQuota(10, 9);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({ withinQuota: true });
  });

  it('falls back to the default entitlement when max_projects is unset', async () => {
    mockQuota(null, 0);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({ maxAllowed: 10 });
  });

  it('treats a negative entitlement as UNLIMITED, not as a limit of -1', async () => {
    // billing.ts:91 documents `-1 = unlimited` and the enterprise tiers use it.
    // Read naively, -1 is a truthy entitlement and `count < -1` is never true —
    // so the highest-paying tier would be the only one that could never create
    // another program. tenants-simple.ts passes -1 through unnormalized.
    mockQuota(-1, 3);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({
      withinQuota: true, currentCount: 3, unlimited: true,
    });

    query.mockReset();
    mockQuota(-1, 100_000);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({ withinQuota: true });
  });

  it('honours a ZERO entitlement instead of defaulting it to 10', async () => {
    // A suspended org or an expired trial is deliberately set to 0. `|| 10`
    // treats that as "not recorded" and hands back the default — the fail-open
    // shape this function exists to remove. Only NULL means unrecorded.
    mockQuota(0, 0);
    await expect(checkProgramQuota(7)).resolves.toMatchObject({
      withinQuota: false, maxAllowed: 0,
    });
  });

  it('RETHROWS an unprovisioned store rather than reporting it as a quota denial', async () => {
    // 42P01 is not a billing decision. Swallowing it as withinQuota:false makes
    // the caller's documented 503 PENDING_STORE unreachable and tells the user
    // their plan is full when the table simply does not exist.
    query.mockRejectedValue(Object.assign(new Error('relation missing'), { code: '42P01' }));
    await expect(checkProgramQuota(7)).rejects.toMatchObject({ code: '42P01' });
  });

  it('FAILS CLOSED when the count cannot be read', async () => {
    query.mockRejectedValue(new Error('missing tenant scope'));
    // The regression this guards: the predecessor returned withinQuota true
    // here, so a dropped connection or an RLS denial silently granted unlimited
    // programs at the exact moment the control stopped working.
    await expect(checkProgramQuota(7)).resolves.toMatchObject({ withinQuota: false });
  });

  it('fails closed when the organization row is missing entirely', async () => {
    // Both queries succeed; the org simply is not there. Previously this case
    // fell through `rows[0]?.max_projects || 10` to the default entitlement and
    // ALLOWED the create — and this test only appeared to cover it because it
    // forced the COUNT query to reject instead.
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
    await expect(checkProgramQuota(7)).resolves.toMatchObject({
      withinQuota: false, maxAllowed: 0,
    });
  });
});
