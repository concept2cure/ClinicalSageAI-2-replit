/**
 * AnA's research-compliance tools do not answer questions nobody asked.
 *
 * What the code used to do: rcProfile built the activity profile with
 * `involves_* === true` (so an omitted fact became false), funding_source
 * defaulting to 'other' and region to 'us', and accepted any string as a
 * funding source. run_compliance_checklist({}) therefore answered "Required
 * committee approvals: none; 0 training requirement(s)", review_training_gate
 * answered "Training gate cleared", and assess_study_onboarding answered
 * "ready to submit" for a study nobody had described. A team nobody named was
 * likewise "ready to submit".
 *
 * Now: an omitted fact is not stated; what it could trigger comes back as not
 * determined with the input that would settle it; the gate and the onboarding
 * verdict are null (not determined), never cleared; and a value outside the
 * schema is refused by name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadRosterForGate } = vi.hoisted(() => ({ loadRosterForGate: vi.fn() }));
vi.mock('../../research-compliance/roster-service', () => ({ loadRosterForGate }));
vi.mock('../../research-compliance/roster-service.js', () => ({ loadRosterForGate }));

import { getToolHandler } from '../AnaToolExecutor';

const ctx = { organizationId: 1 } as never;
const run = async (tool: string, input: Record<string, unknown>) => JSON.parse(await getToolHandler(tool)!(input, ctx));
const ALL_STATED_NONE = {
  involves_human_subjects: false, involves_animals: false, involves_recombinant_dna: false,
  involves_human_gene_transfer: false, funding_source: 'internal', region: 'us',
};

beforeEach(() => {
  loadRosterForGate.mockReset();
  loadRosterForGate.mockResolvedValue({ personnel: [{ id: 1, name: 'Dr PI', role: 'principal_investigator' }], records: [] });
});

describe('run_compliance_checklist', () => {
  it('does not report "none" for a study nobody described', async () => {
    const out = await run('run_compliance_checklist', {});
    expect(out.message).not.toMatch(/approvals: none/);
    expect(out.ok).toBe(true);
    expect(out.requiredApprovals).toEqual([]);
    expect(out.undeterminedApprovals.map((u: { committee: string }) => u.committee)).toEqual(['IRB', 'IACUC', 'IBC']);
    expect(out.undeterminedTraining).toHaveLength(6);
    expect(out.notStated).toEqual(['involves_human_subjects', 'involves_animals', 'involves_recombinant_dna', 'involves_human_gene_transfer', 'funding_source', 'region']);
    expect(out.message).toMatch(/not determined: IRB \(involves_human_subjects, involves_human_gene_transfer not stated\)/);
  });

  it('names what depends on an unstated funding source', async () => {
    const out = await run('run_compliance_checklist', { involves_human_subjects: true, involves_animals: false, involves_recombinant_dna: false, involves_human_gene_transfer: false });
    expect(out.message).toMatch(/^Required committee approvals: IRB; 1 training requirement\(s\); training not determined: /);
    expect(out.message).toMatch(/fcoi_disclosure \(funding_source not stated\)/);
    expect(out.message).toMatch(/citi_rcr \(funding_source not stated\)/);
  });

  it('says "none" when every fact was stated and none applies', async () => {
    const out = await run('run_compliance_checklist', ALL_STATED_NONE);
    expect(out.message).toBe('Required committee approvals: none; 0 training requirement(s).');
    expect(out.notStated).toEqual([]);
  });

  it('refuses a funding source outside the schema instead of treating it as "other"', async () => {
    const out = await run('run_compliance_checklist', { involves_human_subjects: true, funding_source: 'NIH' });
    expect(out.ok).toBeUndefined();
    expect(String(out.error)).toMatch(/funding_source must be one of nih, nsf, barda, dod, industry, internal, other/);
  });
});

describe('review_training_gate', () => {
  it('is not cleared when the training required is not determined', async () => {
    const out = await run('review_training_gate', { personnel_ids: [1] });
    expect(out.cleared, 'the gate cleared a study nobody described').toBeNull();
    expect(out.message).not.toMatch(/gate cleared/i);
    expect(out.message).toMatch(/^Training gate not determined/);
    expect(out.undeterminedTraining).toHaveLength(6);
  });

  it('is still BLOCKED when stated facts require training that is missing', async () => {
    const out = await run('review_training_gate', { personnel_ids: [1], involves_human_subjects: true });
    expect(out.cleared).toBe(false);
    expect(out.message).toMatch(/^Training gate BLOCKED — 1 missing\/expired requirement\(s\)\. Training not determined: /);
  });

  it('is not cleared over a team nobody named', async () => {
    loadRosterForGate.mockResolvedValue({ personnel: [], records: [] });
    const out = await run('review_training_gate', { personnel_ids: [], involves_human_subjects: true, involves_animals: false, involves_recombinant_dna: false, involves_human_gene_transfer: false, funding_source: 'nih' });
    expect(out.cleared).toBeNull();
    expect(out.message).toMatch(/no personnel were named/);
  });
});

describe('assess_study_onboarding', () => {
  it('does not call an undescribed study ready to submit', async () => {
    const out = await run('assess_study_onboarding', { personnel_ids: [1] });
    expect(out.readyToSubmit, 'an undescribed study was "ready to submit"').toBeNull();
    expect(out.message).not.toMatch(/ready to submit/);
    expect(out.message).toMatch(/Readiness not determined/);
    expect(out.undeterminedApprovals.map((u: { committee: string }) => u.committee)).toEqual(['IRB', 'IACUC', 'IBC']);
  });

  it('does not call a team nobody named ready to submit', async () => {
    loadRosterForGate.mockResolvedValue({ personnel: [], records: [] });
    const out = await run('assess_study_onboarding', { ...ALL_STATED_NONE, involves_human_subjects: true, funding_source: 'nih' });
    expect(out.readyToSubmit).toBeNull();
    expect(out.message).toMatch(/^Required approvals: IRB\. Readiness not determined — no personnel were named/);
  });

  it('still says ready to submit when every fact is stated and the team is trained', async () => {
    loadRosterForGate.mockResolvedValue({
      personnel: [{ id: 1, name: 'Dr PI', role: 'principal_investigator' }],
      records: ['citi_human_subjects', 'citi_gcp', 'citi_rcr', 'fcoi_disclosure'].map((trainingType) => ({
        personnelId: 1, personnelName: 'Dr PI', trainingType, completedDate: '2025-01-01', expiresDate: '2099-01-01',
      })),
    });
    const out = await run('assess_study_onboarding', { ...ALL_STATED_NONE, involves_human_subjects: true, funding_source: 'nih', personnel_ids: [1] });
    expect(out.readyToSubmit).toBe(true);
    expect(out.message).toBe('Required approvals: IRB. Team training is current — ready to submit.');
  });
});
