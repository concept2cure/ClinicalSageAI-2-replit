/**
 * RIM-lite AnA tools (C2C-12) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_rim_product', 'set_registration_status', 'review_label_currency'];

describe('RIM-lite AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('RIM-lite AnA tools — context + input guards', () => {
  it('create_rim_product refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_rim_product')!({ product_name: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('set_registration_status validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('set_registration_status')!({ product_id: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/country are required/);
  });
  it('set_registration_status rejects an invalid market_status', async () => {
    const out = JSON.parse(await getToolHandler('set_registration_status')!({ product_id: 1, country: 'US', market_status: 'bogus' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid status/);
  });
  it('review_label_currency requires a product_id', async () => {
    const out = JSON.parse(await getToolHandler('review_label_currency')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/product_id is required/);
  });
});
