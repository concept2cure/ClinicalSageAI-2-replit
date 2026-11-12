/**
 * The trial master file classifier (C2C-08): DIA RM zone catalog and the
 * artifact classifier. Pure, no DB/LLM.
 *
 * The completeness gap-check over the retired store's typed statuses
 * (evaluateCompleteness) and its eight cases went on 2026-11-12 (eTMF E4 step 5).
 * Its rules are the deployed store's, in tmf-completeness.test.ts: no record left
 * to check is no verdict, and one open record is never rounded to ready.
 */

import { describe, it, expect } from 'vitest';
import { TMF_ZONES, zoneName, classifyArtifact } from '../etmf-logic';

describe('TMF zones', () => {
  it('has the 11 DIA RM zones', () => {
    expect(TMF_ZONES).toHaveLength(11);
    expect(zoneName(4)).toMatch(/IRB/);
    expect(zoneName(99)).toBe('Unknown');
  });
});

describe('classifyArtifact', () => {
  it('routes informed consent to Zone 4 (IRB/IEC)', () => {
    expect(classifyArtifact('Informed Consent Form v2').zone).toBe(4);
  });
  it('routes the SAP to Zone 11 (Statistics)', () => {
    expect(classifyArtifact('Statistical Analysis Plan').zone).toBe(11);
  });
  it('routes a monitoring visit report to Zone 5', () => {
    expect(classifyArtifact('Monitoring Visit Report - Site 101').zone).toBe(5);
  });
  /* 2026-10-15: this read "defaults unknown artifacts to Zone 2" and pinned a
     zone nobody chose, which addArtifactTx then stored as the artifact's zone. */
  it('leaves an unmatched artifact unclassified, with no zone', () => {
    const c = classifyArtifact('Miscellaneous note');
    expect(c.zone).toBeNull();
    expect(c.confidence).toBe('unclassified');
  });
});
