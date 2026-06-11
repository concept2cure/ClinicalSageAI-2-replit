/**
 * Controlled Substances AnA tools (C2C-15) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['register_dea', 'log_cs_transaction', 'review_cs_balance'];

describe('Controlled Substances AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Controlled Substances AnA tools — context + input guards', () => {
  it('register_dea refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('register_dea')!({ registrant_name: 'Lab', dea_number: 'X', business_activity: 'researcher' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('register_dea rejects an invalid business_activity', async () => {
    const out = JSON.parse(await getToolHandler('register_dea')!({ registrant_name: 'Lab', dea_number: 'X', business_activity: 'smuggler' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid business_activity/);
  });
  it('log_cs_transaction validates type + quantity', async () => {
    const out = JSON.parse(await getToolHandler('log_cs_transaction')!({ substance_id: 1, transaction_type: 'teleport', quantity: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid transaction_type/);
  });
  it('review_cs_balance requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_cs_balance')!({}, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
