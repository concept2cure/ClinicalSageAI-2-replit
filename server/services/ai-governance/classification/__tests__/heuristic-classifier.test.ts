import { describe, it, expect } from 'vitest';
import { HeuristicContentClassifier } from '../heuristic-classifier';

const clf = new HeuristicContentClassifier();

describe('HeuristicContentClassifier', () => {
  it('classifies clean regulatory prose as regulatory, not PHI/PII', async () => {
    const r = await clf.classify(
      'This IND submission follows eCTD structure per 21 CFR Part 11 and ICH E6.',
    );
    expect(r.regulatory).toBe(true);
    expect(r.phi).toBe(false);
    expect(r.pii).toBe(false);
    expect(r.classes).toContain('regulatory');
  });

  it('detects PII (SSN + email) and never returns the raw value', async () => {
    const r = await clf.classify('Contact jane.doe@example.com, SSN 123-45-6789.');
    expect(r.pii).toBe(true);
    expect(r.classes[0]).toBe('pii');
    const detectors = r.matches.map(m => m.detector);
    expect(detectors).toContain('email');
    expect(detectors).toContain('ssn');
    for (const m of r.matches) {
      expect(m.redactedSample).not.toContain('123-45-6789');
      expect(m.redactedSample).not.toContain('jane.doe@example.com');
    }
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects PHI from labeled identifiers and ranks PHI most-sensitive', async () => {
    const r = await clf.classify('Patient MRN: A1234567, DOB: 1980-04-12.');
    expect(r.phi).toBe(true);
    expect(r.classes[0]).toBe('phi');
  });

  it('returns public for content with no detected sensitivity', async () => {
    const r = await clf.classify('The meeting is scheduled for next Tuesday.');
    expect(r.classes).toEqual(['public']);
    expect(r.phi).toBe(false);
    expect(r.pii).toBe(false);
    expect(r.regulatory).toBe(false);
  });

  // 2026-10-25: the card detector matched any 13–16 digits with spaces between
  // them, so a row of a CSR table read as a card number, every document with a
  // numeric table classified as PII, and production placement refused it.
  it('does not read a row of a numeric table as a card number', async () => {
    const rows = [
      'Placebo 12 34 56 78 90 11 12 13',
      'Subjects randomised 1 2 3 4 5 6 7 8 9 1 2 3 4 5',
      'Visit 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16',
    ];
    for (const row of rows) {
      const r = await clf.classify(row);
      expect(r.matches.map(m => m.detector), row).not.toContain('credit_card');
      expect(r.pii, row).toBe(false);
    }
  });

  it('still detects a card number written as one, and only one that passes the Luhn check', async () => {
    for (const card of ['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111', '378282246310005']) {
      const r = await clf.classify(`Card on file ${card}.`);
      expect(r.matches.map(m => m.detector), card).toContain('credit_card');
      expect(r.pii, card).toBe(true);
    }
    const notLuhn = await clf.classify('Lot 4111 1111 1111 1112 released.');
    expect(notLuhn.matches.map(m => m.detector)).not.toContain('credit_card');
  });

  it('is deterministic (heuristic method, no model dependency)', async () => {
    const a = await clf.classify('SSN 123-45-6789');
    const b = await clf.classify('SSN 123-45-6789');
    expect(a.method).toBe('heuristic');
    expect(a).toEqual(b);
  });
});
