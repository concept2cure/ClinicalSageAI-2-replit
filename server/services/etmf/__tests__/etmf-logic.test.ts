/**
 * eTMF deterministic logic (C2C-08) — DIA RM zone catalog, auto-classifier, and
 * the completeness gap-check. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { TMF_ZONES, zoneName, classifyArtifact, evaluateCompleteness, type CompletenessArtifact } from '../etmf-logic';

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
  it('defaults unknown artifacts to Zone 2', () => {
    const c = classifyArtifact('Miscellaneous note');
    expect(c.zone).toBe(2);
    expect(c.confidence).toBe('default');
  });
});

describe('evaluateCompleteness', () => {
  const base: CompletenessArtifact[] = [
    { zone: 2, artifactName: 'Protocol', expected: true, completenessRequired: true, status: 'final' },
    { zone: 4, artifactName: 'IRB Approval', expected: true, completenessRequired: true, status: 'final' },
    { zone: 5, artifactName: '1572', expected: true, completenessRequired: true, status: 'final' },
  ];

  it('scores a fully-final required set at 100 / inspection_ready', () => {
    const r = evaluateCompleteness(base);
    expect(r.completenessPct).toBe(100);
    expect(r.verdict).toBe('inspection_ready');
    expect(r.gaps).toHaveLength(0);
  });
  it('lists non-final required artifacts as gaps', () => {
    const r = evaluateCompleteness([...base, { zone: 7, artifactName: 'SAE log', expected: true, completenessRequired: true, status: 'missing' }]);
    expect(r.gaps.some((g) => /SAE log/.test(g.artifactName))).toBe(true);
    expect(r.completenessPct).toBe(75);
    expect(r.verdict).toBe('at_risk');
  });
  it('ignores not_applicable and non-required artifacts', () => {
    const r = evaluateCompleteness([
      ...base,
      { zone: 9, artifactName: 'Optional vendor doc', expected: true, completenessRequired: false, status: 'missing' },
      { zone: 6, artifactName: 'N/A item', expected: true, completenessRequired: true, status: 'not_applicable' },
    ]);
    expect(r.totalRequired).toBe(3);
    expect(r.completenessPct).toBe(100);
  });
  it('treats received-but-not-final as a (minor) gap', () => {
    const arts: CompletenessArtifact[] = Array.from({ length: 10 }, (_, i) => ({ zone: 2, artifactName: `doc${i}`, expected: true, completenessRequired: true, status: i === 0 ? 'received' : 'final' }));
    const r = evaluateCompleteness(arts);
    expect(r.completenessPct).toBe(90);
    expect(r.verdict).toBe('minor_gaps');
    expect(r.gaps).toHaveLength(1);
  });
  /* This test used to read "returns 100 when nothing is required", and it was
     the defect written down. `present === totalRequired` is 0 === 0, so an
     empty required set also produced the verdict `inspection_ready` — a trial
     whose TMF index holds no expected artifacts was reported to the sponsor,
     and by AnA in conversation, as "TMF 100% complete — inspection ready".
     Nothing had been indexed, so nothing had been checked. */
  it('an empty required set is not-assessed — never 100% and never inspection_ready', () => {
    const r = evaluateCompleteness([]);
    expect(r.completenessPct).toBeNull();
    expect(r.verdict).toBe('not_assessed');
    expect(r.totalRequired).toBe(0);
  });

  it('is also not-assessed when every artifact is unexpected or not applicable', () => {
    const r = evaluateCompleteness([
      { zone: 1, artifactName: 'Trial Master File Plan', expected: false, completenessRequired: true, status: 'missing' },
      { zone: 2, artifactName: 'IB', expected: true, completenessRequired: false, status: 'final' },
      { zone: 3, artifactName: 'Site agreement', expected: true, completenessRequired: true, status: 'not_applicable' },
    ]);
    expect(r.verdict).toBe('not_assessed');
    expect(r.completenessPct).toBeNull();
  });

  /* One required artifact, and it is final: that IS an assessment, and it
     reads clear. The not-assessed state must not swallow a real result. */
  it('a single required artifact that is final does read inspection_ready', () => {
    const r = evaluateCompleteness([
      { zone: 1, artifactName: 'Signed protocol', expected: true, completenessRequired: true, status: 'final' },
    ]);
    expect(r.completenessPct).toBe(100);
    expect(r.verdict).toBe('inspection_ready');
  });

  it('never reports inspection_ready while a required artifact is missing, even when the percentage rounds to 100', () => {
    // 200 required artifacts, exactly one missing -> 199/200 = 99.5% -> rounds to 100%.
    // A missing REQUIRED essential document is inspection-blocking and must not be
    // masked by rounding the percentage up to the readiness threshold (fail-open).
    const arts: CompletenessArtifact[] = Array.from({ length: 200 }, (_, i) => ({
      zone: 2,
      artifactName: `doc${i}`,
      expected: true,
      completenessRequired: true,
      status: i === 0 ? 'missing' : 'final',
    }));
    const r = evaluateCompleteness(arts);
    expect(r.completenessPct).toBe(100); // rounding artifact
    expect(r.gaps).toHaveLength(1);
    expect(r.verdict).not.toBe('inspection_ready');
  });
});
