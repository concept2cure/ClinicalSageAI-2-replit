/**
 * Nonclinical + SEND AnA tools (C2C-04) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_nonclinical_study', 'review_send_readiness'];

describe('Nonclinical AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Nonclinical AnA tools — context + input guards', () => {
  it('create_nonclinical_study refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_nonclinical_study')!({ study_number: 'S1', title: 'X', study_type: 'repeat_dose_tox' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_nonclinical_study rejects an invalid study_type', async () => {
    const out = JSON.parse(await getToolHandler('create_nonclinical_study')!({ study_number: 'S1', title: 'X', study_type: 'mystery' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid study_type/);
  });
  it('review_send_readiness requires a study_id', async () => {
    const out = JSON.parse(await getToolHandler('review_send_readiness')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/study_id is required/);
  });
});
