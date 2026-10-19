/**
 * The SPL convenience layer carries the version and effective date it is given,
 * and says so when it was given neither — it does not pass them off as stated.
 *
 * Until 2026-10-15 generateSplXml wrote every document as versionNumber 1 (any
 * missing OR unusable version — 0, 2.5 — silently became 1) with today's date
 * as its effectiveTime, and its result said nothing about either. The route that
 * builds the LabelingPi SPL passes no version, so every SPL it produced was
 * "version 1 of its setId, effective today", admitted only in a code comment.
 * There was also no way to state an effective date at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSplXml } from '../spl-generation-service';

const INPUT = {
  productName: 'TestDrug XR',
  activeIngredients: [{ name: 'Testazolam', strength: '10 mg' }],
  indications: 'Treatment of mock condition in adults.',
  contraindications: 'Hypersensitivity to testazolam.',
  warnings: 'May cause drowsiness.',
  dosage: 'One tablet orally twice daily.',
  manufacturer: 'Acme Pharma Inc.',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('generateSplXml says what it was not told', () => {
  it('names the version and the effective date it was not given, and what it used instead', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const r = generateSplXml(INPUT);
    expect(r.xml).toContain('<versionNumber value="1"');
    expect(r.xml).toContain('<effectiveTime value="20261015"');
    expect(r.warnings).toEqual([
      expect.stringMatching(/^version not stated — the document carries versionNumber 1/),
      expect.stringMatching(/^effective date not stated — the document carries 20261015/),
    ]);
  });

  it('carries a stated version and effective date, and warns of nothing', () => {
    const r = generateSplXml({ ...INPUT, version: 3, effectiveDate: '2026-03-01' });
    expect(r.xml).toContain('<versionNumber value="3"');
    expect(r.xml).toContain('<effectiveTime value="20260301"');
    expect(r.warnings).toEqual([]);
  });

  it('refuses a version it cannot use instead of writing 1', () => {
    expect(() => generateSplXml({ ...INPUT, version: 0 })).toThrow('version must be an integer ≥ 1');
    expect(() => generateSplXml({ ...INPUT, version: 2.5 })).toThrow('version must be an integer ≥ 1');
  });

  it('refuses an effective date that is not a calendar date', () => {
    expect(() => generateSplXml({ ...INPUT, version: 1, effectiveDate: '2026-02-30' })).toThrow(
      'effectiveDate must be a calendar date (YYYY-MM-DD)',
    );
  });

  it('is the same document on any day once the effective date is stated', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
    const a = generateSplXml({ ...INPUT, version: 2, effectiveDate: '20260301' }).xml;
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const b = generateSplXml({ ...INPUT, version: 2, effectiveDate: '20260301' }).xml;
    expect(b).toBe(a);
  });
});
