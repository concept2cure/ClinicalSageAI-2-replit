/**
 * FCOI AnA tools (C2C-01) — registration + input-guard tests. The conversational
 * build tools are registered, defined, and refuse without tenant/user context or
 * required inputs. (DB-backed mutation paths are verified in a DB-enabled env.)
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const FCOI_TOOLS = [
  'create_clinical_investigator',
  'create_financial_disclosure',
  'add_disclosure_interest',
  'review_financial_disclosure',
];

describe('FCOI AnA tools — registration', () => {
  it.each(FCOI_TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('FCOI AnA tools — context + input guards', () => {
  it('create_clinical_investigator refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('create_clinical_investigator')!({ full_name: 'Dr X', role: 'principal_investigator' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });

  it('create_financial_disclosure validates required inputs', async () => {
    const out = JSON.parse(await getToolHandler('create_financial_disclosure')!({}, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/investigator_id and has_disclosable_interests/);
  });

  it('add_disclosure_interest rejects an invalid interest_type', async () => {
    const out = JSON.parse(await getToolHandler('add_disclosure_interest')!(
      { disclosure_id: 1, interest_type: 'BRIBE', description: 'x' },
      { organizationId: 1, userId: 1 } as any,
    ));
    expect(out.error).toMatch(/valid interest_type/);
  });

  it('review_financial_disclosure requires a disclosure_id', async () => {
    const out = JSON.parse(await getToolHandler('review_financial_disclosure')!({}, { organizationId: 1 } as any));
    expect(out.error).toMatch(/disclosure_id is required/);
  });
});
