/**
 * Research-compliance AnA tools (foundation) — registration + input guards.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const TOOLS = ['run_compliance_checklist', 'add_personnel_training', 'review_training_gate', 'assess_study_onboarding'];

describe('Research-compliance AnA tools — registration', () => {
  it.each(TOOLS)('%s is registered and defined', (name) => {
    expect(typeof getToolHandler(name)).toBe('function');
    expect(ALL_ANA_TOOLS.some((t) => t.name === name)).toBe(true);
  });
});

describe('Research-compliance AnA tools — context + behavior', () => {
  it('run_compliance_checklist returns required approvals for a profile (read-only)', async () => {
    const out = JSON.parse(await getToolHandler('run_compliance_checklist')!(
      { involves_human_subjects: true, funding_source: 'nih' },
      { organizationId: 1 } as any,
    ));
    expect(out.ok).toBe(true);
    expect(out.requiredApprovals.some((a: any) => a.committee === 'IRB')).toBe(true);
  });
  it('add_personnel_training refuses without tenant/user context', async () => {
    const out = JSON.parse(await getToolHandler('add_personnel_training')!({ personnel_id: 1, training_type: 'biosafety' }, {} as any));
    expect(out.error).toMatch(/tenant \+ user context/);
  });
  it('add_personnel_training rejects an invalid training_type', async () => {
    const out = JSON.parse(await getToolHandler('add_personnel_training')!({ personnel_id: 1, training_type: 'jedi' }, { organizationId: 1, userId: 1 } as any));
    expect(out.error).toMatch(/valid training_type/);
  });
  it('review_training_gate requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_training_gate')!({ personnel_ids: [1] }, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
  it('assess_study_onboarding requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('assess_study_onboarding')!({ involves_human_subjects: true }, {} as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
