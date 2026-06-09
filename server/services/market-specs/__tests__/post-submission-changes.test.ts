/**
 * Tests for post-submission change classification — proves the category catalog is
 * consistent and the flag-driven classifier follows its deterministic precedence.
 */
import { describe, it, expect } from 'vitest';
import {
  CHANGE_CATEGORIES,
  getChangeCategory,
  categoriesForMarket,
  changeCategoryIds,
  recommendChangeCategory,
} from '../post-submission-changes';

describe('change categories — consistency', () => {
  it('has unique ids and required fields', () => {
    const ids = changeCategoryIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHANGE_CATEGORIES) {
      expect(c.label).toBeTruthy();
      expect(c.definition).toBeTruthy();
      expect(c.basis).toBeTruthy();
      expect(['variation', 'amendment', 'annual', 'response']).toContain(c.sequenceType);
    }
  });

  it('scopes by market', () => {
    expect(categoriesForMarket('us').map((c) => c.id)).toEqual(expect.arrayContaining(['fda_pas', 'fda_cbe30', 'fda_cbe0', 'fda_ar']));
    expect(categoriesForMarket('eu').map((c) => c.id)).toEqual(expect.arrayContaining(['eu_type_ia', 'eu_type_ib', 'eu_type_ii', 'eu_extension']));
  });
});

describe('change classifier — US precedence', () => {
  it('a scope extension or major impact → Prior Approval Supplement', () => {
    expect(recommendChangeCategory('us', { scopeExtension: true }).categoryId).toBe('fda_pas');
    expect(recommendChangeCategory('us', { majorImpact: true }).categoryId).toBe('fda_pas');
  });
  it('an immediate safety change → CBE-0', () => {
    expect(recommendChangeCategory('us', { immediateSafetyChange: true }).categoryId).toBe('fda_cbe0');
  });
  it('a moderate change → CBE-30, a minimal change → Annual Report', () => {
    expect(recommendChangeCategory('us', { moderateImpact: true }).categoryId).toBe('fda_cbe30');
    expect(recommendChangeCategory('us', { minimalImpact: true }).categoryId).toBe('fda_ar');
  });
  it('defaults to the most conservative category when flags are absent', () => {
    expect(recommendChangeCategory('us', {}).categoryId).toBe('fda_pas');
  });
});

describe('change classifier — EU precedence', () => {
  it('a scope extension → line extension; major → Type II', () => {
    expect(recommendChangeCategory('eu', { scopeExtension: true }).categoryId).toBe('eu_extension');
    expect(recommendChangeCategory('eu', { majorImpact: true }).categoryId).toBe('eu_type_ii');
  });
  it('minimal impact → Type IA, or IAIN when immediate notification is required', () => {
    expect(recommendChangeCategory('eu', { minimalImpact: true }).categoryId).toBe('eu_type_ia');
    expect(recommendChangeCategory('eu', { minimalImpact: true, euImmediateNotification: true }).categoryId).toBe('eu_type_iain');
  });
  it('moderate impact → Type IB', () => {
    expect(recommendChangeCategory('eu', { moderateImpact: true }).categoryId).toBe('eu_type_ib');
  });
  it('every recommendation carries a sequence type and a confirm caveat', () => {
    const r = recommendChangeCategory('eu', { majorImpact: true });
    expect(r.sequenceType).toBe('variation');
    expect(r.caveat).toMatch(/classification guideline/);
    expect(getChangeCategory(r.categoryId)).toBeTruthy();
  });
});
