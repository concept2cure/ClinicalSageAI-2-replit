/**
 * COA selection advisor — unit tests. Deterministic; verifies direct lookup,
 * concept/reporter-based suggestion, fit-for-purpose content, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseCoaSelection, listCoaTypes } from '../coa-selection';

describe('adviseCoaSelection', () => {
  it('returns details for a directly requested COA type', () => {
    const r = adviseCoaSelection({ coaType: 'pro' });
    expect(r.resolved.coaType).toBe('pro');
    expect(r.brief).toContain('Patient-Reported Outcome');
    expect(r.brief).toContain('Fit-for-purpose');
  });

  it('suggests PRO for a self-reportable symptom concept', () => {
    const r = adviseCoaSelection({ concept: 'pain intensity and fatigue' });
    expect(r.suggestion?.id).toBe('pro');
    expect(r.resolved.coaType).toBe('pro');
  });

  it('suggests PerfO for a functional-task concept', () => {
    const r = adviseCoaSelection({ concept: '6-minute walk distance' });
    expect(r.suggestion?.id).toBe('perfo');
  });

  it('suggests ObsRO when a caregiver reports on a young child', () => {
    const r = adviseCoaSelection({ concept: 'observable symptoms', reporter: 'caregiver' });
    expect(r.suggestion?.id).toBe('obsro');
  });

  it('suggests ClinRO when the reporter is a clinician', () => {
    const r = adviseCoaSelection({ concept: 'disease activity', reporter: 'investigator' });
    expect(r.suggestion?.id).toBe('clinro');
  });

  it('lists the four COA types', () => {
    expect(listCoaTypes().map(c => c.id)).toEqual(['pro', 'clinro', 'obsro', 'perfo']);
  });
});
