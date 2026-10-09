/**
 * Research-compliance AnA tools (foundation) — registration + input guards.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
// 2026-09-28: a confirm-class call now also needs an editor role, read from
// organization_users (AnaToolExecutor writeRoleRefusal). The database is mocked
// here, so the confirming person is modelled as a 'member'. The role gate itself
// is tested in confirmed-write-role-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));
beforeEach(() => resolveSignerOrgRole.mockClear());

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
    const out = JSON.parse(await getToolHandler('add_personnel_training')!({ personnel_id: 1, training_type: 'biosafety' }, { humanConfirmed: true } as any));
    // 2026-09-28: the registry now refuses a confirm-class call with no identified
    // member before the handler (and its own tenant + user guard) runs.
    expect(out.error).toMatch(/needs an identified member of the organization/);
    expect(out.error).toMatch(/Nothing was changed/);
    expect(resolveSignerOrgRole).not.toHaveBeenCalled();
  });
  it('add_personnel_training rejects an invalid training_type', async () => {
    const out = JSON.parse(await getToolHandler('add_personnel_training')!({ personnel_id: 1, training_type: 'jedi' }, { organizationId: 1, userId: 1, humanConfirmed: true } as any));
    expect(out.error).toMatch(/valid training_type/);
  });
  it('review_training_gate requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('review_training_gate')!({ personnel_ids: [1] }, { humanConfirmed: true } as any));
    expect(out.error).toMatch(/tenant context/);
  });
  it('assess_study_onboarding requires tenant context', async () => {
    const out = JSON.parse(await getToolHandler('assess_study_onboarding')!({ involves_human_subjects: true }, { humanConfirmed: true } as any));
    expect(out.error).toMatch(/tenant context/);
  });
});
