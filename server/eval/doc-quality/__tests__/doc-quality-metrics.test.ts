import { describe, it, expect } from 'vitest';
import {
  sectionCoverageScore,
  forbiddenPatternHits,
  fieldExtractionScore,
  f1,
  scoreGenerationTask,
  scoreExtractionTask,
  type GoldDocTask,
} from '../doc-quality-metrics';

describe('sectionCoverageScore', () => {
  it('scores full coverage and reports missing sections', () => {
    const content = 'Device description here. Substantial equivalence to predicate. Performance testing done.';
    const full = sectionCoverageScore(content, ['device description', 'substantial equivalence', 'performance testing']);
    expect(full.coverage).toBe(1);
    expect(full.missing).toEqual([]);

    const partial = sectionCoverageScore(content, ['device description', 'labeling']);
    expect(partial.coverage).toBe(0.5);
    expect(partial.missing).toEqual(['labeling']);
  });

  it('is case- and whitespace-insensitive and treats no requirements as full coverage', () => {
    expect(sectionCoverageScore('INTENDED   USE', ['intended use']).coverage).toBe(1);
    expect(sectionCoverageScore('anything', []).coverage).toBe(1);
  });
});

describe('forbiddenPatternHits', () => {
  it('flags overclaim phrasing case-insensitively', () => {
    const r = forbiddenPatternHits('This device is Proven Safe and guaranteed.', ['proven safe', 'guaranteed', 'no risk']);
    expect(r.count).toBe(2);
    expect(r.hits).toContain('proven safe');
    expect(r.hits).toContain('guaranteed');
  });
});

describe('fieldExtractionScore', () => {
  it('matches via normalized substring and computes P/R/F1', () => {
    const score = fieldExtractionScore(
      { device_name: 'Acme Analyzer 2000', predicate_k_number: 'K123456', regulation_number: '21 CFR 862.1345' },
      { device_name: 'Acme Analyzer', predicate_k_number: 'K123456', regulation_number: '862.1345', product_code: 'JJX' }
    );
    expect(score.matched).toEqual(['device_name', 'predicate_k_number', 'regulation_number']);
    expect(score.missed).toEqual(['product_code']); // expected but not provided
    expect(score.recall).toBeCloseTo(3 / 4);
    // attempted = 3 expected keys produced; spurious = 0 → precision = 3/3
    expect(score.precision).toBeCloseTo(1);
    expect(score.f1).toBeCloseTo(f1(1, 0.75));
  });

  it('penalizes spurious extra fields in precision', () => {
    const score = fieldExtractionScore(
      { a: 'x', b: 'y', c: 'z' },
      { a: 'x' }
    );
    expect(score.recall).toBe(1);
    expect(score.spurious.sort()).toEqual(['b', 'c']);
    expect(score.precision).toBeCloseTo(1 / 3); // 1 matched / (1 attempted + 2 spurious)
  });
});

describe('composite task scoring', () => {
  const genTask: GoldDocTask = {
    id: 't-gen',
    docType: '510k',
    taskType: 'generation',
    requiredSections: ['device description', 'substantial equivalence', 'labeling'],
    forbiddenPatterns: ['proven safe'],
  };

  it('passes a covering, clean generation and fails on a forbidden hit', () => {
    const good = scoreGenerationTask(genTask, 'Device description. Substantial equivalence. Labeling.', 0.85);
    expect(good.pass).toBe(true);
    expect(good.sectionCoverage).toBe(1);

    const bad = scoreGenerationTask(genTask, 'Device description. Substantial equivalence. Labeling. It is proven safe.', 0.85);
    expect(bad.forbiddenHits).toBe(1);
    expect(bad.pass).toBe(false);
  });

  it('fails generation below the coverage threshold', () => {
    const thin = scoreGenerationTask(genTask, 'Device description only.', 0.85);
    expect(thin.sectionCoverage).toBeCloseTo(1 / 3);
    expect(thin.pass).toBe(false);
  });

  it('passes extraction at or above the F1 threshold', () => {
    const task: GoldDocTask = {
      id: 't-ext',
      docType: '510k',
      taskType: 'extraction',
      expectedFields: { device_name: 'Acme', k_number: 'K1' },
    };
    const s = scoreExtractionTask(task, { device_name: 'Acme Analyzer', k_number: 'K1' }, 0.8);
    expect(s.f1).toBe(1);
    expect(s.pass).toBe(true);
  });
});
