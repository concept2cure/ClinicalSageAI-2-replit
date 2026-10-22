/**
 * A stated non-U.S. region is not resolved under U.S. rules.
 *
 * What the engine used to do (until 2026-10-15): no rule read `region`, so an
 * EU human-subjects study was told it REQUIRED IRB review under 45 CFR 46 and
 * 21 CFR 56, NIH training and PHS FCOI disclosure — U.S. federal requirements
 * presented as that study's obligations — and `determined` read true. This rule
 * version holds U.S. rules only; what an EU or other-region activity requires is
 * not determined, and the training gate does not clear against it.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateTrainingGate,
  resolveComplianceChecklist,
  type ActivityProfile,
} from '../compliance-checklist';

const EU_HUMAN: ActivityProfile = {
  involvesHumanSubjects: true, involvesAnimals: false, involvesRecombinantDNA: false,
  involvesHumanGeneTransfer: false, fundingSource: 'industry', region: 'eu',
};

describe('resolveComplianceChecklist — a stated non-U.S. region', () => {
  it.each(['eu', 'other'] as const)('region %s: nothing is required under U.S. rules; it is not determined', (region) => {
    const c = resolveComplianceChecklist({ ...EU_HUMAN, region });
    expect(c.requiredApprovals).toEqual([]);
    expect(c.requiredTraining).toEqual([]);
    expect(c.determined).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/45 CFR 46|21 CFR 56/);
    expect(c.undeterminedApprovals.map((a) => a.committee)).toEqual(['IRB']);
    for (const u of [...c.undeterminedApprovals, ...c.undeterminedTraining]) {
      expect(u.dependsOn).toEqual(['region']);
      expect(u.reason).toMatch(/not determined \(U\.S\. rules only\)/i);
    }
    expect(c.steps[0].step).toMatch(/U\.S\. rules only/);
  });

  it('the training gate does not clear for it', () => {
    const c = resolveComplianceChecklist(EU_HUMAN);
    const gate = evaluateTrainingGate([{ id: 1, name: 'A', role: 'principal_investigator' }], c.requiredTraining, [], '2026-10-15', c.undeterminedTraining);
    expect(gate.cleared).toBeNull();
  });

  it('a U.S. activity is unchanged', () => {
    const c = resolveComplianceChecklist({ ...EU_HUMAN, region: 'us' });
    expect(c.requiredApprovals.map((a) => a.committee)).toEqual(['IRB']);
    expect(c.determined).toBe(true);
  });
});
