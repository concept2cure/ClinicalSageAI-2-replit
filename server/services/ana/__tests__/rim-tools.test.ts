/**
 * RIM-lite AnA tools (C2C-12) — registration + input guards.
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

const TOOLS = ['create_rim_product', 'set_registration_status', 'review_label_currency'];

describe('RIM-lite AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('RIM-lite AnA tools — context + input guards', () => {
  it('create_rim_product refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('create_rim_product')!({ product_name: 'X' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('set_registration_status validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('set_registration_status')!({ product_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/country are required/);
  });
  it('set_registration_status rejects an invalid market_status', async () => {
    const out = JSON.parse(await getToolHandler('set_registration_status')!({ product_id: 1, country: 'US', market_status: 'bogus' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid status/);
  });
  it('review_label_currency requires a product_id', async () => {
    const out = JSON.parse(await getToolHandler('review_label_currency')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/product_id is required/);
  });
});
