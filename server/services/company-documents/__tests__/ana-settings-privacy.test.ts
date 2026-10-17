/** AnA's real general-settings controller cannot bypass the company library's
 * project filtering. The paid-access decision and canonical writer are seams;
 * the controller and settings projection remain real. */
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ writer: vi.fn(), select: vi.fn() }));
vi.mock('../../../db', () => ({ db: { select: h.select } }));
vi.mock('../../../../shared/schema', () => ({ organizations: { id: 'id' }, projects: { id: 'id' } }));
vi.mock('../../auditService.js', () => ({ default: { logAction: vi.fn() }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../tenant/tenant-settings-writer', async original => ({
  ...(await original<typeof import('../../tenant/tenant-settings-writer')>()),
  writeTenantSettings: h.writer,
}));

import { anaPlatformController } from '../../ana-platform-controller';

const privateLibrary = {
  revision: 4, address: 'private-company-address',
  legalDocuments: [{ programId: 'private-program-id', vaultDocumentId: 'private-vault-version', title: 'private-legal-title' }],
};
const settings = { brandName: 'Ordinary brand preference', timezone: 'UTC', companyDocuments: privateLibrary };
const req = { user: { id: 3, organizationId: 7, role: 'admin' } } as unknown as Request;

beforeEach(() => {
  h.writer.mockReset();
  h.select.mockReset();
  vi.spyOn(anaPlatformController, 'verifyPaidAccess').mockResolvedValue({
    authorized: true, org: { settings: globalThis.structuredClone(settings), tier: 'enterprise', seatsPurchased: 5 },
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('AnA general settings privacy', () => {
  it('returns ordinary preferences without private company or Vault registry metadata', async () => {
    const response = await anaPlatformController.getSettings(7);
    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({ settings: { brandName: 'Ordinary brand preference', timezone: 'UTC' }, tier: 'enterprise' });
    expect((response.result as { settings: unknown }).settings).not.toHaveProperty('companyDocuments');
    expect(JSON.stringify(response)).not.toContain('private-');
    expect(settings.companyDocuments).toEqual(privateLibrary);
    expect(h.select).not.toHaveBeenCalled();
  });

  it('redacts the profile from an unrelated update result while preserving it in the writer input', async () => {
    h.writer.mockImplementation(async (_req: Request, _organizationId: number, change: { next: (current: typeof settings) => Record<string, unknown> }) => change.next(globalThis.structuredClone(settings)));
    const response = await anaPlatformController.updateSettings(7, { timezone: 'America/Los_Angeles' }, req);
    expect(response.success).toBe(true);
    expect(response.result).toMatchObject({ applied: ['timezone'], settings: { timezone: 'America/Los_Angeles' } });
    expect((response.result as { settings: unknown }).settings).not.toHaveProperty('companyDocuments');
    expect(JSON.stringify(response)).not.toContain('private-');
    const next = h.writer.mock.calls[0][2].next(globalThis.structuredClone(settings));
    expect(next.companyDocuments).toEqual(privateLibrary);
    expect(h.writer).toHaveBeenCalledWith(req, 7, expect.objectContaining({ action: 'tenant_settings_changed' }));
  });

  it.each([privateLibrary, null])('refuses a named company library update before checking paid access or writing', async companyDocuments => {
    const response = await anaPlatformController.updateSettings(7, { companyDocuments } as never, req);
    expect(response).toMatchObject({ success: false, action: 'update_settings', error: expect.stringContaining('Company documents') });
    expect(anaPlatformController.verifyPaidAccess).not.toHaveBeenCalled();
    expect(h.writer).not.toHaveBeenCalled();
  });
});
