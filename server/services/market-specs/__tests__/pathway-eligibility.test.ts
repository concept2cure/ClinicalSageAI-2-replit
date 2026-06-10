/**
 * Tests for the expedited-pathway eligibility engine — proves criteria are
 * consistent and that the all-criteria-met rule (with undetermined handling) holds.
 */
import { describe, it, expect } from 'vitest';
import {
  DESIGNATIONS,
  getDesignation,
  designationsForMarket,
  designationIds,
  assessEligibility,
} from '../pathway-eligibility';

describe('pathway eligibility — consistency', () => {
  it('has unique ids, ≥1 criterion each, and required fields', () => {
    const ids = designationIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DESIGNATIONS) {
      expect(d.label).toBeTruthy();
      expect(d.basis).toBeTruthy();
      expect(d.criteria.length).toBeGreaterThan(0);
      const cids = d.criteria.map((c) => c.id);
      expect(new Set(cids).size).toBe(cids.length);
    }
  });

  it('scopes designations by market', () => {
    expect(designationsForMarket('us').some((d) => d.id === 'fda_breakthrough')).toBe(true);
    expect(designationsForMarket('eu').some((d) => d.id === 'eu_prime')).toBe(true);
    expect(designationsForMarket('jp').some((d) => d.id === 'pmda_sakigake')).toBe(true);
  });
});

describe('pathway eligibility — assessment', () => {
  it('is eligible only when every criterion is met', () => {
    const a = assessEligibility('fda_breakthrough', { serious: true, preliminary_substantial: true })!;
    expect(a.eligible).toBe(true);
    expect(a.unmet).toHaveLength(0);
    expect(a.unanswered).toHaveLength(0);
  });

  it('is not eligible when a criterion is false', () => {
    const a = assessEligibility('fda_breakthrough', { serious: true, preliminary_substantial: false })!;
    expect(a.eligible).toBe(false);
    expect(a.unmet).toContain('preliminary_substantial');
  });

  it('leaves eligibility undetermined (false) while a criterion is unanswered', () => {
    const a = assessEligibility('eu_conditional_ma', { serious: true, benefit_risk: true })!;
    expect(a.eligible).toBe(false);
    expect(a.unanswered).toEqual(expect.arrayContaining(['unmet_need', 'immediate_availability']));
  });

  it('returns undefined for an unknown designation', () => {
    expect(assessEligibility('nope', {})).toBeUndefined();
  });

  it('handles a single-criterion designation (orphan)', () => {
    expect(assessEligibility('fda_orphan', { rare: true })!.eligible).toBe(true);
    expect(assessEligibility('fda_orphan', {})!.eligible).toBe(false);
  });
});
