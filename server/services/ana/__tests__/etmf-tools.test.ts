/**
 * eTMF AnA tools (C2C-08) — registration + input guards.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
// 2026-09-28: a confirm-class call now also needs an editor role, read from
// organization_users (AnaToolExecutor writeRoleRefusal). The database is mocked
// here, so the confirming person is modelled as a 'member'. The role gate itself
// is tested in confirmed-write-role-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
beforeEach(() => resolveSignerOrgRole.mockClear());

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_tmf', 'classify_tmf_artifact', 'review_tmf_completeness'];

describe('eTMF AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('eTMF AnA tools — context + input guards', () => {
  it('create_tmf refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_tmf')!({ title: 'X' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry now refuses a confirm-class call with no identified
    // member before the handler (and its own tenant + user guard) runs.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('classify_tmf_artifact validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('classify_tmf_artifact')!({ tmf_file_id: 1 }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/artifact_name are required/);
  });
  it('review_tmf_completeness requires a tmf_file_id', async () => {
    const out = JSON.parse(await getToolHandler('review_tmf_completeness')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/tmf_file_id is required/);
  });
});
