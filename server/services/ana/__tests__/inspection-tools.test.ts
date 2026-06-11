/**
 * Inspection Readiness AnA tools (C2C-13) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_inspection', 'log_inspection_finding', 'review_inspection_readiness'];

describe('Inspection AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Inspection AnA tools — context + input guards', () => {
  it('create_inspection refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_inspection')!({ inspection_type: 'bimo', agency: 'fda', site_name: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_inspection rejects an invalid type', async () => {
    const out = JSON.parse(await getToolHandler('create_inspection')!({ inspection_type: 'raid', agency: 'fda', site_name: 'X' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/must be valid/);
  });
  it('log_inspection_finding validates a classification', async () => {
    const out = JSON.parse(await getToolHandler('log_inspection_finding')!({ inspection_id: 1, observation_number: 1, description: 'x', classification: 'fatal' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid classification/);
  });
  it('review_inspection_readiness requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_inspection_readiness')!({}, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
