/**
 * Grounding guarantee — pure detection, no I/O, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { assessGrounding } from '../grounding-core';

describe('assessGrounding', () => {
  it('flags an ungrounded percentage claim', () => {
    const r = assessGrounding('The treatment reduced events by 42% versus placebo.');
    expect(r.totalClaims).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.ungroundedClaims).toHaveLength(1);
    expect(r.ungroundedClaims[0].numbers.join(' ')).toContain('42%');
    expect(r.groundingScore).toBe(0);
  });

  it('passes a quantitative claim that carries a citation', () => {
    const r = assessGrounding('The treatment reduced events by 42% versus placebo [12].');
    expect(r.totalClaims).toBe(1);
    expect(r.ok).toBe(true);
    expect(r.groundingScore).toBe(1);
  });

  it('accepts a same-sentence source marker', () => {
    const r = assessGrounding('The overall response rate was 42% (Table 3 of the CSR).');
    expect(r.totalClaims).toBeGreaterThanOrEqual(1);
    expect(r.ok).toBe(true);
  });

  it('recognizes diverse claim types (p-value, n=, dose, duration)', () => {
    const text = [
      'The difference was significant (p<0.001).', // grounded? no marker -> ungrounded
      'A total of 240 patients were enrolled.',
      'Subjects received 50 mg daily for 12 weeks.',
    ].join(' ');
    const r = assessGrounding(text);
    expect(r.totalClaims).toBeGreaterThanOrEqual(3);
    expect(r.ungroundedClaims.length).toBeGreaterThanOrEqual(3);
  });

  it('returns a perfect score when there are no quantitative claims', () => {
    const r = assessGrounding('The protocol describes the study objectives and endpoints qualitatively.');
    expect(r.totalClaims).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.groundingScore).toBe(1);
  });

  it('computes a partial score when some claims are grounded and others not', () => {
    const text = 'Efficacy was 30% per the SAP. Safety events occurred in 5% of subjects.';
    const r = assessGrounding(text);
    expect(r.totalClaims).toBe(2);
    expect(r.groundedClaims).toBe(1);
    expect(r.groundingScore).toBe(0.5);
    expect(r.ok).toBe(false);
  });
});
