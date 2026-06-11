/**
 * Lifecycle Obligation AnA tools (C2C-11) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_lifecycle_obligation', 'review_lifecycle_calendar'];

describe('Lifecycle AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Lifecycle AnA tools — context + input guards', () => {
  it('create_lifecycle_obligation refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_lifecycle_obligation')!({ obligation_type: 'variation', region: 'eu', title: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_lifecycle_obligation rejects an invalid type', async () => {
    const out = JSON.parse(await getToolHandler('create_lifecycle_obligation')!({ obligation_type: 'teleport', region: 'eu', title: 'X' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/must be valid/);
  });
  it('review_lifecycle_calendar requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_lifecycle_calendar')!({}, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
