/**
 * Add-on AnA tools (effort certification, research-security COI, sponsored-
 * programs connectors) — registration + input-guard coverage. The guards under
 * test short-circuit before any DB/connector call, so no mocking is required.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = [
  'create_effort_certification', 'add_effort_line', 'create_coi_disclosure',
  'search_grants_gov', 'screen_restricted_party',
  'research_compliance_briefing', 'fulfill_regulatory_commitment', 'review_ha_interaction', 'register_controlled_substance',
  'prepare_meeting_package',
];

describe('Add-on AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Effort + COI tools — context + validation guards', () => {
  it('create_effort_certification refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_effort_certification')!({ personnel_id: 1, period_start: '2026-01-01', period_end: '2026-06-30' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('create_effort_certification requires period fields', async () => {
    const out = JSON.parse(await getToolHandler('create_effort_certification')!({ personnel_id: 1 }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/period_start.*period_end|required/);
  });
  it('add_effort_line requires the numeric percentages', async () => {
    const out = JSON.parse(await getToolHandler('add_effort_line')!({ certification_id: 1, activity_label: 'R01' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/committed_pct.*actual_pct|required/);
  });
  it('create_coi_disclosure rejects an invalid disclosure_type', async () => {
    const out = JSON.parse(await getToolHandler('create_coi_disclosure')!({ personnel_id: 1, disclosure_type: 'bribe', entity_name: 'X' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid disclosure_type/);
  });
});

describe('Sponsored-programs connector tools — context + input guards', () => {
  it('search_grants_gov requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('search_grants_gov')!({ query: 'cancer' }, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
  it('search_grants_gov requires a non-empty query', async () => {
    const out = JSON.parse(await getToolHandler('search_grants_gov')!({ query: '  ' }, { organizationId: 1 } as any));
    expect(out.error).toMatch(/query is required/);
  });
  it('screen_restricted_party requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('screen_restricted_party')!({ party_name: 'Acme' }, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
  it('screen_restricted_party requires a party_name', async () => {
    const out = JSON.parse(await getToolHandler('screen_restricted_party')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/party_name is required/);
  });
});

describe('Briefing + coverage-gap tools — context + input guards', () => {
  it('research_compliance_briefing requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('research_compliance_briefing')!({}, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
  it('triage_compliance_attention requires tenant + user context', async () => {
    const out = JSON.parse(await getToolHandler('triage_compliance_attention')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('fulfill_regulatory_commitment requires a commitment_id', async () => {
    const out = JSON.parse(await getToolHandler('fulfill_regulatory_commitment')!({}, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/commitment_id is required/);
  });
  it('review_ha_interaction requires an interaction_id', async () => {
    const out = JSON.parse(await getToolHandler('review_ha_interaction')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/interaction_id is required/);
  });
  it('register_controlled_substance rejects an invalid schedule', async () => {
    const out = JSON.parse(await getToolHandler('register_controlled_substance')!({ substance_name: 'X', dea_schedule: 'VII' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid dea_schedule/);
  });
  it('prepare_meeting_package requires an interaction_id', async () => {
    const out = JSON.parse(await getToolHandler('prepare_meeting_package')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/interaction_id is required/);
  });
});
