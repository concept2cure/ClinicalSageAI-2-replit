/**
 * HA Interaction & Commitment AnA tools (C2C-03) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const HA_TOOLS = ['create_ha_interaction', 'create_regulatory_commitment', 'review_commitment_portfolio'];

describe('HA AnA tools — registration', () => {
  it.each(HA_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('HA AnA tools — context + input guards', () => {
  it('create_ha_interaction refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_ha_interaction')!({ interaction_type: 'pre_ind', agency: 'fda', title: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });

  it('create_ha_interaction rejects an invalid agency', async () => {
    const out = JSON.parse(await getToolHandler('create_ha_interaction')!(
      { interaction_type: 'pre_ind', agency: 'martian_authority', title: 'X' },
      { organizationId: 1, userId: 1 } as any,
    ));
    expect(out.error).toMatch(/must be valid/);
  });

  it('create_regulatory_commitment validates type + description', async () => {
    const out = JSON.parse(await getToolHandler('create_regulatory_commitment')!({ commitment_type: 'bogus' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/must be valid/);
  });

  it('review_commitment_portfolio requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_commitment_portfolio')!({}, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
