import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ validate: vi.fn(), compute: vi.fn(), persist: vi.fn(), notification: vi.fn(), audit: vi.fn(), query: vi.fn() }));
vi.mock('../configuration', () => ({ validateSubscriptionConfiguration: mocks.validate }));
vi.mock('../../compute-run', () => ({ computeRunForType: mocks.compute }));
vi.mock('../../persistence', () => ({ persistReportRun: mocks.persist }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: mocks.notification }));
vi.mock('../../../auditService', () => ({ writeChainedAuditRow: mocks.audit }));
import { generateAndDeliver, subscriptionRunUuid } from '../generate-deliver';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';
const sub = { id: 10, organizationId: 11, createdBy: 42, clientWorkspaceId: null, persona: null, reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '100', schedule: { cadence: 'daily', hour: 9 }, channel: 'platform', format: 'in_app', recipients: [], enabled: true, nextRunAt: new Date('2026-10-10T09:00:00Z'), lastRunAt: null, createdAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date('2026-10-09T10:00:00Z') } as ReportSubscriptionRow;
const now = new Date('2026-10-10T09:01:00Z');
beforeEach(() => {
  Object.values(mocks).forEach(fn => fn.mockReset());
  mocks.validate.mockResolvedValue({ reportType: { label: 'Readiness' }, availability: { engine: 'readiness', computedScope: 'project' }, recipientUserIds: [42] });
  mocks.compute.mockResolvedValue({ computed: { providers: [{ provider: 'submission_readiness', status: 'partial', observedAt: now.toISOString(), atoms: [{ sourceId: 'a' }], calculation: { method: 'requirements' } }], blockers: ['Section missing'], criticalBlockers: [], confidence: null, summary: { recorded: 1 } } });
  mocks.query.mockResolvedValue({ rows: [{ id: sub.id }] }); mocks.notification.mockResolvedValue(80); mocks.audit.mockResolvedValue(undefined);
  mocks.persist.mockImplementation(async (_rows, _actor, effect) => { await effect({ query: mocks.query }, { run: { id: 999 }, snapshot: { id: 1000 } }); });
});
describe('governed scheduled output', () => {
  it('persists the exact computation and commits notification, audit and cursor together', async () => {
    await generateAndDeliver(sub, now);
    expect(mocks.compute).toHaveBeenCalledWith(expect.objectContaining({ engine: 'readiness', typeId: sub.reportTypeId, organizationId: 11, scopeType: 'project', scopeId: '100' }));
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ run: expect.objectContaining({ organizationId: 11, status: 'partial', confidence: null, blockers: ['Section missing'] }), snapshot: expect.objectContaining({ organizationId: 11, snapshotMetadata: expect.objectContaining({ summary: { recorded: 1, computedScope: 'project' } }) }), dependencies: [expect.objectContaining({ payload: expect.objectContaining({ calculation: { method: 'requirements' } }) })] }), expect.objectContaining({ userId: 42 }), expect.any(Function));
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: 42, resourceType: 'report_run', resourceId: '999' }), expect.objectContaining({ query: mocks.query }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ query: mocks.query }), expect.objectContaining({ action: 'report_os.subscription_delivered', details: expect.objectContaining({ notificationIds: [80] }) }));
    expect(mocks.query.mock.calls[0][1]).toContainEqual(new Date('2026-10-11T09:00:00Z'));
  });
  it('uses the domain engine for a register rather than the readiness digest', async () => {
    mocks.validate.mockResolvedValueOnce({ reportType: { label: 'FCOI' }, availability: { engine: 'domain', computedScope: 'organization' }, recipientUserIds: [42] });
    mocks.compute.mockResolvedValueOnce({ computed: { providers: [], blockers: [], criticalBlockers: [], confidence: null, summary: { domainScope: 'organization' } } });
    await generateAndDeliver({ ...sub, reportTypeId: 'fcoi.disclosure_register' }, now);
    expect(mocks.compute).toHaveBeenCalledWith(expect.objectContaining({ engine: 'domain', typeId: 'fcoi.disclosure_register', organizationId: 11, scopeType: 'project', scopeId: '100' }));
    expect(mocks.notification.mock.calls[0][0].body).toContain('covers the organization');
  });
  it('uses the shared regional dispatch without inventing an empty registry declaration', async () => {
    mocks.validate.mockResolvedValueOnce({ reportType: { label: 'EMA' }, availability: { engine: 'regional', computedScope: 'project' }, recipientUserIds: [42] });
    await generateAndDeliver({ ...sub, reportTypeId: 'ema.maa_readiness_assessment' }, now);
    const asked = mocks.compute.mock.calls[0][0];
    expect(asked.engine).toBe('regional');
    expect(asked.declared).toBeUndefined();
    expect(asked.explicitRegistryId).toBeUndefined();
  });
  it('does not produce output for disabled or future occurrences', async () => {
    await expect(generateAndDeliver({ ...sub, enabled: false }, now)).rejects.toThrow('disabled');
    await expect(generateAndDeliver({ ...sub, nextRunAt: new Date('2026-10-11T09:00:00Z') }, now)).rejects.toThrow('not due');
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it('aborts the same transaction if notification persistence fails', async () => {
    mocks.notification.mockRejectedValueOnce(new Error('notification unavailable'));
    await expect(generateAndDeliver(sub, now)).rejects.toThrow('notification unavailable');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('refuses output if the subscription was disabled or edited while computing', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(generateAndDeliver(sub, now)).rejects.toThrow('subscription changed');
    expect(mocks.notification).not.toHaveBeenCalled();
  });
  it('generates stable distinct occurrence identities', () => {
    expect(subscriptionRunUuid(sub, sub.nextRunAt!)).toBe(subscriptionRunUuid(sub, sub.nextRunAt!));
    expect(subscriptionRunUuid(sub, sub.nextRunAt!)).not.toBe(subscriptionRunUuid({ ...sub, id: 12 }, sub.nextRunAt!));
    expect(subscriptionRunUuid(sub, sub.nextRunAt!)).not.toBe(subscriptionRunUuid(sub, now));
  });
  it('validation failure produces no run or notification', async () => {
    mocks.validate.mockRejectedValueOnce(new Error('not authorized'));
    await expect(generateAndDeliver(sub, now)).rejects.toThrow('not authorized');
    expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.notification).not.toHaveBeenCalled();
  });
});
