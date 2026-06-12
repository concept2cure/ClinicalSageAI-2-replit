/**
 * Study-onboarding orchestration (assessStudyOnboarding) — pure, no DB/LLM.
 * The value over checklist + gate run separately is the CROSS-REFERENCE: each
 * training gap is attributed to the specific committee approval it blocks.
 */

import { describe, it, expect } from 'vitest';
import { assessStudyOnboarding, type ActivityProfile } from '../compliance-checklist';

const today = '2026-06-10';
const animalAndHuman: ActivityProfile = {
  involvesHumanSubjects: true, involvesAnimals: true, involvesRecombinantDNA: false,
  involvesHumanGeneTransfer: false, fundingSource: 'nih', region: 'us',
};
const pi = { id: 1, name: 'Dr PI', role: 'principal_investigator' };

describe('assessStudyOnboarding', () => {
  it('requires IRB + IACUC and is not ready when the PI has no training', () => {
    const a = assessStudyOnboarding(animalAndHuman, [pi], [], today);
    expect(a.requiredApprovals.map((x) => x.committee).sort()).toEqual(['IACUC', 'IRB']);
    expect(a.readyToSubmit).toBe(false);
    expect(a.blockers.length).toBeGreaterThan(0);
  });

  it('attributes a human-subjects training gap to the IRB approval, not the IACUC one', () => {
    // PI has animal + RCR + FCOI training but is MISSING human-subjects/GCP.
    const records = [
      { personnelId: 1, personnelName: 'Dr PI', trainingType: 'citi_animal', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 1, personnelName: 'Dr PI', trainingType: 'citi_rcr', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 1, personnelName: 'Dr PI', trainingType: 'fcoi_disclosure', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
    ];
    const a = assessStudyOnboarding(animalAndHuman, [pi], records, today);
    const irb = a.approvals.find((x) => x.committee === 'IRB')!;
    const iacuc = a.approvals.find((x) => x.committee === 'IACUC')!;
    expect(iacuc.ready).toBe(true); // animal training present → IACUC clear
    expect(irb.ready).toBe(false); // human-subjects/GCP missing → IRB blocked
    expect(irb.blockingGaps.some((g) => g.trainingType === 'citi_human_subjects')).toBe(true);
    expect(irb.blockingGaps.some((g) => g.trainingType === 'citi_animal')).toBe(false);
  });

  it('is ready to submit once every required training is current', () => {
    const all = ['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'fcoi_disclosure'].map((t) => ({
      personnelId: 1, personnelName: 'Dr PI', trainingType: t, completedDate: '2025-01-01', expiresDate: '2027-01-01',
    }));
    const a = assessStudyOnboarding(animalAndHuman, [pi], all, today);
    expect(a.readyToSubmit).toBe(true);
    expect(a.approvals.every((x) => x.ready)).toBe(true);
    expect(a.blockers).toEqual([]);
  });
});
