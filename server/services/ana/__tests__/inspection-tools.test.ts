/**
 * Inspection Readiness AnA tools (C2C-13) — registration + input guards.
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

const TOOLS = ['create_inspection', 'log_inspection_finding', 'review_inspection_readiness'];

describe('Inspection AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Inspection AnA tools — context + input guards', () => {
  it('create_inspection refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('create_inspection')!({ inspection_type: 'bimo', agency: 'fda', site_name: 'X' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('create_inspection rejects an invalid type', async () => {
    const out = JSON.parse(await getToolHandler('create_inspection')!({ inspection_type: 'raid', agency: 'fda', site_name: 'X' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/must be valid/);
  });
  it('log_inspection_finding validates a classification', async () => {
    const out = JSON.parse(await getToolHandler('log_inspection_finding')!({ inspection_id: 1, observation_number: 1, description: 'x', classification: 'fatal' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid classification/);
  });
  it('review_inspection_readiness requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_inspection_readiness')!({}, { humanConfirmed: true } as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
