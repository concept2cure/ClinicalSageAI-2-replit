/**
 * Compliance-checklist engine + training gate (shared foundation) — pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveComplianceChecklist,
  evaluateTrainingGate,
  trainingStatus,
  RULE_VERSION,
  type ActivityProfile,
  type TrainingRecord,
} from '../compliance-checklist';

const TODAY = '2026-06-10';

const human: ActivityProfile = { involvesHumanSubjects: true, involvesAnimals: false, involvesRecombinantDNA: false, involvesHumanGeneTransfer: false, fundingSource: 'nih', region: 'us' };

describe('resolveComplianceChecklist', () => {
  it('requires IRB + human-subjects training for NIH human research', () => {
    const c = resolveComplianceChecklist(human);
    expect(c.ruleVersion).toBe(RULE_VERSION);
    expect(c.requiredApprovals.some((a) => a.committee === 'IRB')).toBe(true);
    expect(c.requiredTraining.some((t) => t.trainingType === 'citi_human_subjects')).toBe(true);
    expect(c.requiredTraining.some((t) => t.trainingType === 'fcoi_disclosure')).toBe(true); // NIH funding
  });
  it('requires IACUC + animal training for animal work', () => {
    const c = resolveComplianceChecklist({ ...human, involvesHumanSubjects: false, involvesAnimals: true });
    expect(c.requiredApprovals.some((a) => a.committee === 'IACUC')).toBe(true);
    expect(c.requiredTraining.some((t) => t.trainingType === 'citi_animal')).toBe(true);
  });
  it('requires IBC + biosafety for recombinant DNA', () => {
    const c = resolveComplianceChecklist({ ...human, involvesHumanSubjects: false, involvesRecombinantDNA: true });
    expect(c.requiredApprovals.some((a) => a.committee === 'IBC')).toBe(true);
    expect(c.requiredTraining.some((t) => t.trainingType === 'biosafety')).toBe(true);
  });
  it('requires IRB + IBC for human gene transfer (CGT)', () => {
    const c = resolveComplianceChecklist({ ...human, involvesHumanGeneTransfer: true, involvesRecombinantDNA: true });
    const committees = c.requiredApprovals.map((a) => a.committee);
    expect(committees).toContain('IRB');
    expect(committees).toContain('IBC');
  });
  it('cites every approval and training requirement', () => {
    const c = resolveComplianceChecklist({ ...human, involvesAnimals: true, involvesRecombinantDNA: true });
    for (const a of c.requiredApprovals) expect(a.citation.length).toBeGreaterThan(0);
    for (const t of c.requiredTraining) expect(t.citation.length).toBeGreaterThan(0);
  });
  it('drops FCOI/RCR for internal funding', () => {
    const c = resolveComplianceChecklist({ ...human, fundingSource: 'internal' });
    expect(c.requiredTraining.some((t) => t.trainingType === 'fcoi_disclosure')).toBe(false);
  });
});

describe('trainingStatus', () => {
  it('classifies missing / current / expiring / expired', () => {
    expect(trainingStatus({ completedDate: null }, TODAY)).toBe('missing');
    expect(trainingStatus({ completedDate: '2025-01-01', expiresDate: '2027-01-01' }, TODAY)).toBe('current');
    expect(trainingStatus({ completedDate: '2024-01-01', expiresDate: '2026-06-20' }, TODAY)).toBe('expiring');
    expect(trainingStatus({ completedDate: '2024-01-01', expiresDate: '2026-01-01' }, TODAY)).toBe('expired');
  });
});

describe('evaluateTrainingGate ("no index until trained")', () => {
  const personnel = [
    { id: 1, name: 'PI', role: 'principal_investigator' },
    { id: 2, name: 'Coord', role: 'coordinator' },
  ];
  const required = resolveComplianceChecklist(human).requiredTraining;

  it('blocks when required training is missing', () => {
    const r = evaluateTrainingGate(personnel, required, [], TODAY);
    expect(r.cleared).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });
  it('clears when everyone has current required training', () => {
    const records: TrainingRecord[] = [];
    for (const p of personnel) {
      records.push({ personnelId: p.id, personnelName: p.name, trainingType: 'citi_human_subjects', completedDate: '2025-01-01', expiresDate: '2027-01-01' });
      records.push({ personnelId: p.id, personnelName: p.name, trainingType: 'citi_rcr', completedDate: '2025-01-01', expiresDate: '2027-01-01' });
    }
    // investigator-only training (GCP, FCOI) only required of the PI
    records.push({ personnelId: 1, personnelName: 'PI', trainingType: 'citi_gcp', completedDate: '2025-01-01', expiresDate: '2027-01-01' });
    records.push({ personnelId: 1, personnelName: 'PI', trainingType: 'fcoi_disclosure', completedDate: '2025-01-01', expiresDate: '2027-01-01' });
    const r = evaluateTrainingGate(personnel, required, records, TODAY);
    expect(r.cleared).toBe(true);
    expect(r.missing).toHaveLength(0);
  });
  it('does not require investigator-only training of a coordinator', () => {
    // Coordinator (id 2) lacks GCP/FCOI but those are investigator-only → should not block on the coordinator.
    const records: TrainingRecord[] = [
      { personnelId: 1, personnelName: 'PI', trainingType: 'citi_human_subjects', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 2, personnelName: 'Coord', trainingType: 'citi_human_subjects', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 1, personnelName: 'PI', trainingType: 'citi_rcr', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 2, personnelName: 'Coord', trainingType: 'citi_rcr', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 1, personnelName: 'PI', trainingType: 'citi_gcp', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
      { personnelId: 1, personnelName: 'PI', trainingType: 'fcoi_disclosure', completedDate: '2025-01-01', expiresDate: '2027-01-01' },
    ];
    const r = evaluateTrainingGate(personnel, required, records, TODAY);
    expect(r.missing.some((m) => m.personnelId === 2 && (m.trainingType === 'citi_gcp' || m.trainingType === 'fcoi_disclosure'))).toBe(false);
    expect(r.cleared).toBe(true);
  });
});
