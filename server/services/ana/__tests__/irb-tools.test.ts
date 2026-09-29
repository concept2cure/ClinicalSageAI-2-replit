/**
 * IRB AnA tools (C2C-06) — registration + input guards.
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

const IRB_TOOLS = ['create_irb_submission', 'add_irb_site', 'review_irb_submission'];

describe('IRB AnA tools — registration', () => {
  it.each(IRB_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('IRB AnA tools — context + input guards', () => {
  it('create_irb_submission refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('create_irb_submission')!({ protocol_number: 'P1', title: 'X', risk_level: 'minimal' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('create_irb_submission rejects an invalid risk_level', async () => {
    const out = JSON.parse(await getToolHandler('create_irb_submission')!({ protocol_number: 'P1', title: 'X', risk_level: 'extreme' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid risk_level/);
  });
  it('add_irb_site validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('add_irb_site')!({ irb_submission_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/required/);
  });
  it('review_irb_submission requires an irb_submission_id', async () => {
    const out = JSON.parse(await getToolHandler('review_irb_submission')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/irb_submission_id is required/);
  });
});
