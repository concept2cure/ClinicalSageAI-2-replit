/**
 * CITI training pure logic — status currency, required-by-activity mapping,
 * training matrix, and expiring-soon report. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  trainingStatus,
  REQUIRED_TRAINING_BY_ACTIVITY,
  buildTrainingMatrix,
  expiringSoon,
  EXPIRING_WINDOW_DAYS,
  type MatrixPersonnel,
  type MatrixRecord,
} from '../citi-logic';

const TODAY = '2026-06-10';

describe('trainingStatus', () => {
  it('is missing with no completion date', () => {
    expect(trainingStatus(null, null, TODAY)).toBe('missing');
  });
  it('is current when completed with no tracked expiry', () => {
    expect(trainingStatus('2024-01-01', null, TODAY)).toBe('current');
  });
  it('is expired past the expiry date', () => {
    expect(trainingStatus('2023-01-01', '2026-01-01', TODAY)).toBe('expired');
  });
  it('is expiring within the 60-day window', () => {
    expect(trainingStatus('2023-07-01', '2026-07-01', TODAY)).toBe('expiring'); // ~21 days out
  });
  it('is current well before expiry', () => {
    expect(trainingStatus('2025-01-01', '2028-01-01', TODAY)).toBe('current');
  });
  it('honors a custom window', () => {
    expect(trainingStatus('2023-01-01', '2026-12-01', TODAY, 365)).toBe('expiring');
  });
});

describe('REQUIRED_TRAINING_BY_ACTIVITY', () => {
  it('requires CITI human-subjects training for human-subjects research', () => {
    const req = REQUIRED_TRAINING_BY_ACTIVITY({ involvesHumanSubjects: true, involvesAnimals: false, involvesRecombinantDNA: false, fundingSource: 'nih' });
    expect(req).toContain('citi_human_subjects');
  });
  it('requires CITI animal training for animal research', () => {
    const req = REQUIRED_TRAINING_BY_ACTIVITY({ involvesHumanSubjects: false, involvesAnimals: true, involvesRecombinantDNA: false, fundingSource: 'internal' });
    expect(req).toContain('citi_animal');
  });
  it('de-duplicates training types', () => {
    const req = REQUIRED_TRAINING_BY_ACTIVITY({ involvesHumanSubjects: true, involvesAnimals: true, involvesRecombinantDNA: true, fundingSource: 'nih' });
    expect(new Set(req).size).toBe(req.length);
  });
});

describe('buildTrainingMatrix', () => {
  const personnel: MatrixPersonnel[] = [
    { id: 1, name: 'Dr. Vega', role: 'principal_investigator' },
    { id: 2, name: 'Coordinator Lee', role: 'coordinator' },
  ];
  const records: MatrixRecord[] = [
    { personnelId: 1, trainingType: 'citi_human_subjects', completedDate: '2025-01-01', expiresDate: '2028-01-01' }, // current
    { personnelId: 1, trainingType: 'citi_gcp', completedDate: '2023-01-01', expiresDate: '2026-01-01' }, // expired
  ];

  it('builds per-person cells and a status summary, surfacing required-but-missing types', () => {
    const m = buildTrainingMatrix(personnel, records, TODAY, ['citi_human_subjects']);
    expect(m.summary.personnel).toBe(2);
    expect(m.summary.current).toBe(1);
    expect(m.summary.expired).toBe(1);
    // Person 2 has no records but citi_human_subjects is required → one missing cell.
    const lee = m.rows.find((r) => r.personnelId === 2)!;
    expect(lee.trainings.some((c) => c.trainingType === 'citi_human_subjects' && c.status === 'missing')).toBe(true);
  });
});

describe('expiringSoon', () => {
  it('returns only records expiring within the window, soonest first; excludes expired and no-expiry', () => {
    const out = expiringSoon([
      { personnelId: 1, trainingType: 'citi_gcp', completedDate: '2023-01-01', expiresDate: '2026-01-01' }, // expired
      { personnelId: 1, trainingType: 'citi_human_subjects', completedDate: '2023-07-15', expiresDate: '2026-07-15' }, // ~35 days
      { personnelId: 2, trainingType: 'citi_animal', completedDate: '2023-06-20', expiresDate: '2026-06-20' }, // ~10 days
      { personnelId: 3, trainingType: 'hipaa', completedDate: '2025-01-01', expiresDate: null }, // no clock
    ], TODAY, EXPIRING_WINDOW_DAYS);
    expect(out.map((r) => r.trainingType)).toEqual(['citi_animal', 'citi_human_subjects']);
    expect(out[0].daysUntilExpiry).toBeLessThan(out[1].daysUntilExpiry);
  });
});
