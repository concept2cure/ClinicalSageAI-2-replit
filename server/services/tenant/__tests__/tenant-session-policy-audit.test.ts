/** The session controls surfaced by onboarding are recorded in their settings transaction. */
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  log: [] as string[],
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, any> }>,
  auditFails: false,
  settings: {} as Record<string, unknown>,
}));
const client = { query: vi.fn(async (sql: string) => { h.log.push(sql); return { rows: [] }; }) };
vi.mock('../../../../shared/schema', () => ({ organizations: { id: 'id' } }));
vi.mock('../../../db/requestDb', () => ({
  requestPgClient: () => client,
  requestDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: 7, tier: 'standard', settings: h.settings }] }) }) }) }),
    update: () => ({ set: (values: { settings: unknown }) => ({ where: () => ({ returning: async () => [{ id: 7, settings: values.settings }] }) }) }),
  }),
}));
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: async (tx: unknown, entry: Record<string, any>) => {
    h.log.push('AUDIT');
    h.auditCalls.push({ client: tx, entry });
    if (h.auditFails) throw new Error('audit refused');
  },
}));

beforeEach(() => {
  h.log = [];
  h.auditCalls = [];
  h.auditFails = false;
  h.settings = { security: { sessionTimeoutMinutes: 15, maxConcurrentSessions: 5 }, onboardingDiscovery: { unchanged: true } };
});
const req = { user: { id: 41 }, ip: '192.0.2.1', headers: {}, get: () => undefined } as unknown as Request;

describe('governed session policy values in the chained settings audit', () => {
  it('records both idle minutes and the concurrent-session limit before and after on the writer client', async () => {
    const { writeTenantSettings, overlaySettings } = await import('../tenant-settings-writer');
    const saved = await writeTenantSettings(req, 7, {
      action: 'tenant_settings_changed',
      next: (current) => overlaySettings(current, { security: { sessionTimeoutMinutes: 30, maxConcurrentSessions: 2 } }),
      sections: () => ['security'], reason: 'Reviewed session controls',
    });
    expect(saved?.security).toEqual({ sessionTimeoutMinutes: 30, maxConcurrentSessions: 2 });
    expect(saved?.onboardingDiscovery).toEqual({ unchanged: true });
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].client).toBe(client);
    expect(h.log).toEqual(['BEGIN', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls[0].entry.reason).toBe('Reviewed session controls');
    expect(h.auditCalls[0].entry.details.values.security.before).toMatchObject({ sessionTimeoutMinutes: 15, maxConcurrentSessions: 5 });
    expect(h.auditCalls[0].entry.details.values.security.after).toMatchObject({ sessionTimeoutMinutes: 30, maxConcurrentSessions: 2 });
    expect(h.auditCalls[0].entry.details.changedFields.security).toEqual(['maxConcurrentSessions', 'sessionTimeoutMinutes']);
  });

  it('refuses a session-policy change whose chained audit cannot be written', async () => {
    h.auditFails = true;
    const { writeTenantSettings, overlaySettings } = await import('../tenant-settings-writer');
    await expect(writeTenantSettings(req, 7, {
      action: 'tenant_settings_changed', next: (current) => overlaySettings(current, { security: { maxConcurrentSessions: 1 } }),
      sections: () => ['security'], reason: 'Reviewed session controls',
    })).rejects.toThrow('audit refused');
    expect(h.log).toEqual(['BEGIN', 'AUDIT', 'ROLLBACK']);
  });
});
