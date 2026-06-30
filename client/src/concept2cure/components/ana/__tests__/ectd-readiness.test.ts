/**
 * Unit tests for aggregateReadiness — the E10 readiness-gate honesty kernel.
 *
 * Covers the contract:
 *   - clean structural + clean consistency (non-sample) → ready + sealable.
 *   - any blocker (structural failure OR non-clean consistency) → blocked,
 *     not sealable, with the blocking items enumerated.
 *   - missing inputs → not_assessed, never sealable.
 *   - sample assembly → not_assessed, never sealable (sample data cannot
 *     certify a real submission), regardless of the check results.
 */
import { describe, it, expect } from 'vitest';
import { aggregateReadiness } from '../ectdReadiness';
import {
  SAMPLE_ASSEMBLED_M2_5,
  SAMPLE_STRUCTURAL_OK,
  SAMPLE_STRUCTURAL_FAIL,
  SAMPLE_CONSISTENCY_CLEAN,
  SAMPLE_CONSISTENCY_BLOCKER,
} from '../ectdReadinessFixtures';

// A non-sample assembly so the "ready/sealable" path is reachable.
const liveAssembled = { ...SAMPLE_ASSEMBLED_M2_5, sample: false };

describe('aggregateReadiness', () => {
  it('clean + clean (non-sample) → ready, sealable, no blockers', () => {
    const gate = aggregateReadiness({
      assembled: liveAssembled,
      structural: SAMPLE_STRUCTURAL_OK,
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(gate.gate).toBe('ready');
    expect(gate.sealable).toBe(true);
    expect(gate.blockingItems).toHaveLength(0);
    expect(gate.structuralOk).toBe(true);
    expect(gate.consistencyVerdict).toBe('clean');
    expect(gate.summary).toContain('ready');
  });

  it('structural failure → blocked, not sealable, lists structural items', () => {
    const gate = aggregateReadiness({
      assembled: liveAssembled,
      structural: SAMPLE_STRUCTURAL_FAIL,
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(gate.gate).toBe('blocked');
    expect(gate.sealable).toBe(false);
    expect(gate.blockingItems.length).toBeGreaterThan(0);
    expect(gate.blockingItems.every(b => b.source === 'structural')).toBe(true);
    // The missing part is surfaced with an output-path deep link.
    const missing = gate.blockingItems.find(b => b.id.startsWith('structural-missing'));
    expect(missing?.label).toContain('word/styles.xml');
    expect(missing?.deepLink?.kind).toBe('output_path');
  });

  it('non-clean consistency → blocked, not sealable, lists divergences with CTD deep links', () => {
    const gate = aggregateReadiness({
      assembled: liveAssembled,
      structural: SAMPLE_STRUCTURAL_OK,
      consistency: SAMPLE_CONSISTENCY_BLOCKER,
    });
    expect(gate.gate).toBe('blocked');
    expect(gate.sealable).toBe(false);
    const consistencyItems = gate.blockingItems.filter(b => b.source === 'consistency');
    expect(consistencyItems.length).toBe(2);
    // The critical sample-size mismatch sorts first and deep-links to §5.3.5.1.
    expect(gate.blockingItems[0].severity).toBe('critical');
    expect(gate.blockingItems[0].deepLink?.kind).toBe('ctd_section');
    expect(gate.blockingItems[0].deepLink?.target).toBe('5.3.5.1');
    expect(gate.blockingItems[0].label).toContain('486');
    expect(gate.blockingItems[0].label).toContain('512');
  });

  it('orders blockers highest-severity first across both sources', () => {
    const gate = aggregateReadiness({
      assembled: liveAssembled,
      structural: SAMPLE_STRUCTURAL_FAIL, // critical + high
      consistency: SAMPLE_CONSISTENCY_BLOCKER, // critical + high
    });
    const ranks = gate.blockingItems.map(b => b.severity);
    // Every critical precedes every high.
    const lastCritical = ranks.lastIndexOf('critical');
    const firstHigh = ranks.indexOf('high');
    expect(firstHigh === -1 || lastCritical < firstHigh).toBe(true);
  });

  it('missing structural OR consistency input → not_assessed, never sealable', () => {
    const noStructural = aggregateReadiness({
      assembled: liveAssembled,
      structural: null,
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(noStructural.gate).toBe('not_assessed');
    expect(noStructural.sealable).toBe(false);

    const noConsistency = aggregateReadiness({
      assembled: liveAssembled,
      structural: SAMPLE_STRUCTURAL_OK,
      consistency: undefined,
    });
    expect(noConsistency.gate).toBe('not_assessed');
    expect(noConsistency.sealable).toBe(false);

    const noAssembly = aggregateReadiness({
      assembled: null,
      structural: SAMPLE_STRUCTURAL_OK,
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(noAssembly.gate).toBe('not_assessed');
    expect(noAssembly.sealable).toBe(false);
  });

  it('honesty guard: a sample assembly is never sealable even when both checks are clean', () => {
    const gate = aggregateReadiness({
      assembled: SAMPLE_ASSEMBLED_M2_5, // sample: true
      structural: SAMPLE_STRUCTURAL_OK,
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(gate.gate).toBe('not_assessed');
    expect(gate.sealable).toBe(false);
    expect(gate.summary.toLowerCase()).toContain('sample');
  });

  it('a non-clean verdict can never produce sealable=true', () => {
    for (const consistency of [SAMPLE_CONSISTENCY_BLOCKER]) {
      for (const structural of [SAMPLE_STRUCTURAL_OK, SAMPLE_STRUCTURAL_FAIL]) {
        const gate = aggregateReadiness({ assembled: liveAssembled, structural, consistency });
        expect(gate.sealable).toBe(false);
      }
    }
  });

  it('flags a not-ok structural report even with no enumerated specifics', () => {
    const gate = aggregateReadiness({
      assembled: liveAssembled,
      structural: { ok: false },
      consistency: SAMPLE_CONSISTENCY_CLEAN,
    });
    expect(gate.gate).toBe('blocked');
    expect(gate.blockingItems.some(b => b.id === 'structural-invalid')).toBe(true);
  });
});
