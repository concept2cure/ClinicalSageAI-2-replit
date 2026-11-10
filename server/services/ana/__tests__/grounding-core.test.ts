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

  // One reference detector (in-text-references.ts) decides cross-references on
  // every path, so a listing grounds like a table and an impossible CTD code grounds
  // nothing (g-in-text-reference-resolution).
  it('without options, a Listing reference grounds like a Table one', () => {
    const r = assessGrounding('Systolic blood pressure fell by 5% (Listing 16.2.6).');
    expect(r.totalClaims).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('without options, a CTD code that cannot exist grounds nothing', () => {
    const r = assessGrounding('Efficacy persisted for 12 weeks (Module 6.1).');
    expect(r.totalClaims).toBe(1);
    expect(r.ok).toBe(false);
  });
});

/* A registered citation, as the saved-document reader renders it for a checker:
   `[citation: <name>, <locator>]` (authoring-read-render.ts runText). Until
   2026-11-10 it grounded nothing: no citation pattern matched the label, and
   the sentence splitter cut it apart at "citation:" before a capital and at
   "p." before a page number. A typed "[1]" grounded the same claim. */
describe('a registered citation, as the saved-document reader renders it', () => {
  it('grounds the claim in its own sentence', () => {
    const r = assessGrounding('Oral bioavailability of C2C-101 was 62% [citation: Study C2C-101-PK-01 report].');
    expect(r.totalClaims).toBe(1);
    expect(r.ok).toBe(true);
    expect(r.referencedClaims[0].sentence).toContain('[citation: Study C2C-101-PK-01 report]');
  });

  it.each([
    ['a colon before a capital', '[citation: Biopharmaceutics: Study report, section 4]'],
    ['a page locator', '[citation: study report, p. 12]'],
    ['a sentence end inside the name', '[citation: Report no. 7. Final version]'],
  ])('is one token to the sentence splitter, with %s in its label', (_what, label) => {
    const r = assessGrounding(`Oral bioavailability of C2C-101 was 62% ${label}. Clearance fell by 30%.`);
    expect(r.referencedClaims.map(c => c.sentence)).toEqual([
      `Oral bioavailability of C2C-101 was 62% ${label}.`,
      'Clearance fell by 30%.',
    ]);
    expect(r.referencedClaims.map(c => c.hasCitation)).toEqual([true, false]);
  });

  it('does not ground a claim in another sentence', () => {
    const r = assessGrounding('Oral bioavailability of C2C-101 was 62%. The study is described elsewhere [citation: Study report].');
    expect(r.ungroundedClaims.map(c => c.sentence)).toEqual(['Oral bioavailability of C2C-101 was 62%.']);
  });

  it('an unclosed or empty label grounds nothing', () => {
    expect(assessGrounding('Oral bioavailability of C2C-101 was 62% [citation: Study report.').ok).toBe(false);
    expect(assessGrounding('Oral bioavailability of C2C-101 was 62% [citation: ].').ok).toBe(false);
  });
});
