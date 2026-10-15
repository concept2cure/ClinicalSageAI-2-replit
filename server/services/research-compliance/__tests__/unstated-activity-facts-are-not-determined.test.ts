/**
 * An activity fact nobody stated is not determined. It is not "no".
 *
 * What the code used to do: resolveComplianceChecklist took every fact as a
 * plain boolean, and its callers (AnA's rcProfile, the REST profile schema) read
 * an unstated fact as false, an unstated funding source as 'other' and an
 * unstated region as 'us'. A study nobody described therefore resolved to no
 * committee approval and no training ("Required committee approvals: none"),
 * the training gate cleared against that empty list, and the onboarding
 * assessment called the team ready to submit.
 *
 * Now: unstated is null. Each committee and training an unstated fact could
 * trigger is listed as not determined, naming the fact that would settle it;
 * nothing is reported as not required on the strength of a missing answer; and
 * the gate and the onboarding verdict stay undetermined (null), never cleared.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveComplianceChecklist,
  evaluateTrainingGate,
  assessStudyOnboarding,
  readActivityProfile,
  type ActivityProfile,
} from '../compliance-checklist';

const TODAY = '2026-06-10';
const UNSTATED: ActivityProfile = {
  involvesHumanSubjects: null, involvesAnimals: null, involvesRecombinantDNA: null,
  involvesHumanGeneTransfer: null, fundingSource: null, region: null,
};
const pi = { id: 1, name: 'Dr PI', role: 'principal_investigator' };
const current = (trainingType: string) => ({ personnelId: 1, personnelName: 'Dr PI', trainingType, completedDate: '2025-01-01', expiresDate: '2027-01-01' });

describe('resolveComplianceChecklist: a fact not stated', () => {
  it('lists every committee an undescribed study could need as not determined, never as none', () => {
    const c = resolveComplianceChecklist(UNSTATED);
    expect(
      c.undeterminedApprovals,
      'unstated facts were read as "no" and the committees they could trigger were omitted',
    ).toEqual([
      expect.objectContaining({ committee: 'IRB', dependsOn: ['involvesHumanSubjects', 'involvesHumanGeneTransfer'] }),
      expect.objectContaining({ committee: 'IACUC', dependsOn: ['involvesAnimals'] }),
      expect.objectContaining({ committee: 'IBC', dependsOn: ['involvesRecombinantDNA', 'involvesHumanGeneTransfer'] }),
    ]);
    expect(c.requiredApprovals).toEqual([]);
    expect(c.determined).toBe(false);
    expect(c.unstatedFacts).toEqual(['involvesHumanSubjects', 'involvesAnimals', 'involvesRecombinantDNA', 'involvesHumanGeneTransfer', 'fundingSource', 'region']);
    for (const u of c.undeterminedApprovals) {
      expect(u.reason).toMatch(/^Not determined: .+ not stated\. Required if /);
      expect(u.citation.length).toBeGreaterThan(0);
    }
  });

  it('lists the training each unstated fact could require, with the fact that settles it', () => {
    const c = resolveComplianceChecklist(UNSTATED);
    expect(c.requiredTraining).toEqual([]);
    expect(c.undeterminedTraining.map((u) => [u.trainingType, u.dependsOn])).toEqual([
      ['citi_human_subjects', ['involvesHumanSubjects']],
      ['citi_gcp', ['involvesHumanSubjects', 'fundingSource']],
      ['citi_animal', ['involvesAnimals']],
      ['biosafety', ['involvesRecombinantDNA', 'involvesHumanGeneTransfer']],
      ['fcoi_disclosure', ['fundingSource']],
      ['citi_rcr', ['fundingSource']],
    ]);
  });

  it('does not assume a funding source: FCOI, RCR and GCP depend on it', () => {
    const c = resolveComplianceChecklist({ ...UNSTATED, involvesHumanSubjects: true });
    expect(c.requiredApprovals.map((a) => a.committee)).toEqual(['IRB']);
    expect(c.requiredTraining.map((t) => t.trainingType)).toEqual(['citi_human_subjects']);
    const byFunding = c.undeterminedTraining.filter((u) => u.dependsOn.includes('fundingSource')).map((u) => u.trainingType);
    expect(byFunding).toEqual(['citi_gcp', 'fcoi_disclosure', 'citi_rcr']);
    expect(c.undeterminedApprovals.map((u) => u.committee)).toEqual(['IACUC', 'IBC']);
  });

  it('a stated fact settles what it decides, whatever else is unstated', () => {
    // Human gene transfer stated true requires IRB and IBC even with human subjects unstated.
    const c = resolveComplianceChecklist({ ...UNSTATED, involvesHumanGeneTransfer: true });
    expect(c.requiredApprovals.map((a) => a.committee)).toEqual(['IBC', 'IRB']);
    expect(c.undeterminedApprovals.map((u) => u.committee)).toEqual(['IACUC']);
    // Internal funding settles GCP as not required even with human subjects unstated.
    const internal = resolveComplianceChecklist({ ...UNSTATED, fundingSource: 'internal' });
    expect(internal.undeterminedTraining.map((u) => u.trainingType)).not.toContain('citi_gcp');
    expect(internal.undeterminedTraining.map((u) => u.trainingType)).not.toContain('fcoi_disclosure');
  });

  it('says none only when every fact a rule reads was stated', () => {
    const c = resolveComplianceChecklist({
      involvesHumanSubjects: false, involvesAnimals: false, involvesRecombinantDNA: false,
      involvesHumanGeneTransfer: false, fundingSource: 'internal', region: 'us',
    });
    expect(c.determined).toBe(true);
    expect(c.requiredApprovals).toEqual([]);
    expect(c.undeterminedApprovals).toEqual([]);
    expect(c.undeterminedTraining).toEqual([]);
    expect(c.unstatedFacts).toEqual([]);
  });

  it('reports an unstated region without inventing uncertainty: no rule in this version reads it', () => {
    const c = resolveComplianceChecklist({
      involvesHumanSubjects: false, involvesAnimals: false, involvesRecombinantDNA: false,
      involvesHumanGeneTransfer: false, fundingSource: 'internal', region: null,
    });
    expect(c.unstatedFacts).toEqual(['region']);
    expect(c.determined).toBe(true);
  });

  it('puts "state the missing facts" first in the steps', () => {
    const c = resolveComplianceChecklist(UNSTATED);
    expect(c.steps[0].step).toMatch(/^State /);
    expect(c.steps[0].step).toMatch(/human-subjects involvement/);
  });
});

describe('evaluateTrainingGate: an undetermined requirement list never clears', () => {
  it('is not cleared when the training required is not determined', () => {
    const c = resolveComplianceChecklist(UNSTATED);
    const g = evaluateTrainingGate([pi], c.requiredTraining, [], TODAY, c.undeterminedTraining);
    expect(g.cleared, 'the gate cleared against a requirement list built from unanswered questions').toBeNull();
    expect(g.undeterminedTraining.length).toBe(6);
  });

  it('is still BLOCKED (false) when a determined requirement is missing', () => {
    const c = resolveComplianceChecklist({ ...UNSTATED, involvesHumanSubjects: true });
    const g = evaluateTrainingGate([pi], c.requiredTraining, [], TODAY, c.undeterminedTraining);
    expect(g.cleared).toBe(false);
    expect(g.missing.map((m) => m.trainingType)).toEqual(['citi_human_subjects']);
  });
});

describe('assessStudyOnboarding: not ready-to-submit on unanswered questions', () => {
  it('readyToSubmit is null, not true, for a study nobody described', () => {
    const a = assessStudyOnboarding(UNSTATED, [pi], [], TODAY);
    expect(a.readyToSubmit, 'an undescribed study was called ready to submit').toBeNull();
    expect(a.undeterminedApprovals.map((u) => u.committee)).toEqual(['IRB', 'IACUC', 'IBC']);
  });

  it('an approval whose training is not determined is not ready (null)', () => {
    // Human subjects stated; funding not stated → GCP (which gates IRB) is undetermined.
    const a = assessStudyOnboarding({ ...UNSTATED, involvesHumanSubjects: true }, [pi], [current('citi_human_subjects')], TODAY);
    expect(a.approvals.find((x) => x.committee === 'IRB')!.ready).toBeNull();
    expect(a.readyToSubmit).toBeNull();
  });

  it('an undetermined approval keeps the verdict undetermined even when all determined training is current', () => {
    const profile: ActivityProfile = {
      involvesHumanSubjects: false, involvesAnimals: false, involvesRecombinantDNA: true,
      involvesHumanGeneTransfer: null, fundingSource: 'internal', region: 'us',
    };
    const a = assessStudyOnboarding(profile, [pi], [current('biosafety')], TODAY);
    expect(a.gate.cleared).toBe(true);
    expect(a.undeterminedApprovals.map((u) => u.committee)).toEqual(['IRB']);
    expect(a.readyToSubmit, 'IRB may be required (gene transfer not stated) and was dropped').toBeNull();
  });
});

describe('readActivityProfile: absent is not false', () => {
  const KEYS = { involvesHumanSubjects: 'involves_human_subjects', involvesAnimals: 'involves_animals', fundingSource: 'funding_source' } as const;

  it('reads an absent or null fact as not stated (null)', () => {
    const r = readActivityProfile({}, KEYS);
    expect(r).toEqual({ ok: true, profile: UNSTATED });
    expect(readActivityProfile({ involves_animals: null }, KEYS)).toEqual({ ok: true, profile: UNSTATED });
  });

  it('keeps a stated false as false', () => {
    const r = readActivityProfile({ involves_human_subjects: false, funding_source: 'nih' }, KEYS);
    expect(r).toEqual({ ok: true, profile: { ...UNSTATED, involvesHumanSubjects: false, fundingSource: 'nih' } });
  });

  it('refuses a value it cannot read, naming the key, instead of guessing', () => {
    const bad = readActivityProfile({ funding_source: 'NIH', involves_animals: 'yes' }, KEYS);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toMatch(/involves_animals must be true or false/);
    expect(bad.error).toMatch(/funding_source must be one of nih, nsf/);
  });
});
