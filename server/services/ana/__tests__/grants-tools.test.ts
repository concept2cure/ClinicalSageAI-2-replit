/**
 * eGrants AnA tools (C2C-14) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = [
  'create_grant_proposal', 'record_grant_award', 'review_grant_reporting',
  'set_grant_milestone_status', 'open_grant_closeout', 'update_grant_closeout', 'finalize_grant_closeout',
];

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
  it('set_grant_milestone_status rejects an invalid status', async () => {
    const out = JSON.parse(await getToolHandler('set_grant_milestone_status')!({ milestone_id: 1, status: 'teleported' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid status/);
  });
  it('open_grant_closeout requires tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('open_grant_closeout')!({ award_id: 1 }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('finalize_grant_closeout requires an award_id', async () => {
    const out = JSON.parse(await getToolHandler('finalize_grant_closeout')!({}, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/award_id is required/);
  });
});
