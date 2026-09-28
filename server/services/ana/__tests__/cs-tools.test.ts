/**
 * Controlled Substances AnA tools (C2C-15) — registration + input guards.
 */

import { describe, it, expect, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

/* 2026-09-28: a confirm-class call now passes the registry's editor-role gate
   (writeRoleRefusal) before its handler; the input-guard cases below model a
   confirmed caller who may edit, so the principal's role is an editor one. */
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

const TOOLS = ['register_dea', 'log_cs_transaction', 'review_cs_balance'];

describe('Controlled Substances AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Controlled Substances AnA tools — context + input guards', () => {
  it('register_dea refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('register_dea')!({ registrant_name: 'Lab', dea_number: 'X', business_activity: 'researcher' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('register_dea rejects an invalid business_activity', async () => {
    const out = JSON.parse(await getToolHandler('register_dea')!({ registrant_name: 'Lab', dea_number: 'X', business_activity: 'smuggler' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid business_activity/);
  });
  it('log_cs_transaction validates type + quantity', async () => {
    const out = JSON.parse(await getToolHandler('log_cs_transaction')!({ substance_id: 1, transaction_type: 'teleport', quantity: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid transaction_type/);
  });
  it('review_cs_balance requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_cs_balance')!({}, { humanConfirmed: true } as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
