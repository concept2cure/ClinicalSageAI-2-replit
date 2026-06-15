/**
 * Electronic submission format & gateway requirements expert — tests.
 */

import { describe, it, expect } from 'vitest';
import {
  getSubmissionFormat,
  assessSubmissionReadiness,
  SUBMISSION_MARKETS,
  SUBMISSION_FORMATS,
  type SubmissionMarket,
} from '../electronic-submission-format';

describe('submission-format catalog', () => {
  it('is complete for all 5 markets (format + gateway + citation truthy)', () => {
    expect(SUBMISSION_MARKETS).toEqual(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA']);
    for (const m of SUBMISSION_MARKETS) {
      const f = getSubmissionFormat(m)!;
      expect(f).toBeTruthy();
      expect(f.format).toBeTruthy();
      expect(f.ectdVersion).toBeTruthy();
      expect(f.gateway).toBeTruthy();
      expect(f.validationCriteria.name).toBeTruthy();
      expect(f.regionalModule).toBeTruthy();
      expect(f.citation).toBeTruthy();
    }
  });

  it('FDA eCTD is mandatory', () => {
    expect(SUBMISSION_FORMATS.FDA.mandatory).toBe(true);
    expect(SUBMISSION_FORMATS.FDA.format).toBe('eCTD');
  });

  it('getSubmissionFormat returns null for an unmodeled market', () => {
    expect(getSubmissionFormat('XYZ' as SubmissionMarket)).toBeNull();
  });
});

describe('assessSubmissionReadiness — readiness gates', () => {
  it('not ready when gateway not enrolled', () => {
    const r = assessSubmissionReadiness({ market: 'FDA', format: 'eCTD', gatewayEnrolled: false, validationPassed: true });
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes('gateway') || i.includes('Gateway'))).toBe(true);
  });

  it('not ready when validation not passed', () => {
    const r = assessSubmissionReadiness({ market: 'EMA', format: 'eCTD', gatewayEnrolled: true, validationPassed: false });
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.toLowerCase().includes('validation'))).toBe(true);
  });

  it('ready when format matches + gatewayEnrolled + validationPassed', () => {
    const r = assessSubmissionReadiness({ market: 'FDA', format: 'eCTD', gatewayEnrolled: true, validationPassed: true });
    expect(r.ready).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.required).toBe(SUBMISSION_FORMATS.FDA);
  });

  it('format mismatch produces an issue', () => {
    const r = assessSubmissionReadiness({ market: 'FDA', format: 'NeeS', gatewayEnrolled: true, validationPassed: true });
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes('does not match'))).toBe(true);
  });

  it('treats a missing format as a gap', () => {
    const r = assessSubmissionReadiness({ market: 'FDA', gatewayEnrolled: true, validationPassed: true });
    expect(r.ready).toBe(false);
    expect(r.issues.some((i) => i.includes('not supplied'))).toBe(true);
  });

  it('every result carries the evolution caveat', () => {
    const r = assessSubmissionReadiness({ market: 'PMDA', format: 'eCTD', gatewayEnrolled: true, validationPassed: true });
    expect(r.notes.some((n) => n.toLowerCase().includes('evolve'))).toBe(true);
  });
});

describe('assessSubmissionReadiness — errors + determinism', () => {
  it('throws for an unmodeled market', () => {
    expect(() => assessSubmissionReadiness({ market: 'XYZ' as SubmissionMarket })).toThrow();
  });

  it('is deterministic', () => {
    const input = { market: 'MHRA' as SubmissionMarket, format: 'eCTD', gatewayEnrolled: true, validationPassed: false };
    expect(assessSubmissionReadiness(input)).toEqual(assessSubmissionReadiness(input));
  });
});
