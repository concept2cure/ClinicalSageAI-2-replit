/**
 * eGrants AnA tools (C2C-14) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = [
  'create_grant_proposal', 'record_grant_award', 'review_grant_reporting',
  'set_grant_milestone_status', 'open_grant_closeout', 'update_grant_closeout', 'finalize_grant_closeout',
  'record_subaward', 'screen_subaward', 'execute_subaward',
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
  it('record_subaward requires award_id and subrecipient_name', async () => {
    const out = JSON.parse(await getToolHandler('record_subaward')!({ award_id: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/subrecipient_name are required/);
  });
  it('screen_subaward rejects an invalid screen_status', async () => {
    const out = JSON.parse(await getToolHandler('screen_subaward')!({ subaward_id: 1, screen_status: 'maybe' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/screen_status \(cleared\|excluded\)/);
  });
  it('execute_subaward requires a subaward_id', async () => {
    const out = JSON.parse(await getToolHandler('execute_subaward')!({}, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/subaward_id is required/);
  });
});
