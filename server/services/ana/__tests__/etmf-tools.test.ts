/**
 * eTMF AnA tools (C2C-08) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
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
    const out = JSON.parse(await getToolHandler('create_tmf')!({ title: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('classify_tmf_artifact validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('classify_tmf_artifact')!({ tmf_file_id: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/artifact_name are required/);
  });
  it('review_tmf_completeness requires a tmf_file_id', async () => {
    const out = JSON.parse(await getToolHandler('review_tmf_completeness')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/tmf_file_id is required/);
  });
});
