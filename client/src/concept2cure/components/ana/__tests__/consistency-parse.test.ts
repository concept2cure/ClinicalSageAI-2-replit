/**
 * Unit tests for mapConsistencyResult — the client-side parse of a
 * check_dossier_consistency tool result into the Document Studio
 * ConsistencyResult shape (E2: Dossier Consistency Sweep).
 *
 * The server executor returns the summarized envelope from
 * server/services/ana/AnaToolExecutor.ts (verdict + bySeverity + capped
 * divergences); these tests pin the mapping of each verdict tier and the
 * divergence shape, and the defensive guards.
 */

import { describe, it, expect } from 'vitest';
import { mapConsistencyResult } from '../useAnaChat';

describe('mapConsistencyResult — verdict tiers', () => {
  it('maps a clean verdict with no divergences', () => {
    const out = mapConsistencyResult({
      verdict: 'clean',
      artifactsCompared: 4,
      draftFactsExtracted: 12,
      divergenceCount: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      divergences: [],
      recommendation: 'No consistency issues detected against the existing dossier.',
    });
    expect(out?.verdict).toBe('clean');
    expect(out?.artifactsCompared).toBe(4);
    expect(out?.draftFactsExtracted).toBe(12);
    expect(out?.divergenceCount).toBe(0);
    expect(out?.divergences).toEqual([]);
    expect(out?.recommendation).toContain('No consistency issues');
  });

  it('maps a minor_issues verdict', () => {
    const out = mapConsistencyResult({
      verdict: 'minor_issues',
      artifactsCompared: 2,
      draftFactsExtracted: 8,
      divergenceCount: 1,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 1 },
      divergences: [
        {
          kind: 'numeric_divergence',
          severity: 'low',
          description: 'Shelf-life stated differently.',
          draftValue: '24 months',
          existingValue: '36 months',
          existingArtifact: 'Module 3.2.P.8.1 Stability',
          existingCtdSection: '3.2.P.8.1',
        },
      ],
    });
    expect(out?.verdict).toBe('minor_issues');
    expect(out?.bySeverity.low).toBe(1);
    expect(out?.divergences[0].existingValue).toBe('36 months');
  });

  it('maps a needs_review verdict with a high-severity divergence', () => {
    const out = mapConsistencyResult({
      verdict: 'needs_review',
      artifactsCompared: 3,
      draftFactsExtracted: 20,
      divergenceCount: 2,
      bySeverity: { critical: 0, high: 1, medium: 1, low: 0 },
      divergences: [
        {
          kind: 'population_drift',
          severity: 'high',
          description: 'Study N differs between Module 2 and Module 5.',
          draftValue: 'N=240',
          existingValue: 'N=312',
          existingArtifact: 'Module 5.3.5.1 CSR',
          existingCtdSection: '5.3.5.1',
        },
        {
          kind: 'numeric_divergence',
          severity: 'medium',
          description: 'Primary p-value differs.',
          draftValue: 'p=0.04',
          existingValue: 'p=0.03',
        },
      ],
    });
    expect(out?.verdict).toBe('needs_review');
    expect(out?.bySeverity.high).toBe(1);
    expect(out?.divergences).toHaveLength(2);
    expect(out?.divergences[0].kind).toBe('population_drift');
  });

  it('maps a blocker verdict with a critical divergence', () => {
    const out = mapConsistencyResult({
      verdict: 'blocker',
      artifactsCompared: 5,
      draftFactsExtracted: 30,
      divergenceCount: 1,
      bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
      divergences: [
        {
          kind: 'numeric_divergence',
          severity: 'critical',
          description: 'NOAEL conflicts between nonclinical and clinical sections.',
          draftValue: '100 mg/kg/day',
          existingValue: '50 mg/kg/day',
          existingArtifact: 'Module 2.6.6 Toxicology Summary',
          existingCtdSection: '2.6.6',
        },
      ],
    });
    expect(out?.verdict).toBe('blocker');
    expect(out?.bySeverity.critical).toBe(1);
    expect(out?.divergences[0].severity).toBe('critical');
  });
});

describe('mapConsistencyResult — divergence shape + defensiveness', () => {
  it('falls back divergenceCount to the surfaced divergences length when absent', () => {
    const out = mapConsistencyResult({
      verdict: 'minor_issues',
      divergences: [
        { kind: 'numeric_divergence', severity: 'low', description: 'x', draftValue: '1', existingValue: '2' },
      ],
    });
    expect(out?.divergenceCount).toBe(1);
  });

  it('coerces an unknown verdict to clean and unknown severity to medium', () => {
    const out = mapConsistencyResult({
      verdict: 'on_fire',
      divergences: [{ kind: 'mystery', severity: 'apocalyptic', draftValue: 'q' }],
    });
    expect(out?.verdict).toBe('clean');
    expect(out?.divergences[0].severity).toBe('medium');
    expect(out?.divergences[0].kind).toBe('mystery');
  });

  it('tolerates a missing bySeverity / garbage divergences array', () => {
    const out = mapConsistencyResult({ verdict: 'clean', divergences: 'nope' as unknown as [] });
    expect(out?.bySeverity).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    expect(out?.divergences).toEqual([]);
  });

  it('flags sample-derived drafts via isSample / is_sample', () => {
    expect(mapConsistencyResult({ verdict: 'needs_review', isSample: true })?.isSample).toBe(true);
    expect(mapConsistencyResult({ verdict: 'needs_review', is_sample: true })?.isSample).toBe(true);
    expect(mapConsistencyResult({ verdict: 'clean' })?.isSample).toBe(false);
  });

  it('returns null for an error envelope', () => {
    expect(mapConsistencyResult({ error: 'Consistency check failed: …' })).toBeNull();
  });

  it('returns null for null / non-object input', () => {
    expect(mapConsistencyResult(null)).toBeNull();
    expect(mapConsistencyResult(undefined)).toBeNull();
  });
});
