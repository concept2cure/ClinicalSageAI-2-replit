/**
 * IACUC AnA tools (C2C-05) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const IACUC_TOOLS = ['create_iacuc_protocol', 'register_animal_cohort', 'review_iacuc_protocol'];

describe('IACUC AnA tools — registration', () => {
  it.each(IACUC_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('IACUC AnA tools — context + input guards', () => {
  it('create_iacuc_protocol refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_iacuc_protocol')!({ protocol_number: 'A1', title: 'X', pain_category: 'C' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_iacuc_protocol rejects an invalid pain_category', async () => {
    const out = JSON.parse(await getToolHandler('create_iacuc_protocol')!({ protocol_number: 'A1', title: 'X', pain_category: 'Z' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid pain_category/);
  });
  it('register_animal_cohort validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('register_animal_cohort')!({ protocol_id: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/required/);
  });
  it('review_iacuc_protocol requires a protocol_id', async () => {
    const out = JSON.parse(await getToolHandler('review_iacuc_protocol')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/protocol_id is required/);
  });
});
