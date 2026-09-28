/**
 * HA Interaction & Commitment AnA tools (C2C-03) — registration + input guards.
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

const HA_TOOLS = ['create_ha_interaction', 'create_regulatory_commitment', 'review_commitment_portfolio'];

describe('HA AnA tools — registration', () => {
  it.each(HA_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('HA AnA tools — context + input guards', () => {
  it('create_ha_interaction refuses without tenant/user context', async () => {
    resolveSignerOrgRole.mockClear();
    const out = JSON.parse(await getToolHandler('create_ha_interaction')!({ interaction_type: 'pre_ind', agency: 'fda', title: 'X' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry's write-role gate refuses a confirmed write with no
    // identified member before the handler's own tenant/user guard is reached.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });

  it('create_ha_interaction rejects an invalid agency', async () => {
    const out = JSON.parse(await getToolHandler('create_ha_interaction')!(
      { interaction_type: 'pre_ind', agency: 'martian_authority', title: 'X' },
      { organizationId: 1, userId: 1, humanConfirmed: true } as any,
    ));
    expect(out.error).toMatch(/must be valid/);
  });

  it('create_regulatory_commitment validates type + description', async () => {
    const out = JSON.parse(await getToolHandler('create_regulatory_commitment')!({ commitment_type: 'bogus' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/must be valid/);
  });

  it('review_commitment_portfolio requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_commitment_portfolio')!({}, { humanConfirmed: true } as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
