/**
 * Tests for claim-grounding — the guard that scans a turn for high-stakes,
 * falsifiable claim categories (citations, numbers, probabilities, precedents,
 * guarantees, deadlines) and emits a verification directive before AnA commits
 * them. This is the rigor layer: it must catch each category, lead with the
 * riskiest one, and never emit a tone-violating directive.
 */
import { describe, it, expect } from 'vitest';
import {
  detectClaimCategories,
  buildClaimGroundingBlock,
  getClaimCheck,
  CLAIM_CHECKS,
} from '../claim-grounding.js';

describe('detectClaimCategories', () => {
  it('returns nothing for empty input', () => {
    expect(detectClaimCategories()).toEqual([]);
    expect(detectClaimCategories('', undefined)).toEqual([]);
  });

  it('detects a guarantee claim', () => {
    const cats = detectClaimCategories('This will be approved, no question.').map(c => c.category);
    expect(cats).toContain('guarantee');
  });

  it('detects a regulatory citation', () => {
    const cats = detectClaimCategories('You must comply with 21 CFR 820.30 here.').map(c => c.category);
    expect(cats).toContain('citation');
  });

  it('detects a numeric threshold', () => {
    const cats = detectClaimCategories('You need to enroll 50 patients.').map(c => c.category);
    expect(cats).toContain('numeric');
  });

  it('detects an approval-probability claim', () => {
    const cats = detectClaimCategories('The probability of approval is high.').map(c => c.category);
    expect(cats).toContain('probability');
  });

  it('detects a precedent assertion', () => {
    const cats = detectClaimCategories('A similar device was approved last year.').map(c => c.category);
    expect(cats).toContain('precedent');
  });

  it('detects a regulatory deadline claim', () => {
    const cats = detectClaimCategories('The PDUFA date is in March.').map(c => c.category);
    expect(cats).toContain('deadline');
  });

  it('scans across both the user message and the drafted answer', () => {
    const cats = detectClaimCategories('What about timing?', 'The PDUFA date is set.').map(c => c.category);
    expect(cats).toContain('deadline');
  });

  it('orders results most-damaging-first (matching CLAIM_CHECKS order)', () => {
    // numeric appears before guarantee in the text, but guarantee must lead.
    const matched = detectClaimCategories('Enroll 50 patients and it will be approved.');
    const order = CLAIM_CHECKS.map(c => c.category).filter(cat =>
      matched.some(m => m.category === cat)
    );
    expect(matched.map(m => m.category)).toEqual(order);
    expect(matched[0].category).toBe('guarantee');
  });
});

describe('buildClaimGroundingBlock', () => {
  it('returns an empty string when nothing groundable is present', () => {
    expect(buildClaimGroundingBlock('How is the weather today?')).toBe('');
  });

  it('renders a directive block for detected claims', () => {
    const block = buildClaimGroundingBlock('You must cite 21 CFR 820 and it will be approved.');
    expect(block).toContain('Claim-grounding check (NON-NEGOTIABLE)');
    expect(block).toContain('Absolute assurance');
    expect(block).toContain('Regulatory citation');
  });

  it('honors the tone floor — no exclamation marks, no emoji', () => {
    const block = buildClaimGroundingBlock('The probability of approval is 90% and it is guaranteed.');
    expect(block).not.toContain('!');
    // No emoji / pictographic characters.
    expect(/\p{Extended_Pictographic}/u.test(block)).toBe(false);
  });
});

describe('getClaimCheck', () => {
  it('looks up a check by category', () => {
    expect(getClaimCheck('guarantee')?.category).toBe('guarantee');
  });

  it('returns null for an unknown category', () => {
    expect(getClaimCheck('nonsense' as never)).toBeNull();
  });
});
