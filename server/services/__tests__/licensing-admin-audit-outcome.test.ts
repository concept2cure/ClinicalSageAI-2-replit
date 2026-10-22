/** Administrative configuration persists once; the audit outcome reaches its actual caller. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../audit/auditLogger.js', () => ({ logAuditEvent: h.audit }));
import { setSeatsPurchased } from '../seat-licensing';
import { setWeeklyLimit } from '../weekly-usage-limits';

const limit = { metric: 'requests', weeklyLimit: 20, overageCapPct: 0, overageHardCap: null, warnThresholdPct: 80, weekStartDow: 1, enabled: true } as const;
let seats: number;
let savedLimit: boolean;
beforeEach(() => {
  seats = 5; savedLimit = false; h.query.mockReset(); h.audit.mockReset();
  h.query.mockImplementation(async (sql: string, args?: unknown[]) => {
    if (/UPDATE organizations SET seats_purchased/.test(sql)) { seats = Number(args?.[0]); return { rows: [{ seats_purchased: seats }] }; }
    if (/SELECT seats_purchased FROM organizations/.test(sql)) return { rows: [{ seats_purchased: seats }] };
    if (/FROM organization_users/.test(sql)) return { rows: [{ cnt: '2' }] };
    if (/FROM organization_invitations/.test(sql)) return { rows: [{ cnt: '1' }] };
    if (/INSERT INTO weekly_usage_limits/.test(sql)) { savedLimit = true; return { rows: [{ organization_id: 7, metric: 'requests', weekly_limit: 20, overage_cap_pct: 0, overage_hard_cap: null, warn_threshold_pct: 80, week_start_dow: 1, enabled: true, updated_by: 3, reason: 'Approved configuration', updated_at: new Date() }] }; }
    if (/FROM weekly_usage_limits/.test(sql)) return { rows: [] };
    throw new Error(`Unexpected test query: ${sql}`);
  });
});

describe('administrative licensing saves disclose actual audit persistence', () => {
  it.each(['saved', 'lost', 'throw', 'tamper-only'] as const)('seat configuration with audit=%s retains the durable result', async mode => {
    if (mode === 'throw') h.audit.mockRejectedValue(new Error('private audit database detail'));
    else h.audit.mockResolvedValue({ persisted: mode !== 'lost', chained: mode === 'saved', tamperProof: mode !== 'lost', error: 'private audit database detail' });
    const result = await setSeatsPurchased(7, 8, { userId: 3 }, 'Approved configuration');
    expect(result).toMatchObject({ decision: { seatsPurchased: 8, seatsConsumed: 3 } });
    expect(result.auditTrail).toMatchObject(mode === 'lost' || mode === 'throw' ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: mode === 'saved' });
    expect(seats).toBe(8);
    expect(JSON.stringify(result)).not.toContain('private audit database detail');
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'seats_purchased.update', organizationId: '7', userId: '3', metadata: { reason: 'Approved configuration', seatsConsumed: 3 } }));
  });
  it.each(['saved', 'lost', 'throw'] as const)('weekly configuration with audit=%s retains the durable result', async mode => {
    if (mode === 'throw') h.audit.mockRejectedValue(new Error('private audit database detail'));
    else h.audit.mockResolvedValue({ persisted: mode === 'saved', chained: mode === 'saved', tamperProof: mode === 'saved', error: 'private audit database detail' });
    const result = await setWeeklyLimit(7, limit, { userId: 3 }, 'Approved configuration');
    expect(result).toMatchObject({ limit: { organizationId: 7, metric: 'requests', weeklyLimit: 20 } });
    expect(result.auditTrail).toMatchObject(mode === 'saved' ? { persisted: true, chained: true } : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(savedLimit).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private audit database detail');
  });
  it('does not read a second time after a durable seat update', async () => {
    h.audit.mockResolvedValue({ persisted: true, chained: true });
    await setSeatsPurchased(7, 8, { userId: 3 }, 'Approved configuration');
    expect(h.query.mock.calls.filter(([sql]) => /SELECT seats_purchased FROM organizations/.test(sql))).toHaveLength(1);
  });
  it('does not claim a save when the organization disappeared before UPDATE', async () => {
    h.query.mockImplementation(async (sql: string) => {
      if (/UPDATE organizations/.test(sql)) return { rows: [] };
      if (/SELECT seats_purchased/.test(sql)) return { rows: [{ seats_purchased: 5 }] };
      return { rows: [{ cnt: '0' }] };
    });
    await expect(setSeatsPurchased(7, 8, { userId: 3 }, 'Approved configuration')).rejects.toThrow('Organization not found');
    expect(h.audit).not.toHaveBeenCalled();
  });
  it('invalid or conflicting seat counts do not write or audit', async () => {
    await expect(setSeatsPurchased(7, 1, { userId: 3 }, 'Approved configuration')).rejects.toMatchObject({ conflict: true });
    await expect(setSeatsPurchased(7, -1, { userId: 3 }, 'Approved configuration')).rejects.toMatchObject({ validation: expect.any(Array) });
    expect(h.query.mock.calls.some(([sql]) => /UPDATE|INSERT/.test(sql))).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
