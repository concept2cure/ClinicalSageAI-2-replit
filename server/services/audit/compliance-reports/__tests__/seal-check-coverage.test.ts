/**
 * The compliance report's audit_logs seal check says it did not run when it
 * verified fewer seals than the organisation's rows carry (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * The walk runs on the admin scope, which sees another tenant's rows only
 * through the policies' platform arm. On a production-shaped database with
 * that arm removed, the check counted 0 sealed rows of 3, verified none, and
 * said valid; the report then said no row carries a seal. The sealed rows are
 * now counted in the organisation's own scope, and the walk is held to them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  scopes: [] as Array<{ tenantId: string; role: string | null }>,
  ownCount: { chained: 3, sealed: 3 },
  seals: vi.fn(),
}));

vi.mock('../../../../db/withTenantConnection.js', () => ({
  withTenantConnection: async (ctx: { tenantId: string; role: string | null }, fn: (c: unknown) => unknown) => {
    h.scopes.push({ tenantId: ctx.tenantId, role: ctx.role });
    return fn({
      async query(sql: string) {
        if (sql.includes('count(*)::int AS chained, count(hmac_seal)::int AS sealed')) {
          // Only the organisation's own scope may answer the count.
          if (ctx.tenantId !== '7' || ctx.role !== null) throw new Error(`count asked on scope ${ctx.tenantId}/${ctx.role}`);
          return { rows: [h.ownCount] };
        }
        throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
      },
    });
  },
}));
vi.mock('../../chain.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyAuditChainSeals: (...a: unknown[]) => h.seals(...a),
}));

import { verifyTenantSealsOnAdminScope } from '../integrity-checks';

const report = (verified: number, valid = true) => ({ valid, brokenAt: valid ? null : 1, verified, unsealed: 0, unsealedAfterSealed: 0, firstUnsealedAfterSealed: null });

beforeEach(() => {
  process.env.AUDIT_HMAC_KEY = 'k'.repeat(32);
  h.scopes = [];
  h.ownCount = { chained: 3, sealed: 3 };
  h.seals.mockReset();
});

describe('the seal check is held to the seals the organisation\'s own scope counts', () => {
  it('a walk that verified none of the 3 sealed rows did not run: it never says valid', async () => {
    h.seals.mockResolvedValue(report(0));
    const check = await verifyTenantSealsOnAdminScope(7);
    expect(check).toEqual({
      ran: false,
      reason: "The seal check could verify 0 of the 3 sealed rows in this organisation's audit_logs, so the seals were not verified.",
    });
  });

  it('every sealed row verified: valid, with the count from the organisation\'s own scope', async () => {
    h.seals.mockResolvedValue(report(3));
    expect(await verifyTenantSealsOnAdminScope(7)).toEqual({ ran: true, valid: true, sealedRows: 3, brokenAt: null });
    expect(h.scopes[0]).toEqual({ tenantId: '7', role: null });
  });

  it('a seal that does not verify is reported broken, whatever was read', async () => {
    h.seals.mockResolvedValue(report(1, false));
    expect(await verifyTenantSealsOnAdminScope(7)).toMatchObject({ ran: true, valid: false, sealedRows: 3, brokenAt: 1 });
  });

  it('an organisation with no sealed row is said to have none, and nothing is claimed beyond it', async () => {
    h.ownCount = { chained: 2, sealed: 0 };
    h.seals.mockResolvedValue(report(0));
    expect(await verifyTenantSealsOnAdminScope(7)).toEqual({ ran: true, valid: true, sealedRows: 0, brokenAt: null });
  });
});
