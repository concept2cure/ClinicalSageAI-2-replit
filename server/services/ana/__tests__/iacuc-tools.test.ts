/**
 * IACUC AnA tools (C2C-05) — registration + input guards.
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

const IACUC_TOOLS = ['create_iacuc_protocol', 'register_animal_cohort', 'review_iacuc_protocol'];

describe('IACUC AnA tools — registration', () => {
  it.each(IACUC_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('IACUC AnA tools — context + input guards', () => {
  it('create_iacuc_protocol refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('create_iacuc_protocol')!({ protocol_number: 'A1', title: 'X', pain_category: 'C' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('create_iacuc_protocol rejects an invalid pain_category', async () => {
    const out = JSON.parse(await getToolHandler('create_iacuc_protocol')!({ protocol_number: 'A1', title: 'X', pain_category: 'Z' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid pain_category/);
  });
  it('register_animal_cohort validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('register_animal_cohort')!({ protocol_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/required/);
  });
  it('review_iacuc_protocol requires a protocol_id', async () => {
    const out = JSON.parse(await getToolHandler('review_iacuc_protocol')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/protocol_id is required/);
  });
});
