/**
 * Drift-detection tests.
 */

import { describe, it, expect } from 'vitest';
import { detectDrift } from '../drift-detection';
import { simulateIvdReview } from '../reviewer-simulation-ivd';

describe('detectDrift', () => {
  it('flags stale assessments by corpus version', () => {
    const report = detectDrift(
      [
        { id: 'a', assessment_type: 'other', inputs: {}, corpus_version: 'v100-aaaaaaaa' },
        { id: 'b', assessment_type: 'other', inputs: {}, corpus_version: 'v137-current' },
      ],
      'v137-current'
    );
    expect(report.total).toBe(2);
    expect(report.staleCount).toBe(1);
    expect(report.items.find(i => i.id === 'a')?.stale).toBe(true);
    expect(report.items.find(i => i.id === 'b')?.stale).toBe(false);
  });

  it('recomputes a reviewer_simulation and reports no change when inputs/engine are stable', () => {
    const inputs = { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' };
    const stored = simulateIvdReview(inputs as any);
    const report = detectDrift(
      [{ id: 'r1', assessment_type: 'reviewer_simulation', inputs, result: { verdict: stored.verdict, readinessScore: stored.readinessScore }, corpus_version: 'v1-old' }],
      'v2-new'
    );
    const item = report.items[0];
    expect(item.recomputed).toBe(true);
    expect(item.stale).toBe(true);
    expect(item.changed).toBe(false);
    expect(item.newVerdict).toBe(stored.verdict);
    expect(item.readinessDelta).toBe(0);
  });

  it('detects a changed verdict when the stored result differs from the recompute', () => {
    const inputs = { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' };
    const report = detectDrift(
      [{ id: 'r2', assessment_type: 'reviewer_simulation', inputs, result: { verdict: 'likely_acceptance', readinessScore: 100 }, corpus_version: 'v1-old' }],
      'v2-new'
    );
    expect(report.items[0].changed).toBe(true);
    expect(report.changedCount).toBe(1);
  });

  it('recomputes an ivdr_classification', () => {
    const report = detectDrift(
      [{ id: 'c1', assessment_type: 'ivdr_classification', inputs: { intendedPurpose: 'companion diagnostic', isCompanionDiagnostic: true }, result: { classification: 'C' }, corpus_version: 'v1' }],
      'v2'
    );
    expect(report.items[0].recomputed).toBe(true);
    expect(report.items[0].changed).toBe(false); // CDx still Class C
  });

  it('flags non-recomputable types for manual review', () => {
    const report = detectDrift([{ id: 'x', assessment_type: 'study_design', inputs: {}, corpus_version: 'v1' }], 'v2');
    expect(report.items[0].recomputed).toBe(false);
    expect(report.items[0].note).toMatch(/manual review/i);
  });
});
