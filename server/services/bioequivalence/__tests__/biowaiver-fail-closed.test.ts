/**
 * assessBiowaiver — a biowaiver criterion that was never assessed is not a
 * criterion that was met.
 *
 * A biowaiver decision replaces an in-vivo bioequivalence study in an ANDA/MAA.
 * Two branches granted one over data the caller never supplied:
 *
 *  1. BCS Class III excipients. The gate was
 *       excipientsQualitativelySame !== false && excipientsQuantitativelySimilar !== false
 *     and both flags are optional (neither is in the assess_biowaiver tool
 *     schema's `required` list) and were destructured WITHOUT the `= false`
 *     default their siblings get. So `undefined` — never assessed — read
 *     identically to an affirmative `true`, returning BIOWAIVER_GRANTED with the
 *     rationale 'Excipient similarity criteria met.' and an empty
 *     outstandingRequirements. Excipient sameness is the criterion that
 *     separates a Class III biowaiver from a Class I one.
 *
 *  2. BCS Class I. The very-rapidly-dissolving branch consulted the TEST product
 *     alone; `referenceVeryRapidlyDissolving` was read nowhere in the Class I
 *     path. ICH M9 (2019) 5.1 and FDA 2017 BCS waive the f2 comparison only when
 *     BOTH products are very rapidly dissolving — as this file's own Class III
 *     required-conditions text states. A caller explicitly stating the RLD is NOT
 *     very rapidly dissolving still received BIOWAIVER_GRANTED.
 *
 * Reachable as the deterministic AnA tool `assess_biowaiver`
 * (AnaToolExecutor.ts), whose output is reported verbatim.
 */
import { describe, it, expect } from 'vitest';
import { assessBiowaiver } from '../bioequivalence-knowledge';

const base = { drugName: 'Testolol', dosageForm: 'immediate-release tablet' } as const;

describe('assessBiowaiver — BCS Class III excipient criteria must be established', () => {
  it('does NOT grant when excipient comparison was never supplied', () => {
    const r = assessBiowaiver({
      ...base,
      bcsClass: 'III',
      veryRapidlyDissolving: true,
      referenceVeryRapidlyDissolving: true,
      // excipientsQualitativelySame / excipientsQuantitativelySimilar omitted
    } as any);
    expect(r.decision).not.toBe('BIOWAIVER_GRANTED');
    expect(r.eligible).toBe(false);
    // The fabricated sentence must not appear over an unperformed comparison.
    expect(r.rationale.join(' ')).not.toContain('Excipient similarity criteria met');
    expect(r.outstandingRequirements.join(' ')).toMatch(/not provided/i);
  });

  it('names BOTH unprovided excipient comparisons as outstanding', () => {
    const r = assessBiowaiver({
      ...base, bcsClass: 'III', veryRapidlyDissolving: true, referenceVeryRapidlyDissolving: true,
    } as any);
    const out = r.outstandingRequirements.join(' | ');
    expect(out).toMatch(/qualitative/i);
    expect(out).toMatch(/quantitative/i);
  });

  it('still grants when excipient similarity IS affirmatively established', () => {
    const r = assessBiowaiver({
      ...base,
      bcsClass: 'III',
      veryRapidlyDissolving: true,
      referenceVeryRapidlyDissolving: true,
      excipientsQualitativelySame: true,
      excipientsQuantitativelySimilar: true,
    } as any);
    expect(r.decision).toBe('BIOWAIVER_GRANTED');
    expect(r.eligible).toBe(true);
    expect(r.rationale.join(' ')).toContain('Excipient similarity criteria met');
    expect(r.outstandingRequirements).toEqual([]);
  });

  it('still refuses when excipients are explicitly dissimilar (unchanged path)', () => {
    const r = assessBiowaiver({
      ...base,
      bcsClass: 'III',
      veryRapidlyDissolving: true,
      referenceVeryRapidlyDissolving: true,
      excipientsQualitativelySame: false,
      excipientsQuantitativelySimilar: true,
    } as any);
    expect(r.decision).not.toBe('BIOWAIVER_GRANTED');
    expect(r.outstandingRequirements.join(' ')).toMatch(/qualitatively the same as the RLD/i);
  });
});

describe('assessBiowaiver — BCS Class I must evaluate the reference product', () => {
  it('does NOT grant on the test product alone when the RLD is stated NOT very rapidly dissolving', () => {
    const r = assessBiowaiver({
      ...base,
      bcsClass: 'I',
      veryRapidlyDissolving: true,
      referenceVeryRapidlyDissolving: false, // the filer explicitly said so
    } as any);
    expect(r.decision).not.toBe('BIOWAIVER_GRANTED');
    expect(r.decision).toBe('BIOWAIVER_CONDITIONAL');
    expect(r.outstandingRequirements.join(' ')).toMatch(/REFERENCE product/i);
  });

  it('does NOT grant when the RLD was never characterised at all', () => {
    const r = assessBiowaiver({ ...base, bcsClass: 'I', veryRapidlyDissolving: true } as any);
    expect(r.decision).not.toBe('BIOWAIVER_GRANTED');
    expect(r.eligible).toBe(false);
  });

  it('grants when BOTH products are very rapidly dissolving', () => {
    const r = assessBiowaiver({
      ...base, bcsClass: 'I', veryRapidlyDissolving: true, referenceVeryRapidlyDissolving: true,
    } as any);
    expect(r.decision).toBe('BIOWAIVER_GRANTED');
    expect(r.rationale.join(' ')).toMatch(/Both test and reference/i);
    expect(r.outstandingRequirements).toEqual([]);
  });

  it('grants on an f2 >= 50 comparison against the RLD even if the RLD is not very rapidly dissolving', () => {
    // f2 IS the comparison against the reference, so it independently supports
    // the waiver — the fix must not over-refuse this legitimate path.
    const r = assessBiowaiver({
      ...base, bcsClass: 'I', veryRapidlyDissolving: true, referenceVeryRapidlyDissolving: false, f2: 62,
    } as any);
    expect(r.decision).toBe('BIOWAIVER_GRANTED');
    expect(r.rationale.join(' ')).toMatch(/f2 = 62/);
  });

  it('leaves the rapidly-dissolving + f2 path unchanged', () => {
    const granted = assessBiowaiver({
      ...base, bcsClass: 'I', rapidlyDissolving: true, f2: 55,
    } as any);
    expect(granted.decision).toBe('BIOWAIVER_GRANTED');
    const conditional = assessBiowaiver({
      ...base, bcsClass: 'I', rapidlyDissolving: true,
    } as any);
    expect(conditional.decision).toBe('BIOWAIVER_CONDITIONAL');
    expect(conditional.outstandingRequirements.join(' ')).toMatch(/f2 >= 50/i);
  });
});
