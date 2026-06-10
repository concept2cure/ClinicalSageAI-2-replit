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

  it('is deterministic (heuristic method, no model dependency)', async () => {
    const a = await clf.classify('SSN 123-45-6789');
    const b = await clf.classify('SSN 123-45-6789');
    expect(a.method).toBe('heuristic');
    expect(a).toEqual(b);
  });
});
