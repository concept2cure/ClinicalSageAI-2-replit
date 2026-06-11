/**
 * eGrants AnA tools (C2C-14) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['create_grant_proposal', 'record_grant_award', 'review_grant_reporting'];

describe('eGrants AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('eGrants AnA tools — context + input guards', () => {
  it('create_grant_proposal refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_grant_proposal')!({ title: 'X' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('record_grant_award rejects an invalid funding_agency', async () => {
    const out = JSON.parse(await getToolHandler('record_grant_award')!({ award_number: 'A1', funding_agency: 'martian_grants' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid funding_agency/);
  });
  it('review_grant_reporting requires an award_id', async () => {
    const out = JSON.parse(await getToolHandler('review_grant_reporting')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/award_id is required/);
  });
});
