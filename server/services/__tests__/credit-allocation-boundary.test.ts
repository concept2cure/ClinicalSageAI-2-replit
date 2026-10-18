/** Credit allocation is administrative until a reviewed charge contract exists. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), connect: vi.fn(), release: vi.fn(), audit: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: h.query, connect: h.connect } }));
vi.mock('../auditService', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../audit/auditLogger.js', () => ({ logAuditEvent: vi.fn().mockResolvedValue({ persisted: true, chained: true }) }));
import { addCreditEntry, debitCredits, getAutoReload, maybeAutoReload, setAutoReload } from '../credit-ledger';

const SETTINGS = { organization_id: 7, enabled: true, threshold_cents: 1000, topup_cents: 2500 };
beforeEach(() => {
  vi.clearAllMocks();
  h.audit.mockResolvedValue(undefined);
  h.connect.mockResolvedValue({ query: h.tx, release: h.release });
  h.query.mockImplementation(async (sql: string) => ({ rows: /credit_autoreload_settings/.test(sql) ? [SETTINGS] : [] }));
  h.tx.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (/FROM credit_autoreload_settings/.test(sql)) return { rows: [SETTINGS] };
    if (/SUM\(amount_cents\)/.test(sql)) return { rows: [{ balance: '500' }] };
    if (/INSERT INTO credit_ledger/.test(sql)) return { rows: [{ id: 19, organization_id: args[0], entry_type: args[1], amount_cents: args[2], balance_after_cents: args[3], description: args[4], created_by: args[6] }] };
    return { rows: [] };
  });
});

describe('unsupported charging refuses before changing the ledger', () => {
  it('does not accept an automatic-charge enablement', async () => {
    await expect(setAutoReload(7, { enabled: true, thresholdCents: 1000, topupCents: 2500 }, { userId: 3 }, 'Keep the pilot running')).rejects.toMatchObject({ code: 'CREDIT_CAPABILITY_UNAVAILABLE', capability: 'autoReload' });
    expect(h.query.mock.calls.some(([s]) => /INSERT|UPDATE/.test(String(s)))).toBe(false);
  });
  it('keeps a legacy enablement request distinct from effective capability', async () => {
    expect(await getAutoReload(7)).toMatchObject({ enabled: false, requestedEnabled: true, available: false });
  });
  it('cannot mint an unpaid reload even for a saved enabled request', async () => {
    expect(await maybeAutoReload(7)).toBeNull();
    expect(h.connect).not.toHaveBeenCalled();
  });
  it.each(['purchase', 'auto_reload', 'debit'] as const)('refuses a %s ledger entry without its charging contract', async (entryType) => {
    await expect(addCreditEntry(7, { entryType, amountCents: 100, description: 'Attempt unsupported movement' }, { userId: 3 })).rejects.toMatchObject({ code: 'CREDIT_CAPABILITY_UNAVAILABLE' });
    expect(h.connect).not.toHaveBeenCalled();
  });
  it('does not translate metered feature units into money or debit an allocation', async () => {
    await expect(debitCredits(7, 100, { description: 'An AI run', reference: 'run-1' })).rejects.toMatchObject({ code: 'CREDIT_CAPABILITY_UNAVAILABLE', capability: 'usageDebit' });
    expect(h.connect).not.toHaveBeenCalled();
  });
});

describe('administrative allocation remains a governed transaction', () => {
  it('writes the allocation and its chained reason/actor before commit', async () => {
    const entry = await addCreditEntry(7, { entryType: 'grant', amountCents: 100, description: 'Pilot allocation' }, { userId: 3 });
    expect(entry).toMatchObject({ id: 19, amountCents: 100, balanceAfterCents: 600 });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ query: h.tx }), expect.objectContaining({ tenantId: 7, userId: 3, action: 'billing.credit_allocation.grant', reason: 'Pilot allocation', details: expect.objectContaining({ reason: 'Pilot allocation', amountCents: 100 }) }));
    const commit = h.tx.mock.calls.findIndex(([s]) => s === 'COMMIT');
    expect(h.audit.mock.invocationCallOrder[0]).toBeLessThan(h.tx.mock.invocationCallOrder[commit]);
    expect(h.release).toHaveBeenCalledTimes(1);
  });
  it('rolls back an allocation when its audit row cannot be recorded', async () => {
    h.audit.mockRejectedValueOnce(new Error('audit storage unavailable'));
    await expect(addCreditEntry(7, { entryType: 'grant', amountCents: 100, description: 'Pilot allocation' }, { userId: 3 })).rejects.toThrow('audit storage unavailable');
    expect(h.tx).toHaveBeenCalledWith('ROLLBACK');
    expect(h.tx).not.toHaveBeenCalledWith('COMMIT');
  });
  it('requires an identified actor and a reason before acquiring a connection', async () => {
    await expect(addCreditEntry(7, { entryType: 'grant', amountCents: 100 })).rejects.toThrow();
    expect(h.connect).not.toHaveBeenCalled();
  });
});
