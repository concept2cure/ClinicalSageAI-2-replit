import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), caps: vi.fn(), segments: vi.fn(), accessible: vi.fn() }));
vi.mock('../../../../db', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('../../../../middleware/orgMembership', () => ({ GOVERNED_WRITE_ROLES: new Set(['admin', 'manager', 'member']) }));
vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: mocks.caps }));
vi.mock('../../segment', () => ({ deriveScopeSegments: mocks.segments, deriveOrgSegments: mocks.segments, filterTypesForSegment: (types: unknown[]) => types }));
vi.mock('../../project-access', () => ({ getAccessibleReportProjectIds: mocks.accessible }));
import { validateSubscriptionConfiguration } from '../configuration';
import type { CreateSubscriptionInput } from '../subscription-service';

const input: CreateSubscriptionInput = { organizationId: 11, createdBy: 42, scopeType: 'project', scopeId: '100', reportTypeId: 'readiness.executive_digest', schedule: { cadence: 'daily', hour: 9, timeZone: 'Europe/London' }, channel: 'platform' };
beforeEach(() => {
  mocks.query.mockReset(); mocks.caps.mockResolvedValue({ tier: 'professional' }); mocks.segments.mockResolvedValue(['ivd']);
  mocks.accessible.mockReset().mockResolvedValue([100]);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ou.role')) return { rows: [{ role: 'member' }] };
    if (sql.includes('report_type_registry')) return { rows: [{ type_id: 'readiness.executive_digest', label: 'Readiness', family: 'readiness', allowed_scopes: ['project'], allowed_client_segments: [] }] };
    if (sql.includes('FROM projects')) return { rows: [{ id: 100 }] };
    if (sql.includes('lower(u.email)')) return { rows: [] };
    throw new Error('Unexpected query');
  });
});
describe('subscription configuration gates', () => {
  it('binds delivery to the active creator, supported engine and owned scope', async () => {
    expect(await validateSubscriptionConfiguration(input)).toMatchObject({ recipientUserIds: [42], projectId: 100, availability: { engine: 'readiness', runnable: true } });
  });
  it('refuses external delivery before any output or database write', async () => {
    await expect(validateSubscriptionConfiguration({ ...input, channel: 'external' })).rejects.toMatchObject({ code: 'REPORT_EXTERNAL_TRANSPORT_UNAVAILABLE' });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('refuses a creator who is now a viewer', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ role: 'viewer' }] });
    await expect(validateSubscriptionConfiguration(input)).rejects.toMatchObject({ code: 'REPORT_CREATOR_NOT_AUTHORIZED' });
  });
  it('rechecks subscription entitlement at fire time', async () => {
    mocks.caps.mockResolvedValueOnce({ tier: 'standard' });
    await expect(validateSubscriptionConfiguration(input)).rejects.toMatchObject({ code: 'REPORT_SCHEDULE_NOT_ENTITLED', status: 403 });
  });
  it('fails closed when the organization plan cannot be resolved', async () => {
    mocks.caps.mockRejectedValueOnce(new Error('plan unavailable'));
    await expect(validateSubscriptionConfiguration(input)).rejects.toMatchObject({ code: 'REPORT_SCHEDULE_NOT_ENTITLED', status: 403, message: expect.stringContaining('could not be read') });
  });
  it('does not accept a client filter for an organization-wide register', async () => {
    mocks.query.mockImplementationOnce(async () => ({ rows: [{ role: 'member' }] })).mockImplementationOnce(async () => ({ rows: [{ type_id: 'irb.submission_register', label: 'IRB', family: 'irb', allowed_scopes: ['project'], allowed_client_segments: [] }] }));
    await expect(validateSubscriptionConfiguration({ ...input, reportTypeId: 'irb.submission_register', clientWorkspaceId: 7 })).rejects.toMatchObject({ code: 'REPORT_CLIENT_SCOPE_UNSUPPORTED' });
  });
  it('does not accept a declared report scope that the engine does not compute', async () => {
    await expect(validateSubscriptionConfiguration({ ...input, scopeType: 'account', scopeId: '11' })).rejects.toMatchObject({ code: 'REPORT_TYPE_NOT_COMPUTED' });
  });
  it('refuses a named regional type with no computation', async () => {
    mocks.query.mockImplementationOnce(async () => ({ rows: [{ role: 'member' }] })).mockImplementationOnce(async () => ({ rows: [{ type_id: 'ema.psur_pbrer_pack', label: 'EMA', family: 'ema', allowed_scopes: ['project'], allowed_client_segments: [] }] }));
    await expect(validateSubscriptionConfiguration({ ...input, reportTypeId: 'ema.psur_pbrer_pack' })).rejects.toMatchObject({ code: 'REPORT_TYPE_NOT_COMPUTED' });
  });
  it('refuses a foreign project and never resolves recipients', async () => {
    mocks.query.mockImplementationOnce(async () => ({ rows: [{ role: 'member' }] })).mockImplementationOnce(async () => ({ rows: [{ type_id: input.reportTypeId, label: 'Readiness', family: 'readiness', allowed_scopes: ['project'], allowed_client_segments: [] }] })).mockImplementationOnce(async () => ({ rows: [] }));
    await expect(validateSubscriptionConfiguration(input)).rejects.toMatchObject({ code: 'REPORT_SCOPE_NOT_FOUND', status: 404 });
  });
  it('refuses external or removed recipients instead of sending to arbitrary emails', async () => {
    await expect(validateSubscriptionConfiguration({ ...input, recipients: ['foreign@example.com'] })).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_NOT_IN_ORGANIZATION' });
  });
  it('refuses a writing member who cannot use the private project', async () => {
    mocks.accessible.mockResolvedValueOnce([]);
    await expect(validateSubscriptionConfiguration(input)).rejects.toMatchObject({ code: 'REPORT_CREATOR_PROJECT_ACCESS_DENIED', status: 403 });
  });
  it('refuses a recipient who belongs to the organization but cannot use the private project', async () => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => sql.includes('lower(u.email)')
      ? { rows: [{ id: 45, email: 'recipient@example.com', role: 'viewer' }] } : query(sql, args));
    mocks.accessible.mockResolvedValueOnce([100]).mockResolvedValueOnce([]);
    await expect(validateSubscriptionConfiguration({ ...input, recipients: ['recipient@example.com'] })).rejects.toMatchObject({ code: 'REPORT_RECIPIENT_PROJECT_ACCESS_DENIED', status: 403 });
  });
  it('allows a recipient with actual project-use access and passes its current membership role', async () => {
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, args: unknown[]) => sql.includes('lower(u.email)')
      ? { rows: [{ id: 45, email: 'recipient@example.com', role: 'viewer' }] } : query(sql, args));
    expect(await validateSubscriptionConfiguration({ ...input, recipients: ['recipient@example.com'] })).toMatchObject({ recipientUserIds: [45] });
    expect(mocks.accessible).toHaveBeenCalledWith(11, { userId: 42, role: 'member' });
    expect(mocks.accessible).toHaveBeenCalledWith(11, { userId: 45, role: 'viewer' });
  });
});
