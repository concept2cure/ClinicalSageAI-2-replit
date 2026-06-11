/**
 * IBC AnA tools (C2C-07) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const IBC_TOOLS = ['create_ibc_registration', 'add_biological_agent', 'review_ibc_registration'];

describe('IBC AnA tools — registration', () => {
  it.each(IBC_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('IBC AnA tools — context + input guards', () => {
  it('create_ibc_registration refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_ibc_registration')!({ registration_number: 'R1', title: 'X', biosafety_level: 'BSL-2' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_ibc_registration rejects an invalid biosafety_level', async () => {
    const out = JSON.parse(await getToolHandler('create_ibc_registration')!({ registration_number: 'R1', title: 'X', biosafety_level: 'BSL-9' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid biosafety_level/);
  });
  it('add_biological_agent rejects an invalid risk_group', async () => {
    const out = JSON.parse(await getToolHandler('add_biological_agent')!({ registration_id: 1, agent_name: 'X', agent_type: 'virus', risk_group: 'RG9' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid risk_group/);
  });
  it('review_ibc_registration requires a registration_id', async () => {
    const out = JSON.parse(await getToolHandler('review_ibc_registration')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/registration_id is required/);
  });
});
