/**
 * Special-designation advisor — unit tests. Deterministic; verifies designation
 * resolution (incl. alias), the clinical-evidence distinction for Breakthrough,
 * jurisdiction filtering, and catalog.
 */
import { describe, it, expect } from 'vitest';
import { adviseSpecialDesignation, listDesignations } from '../special-designations';

describe('adviseSpecialDesignation', () => {
  it('resolves Breakthrough Therapy and notes the clinical-evidence requirement', () => {
    const r = adviseSpecialDesignation({ designation: 'breakthrough' });
    expect(r.resolved.designation).toBe('breakthrough');
    expect(r.brief.toLowerCase()).toContain('preliminary clinical');
    expect(r.brief).toContain('Common pitfalls');
  });

  it('resolves Accelerated Approval and flags the confirmatory-trial obligation', () => {
    const r = adviseSpecialDesignation({ designation: 'accelerated_approval' });
    expect(r.resolved.designation).toBe('accelerated_approval');
    expect(r.brief.toLowerCase()).toContain('confirmatory');
    expect(r.brief.toLowerCase()).toContain('surrogate');
  });

  it('filters candidates to EU designations', () => {
    const r = adviseSpecialDesignation({ jurisdiction: 'eu' });
    const ids = r.candidates.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['prime', 'conditional_ma', 'orphan_eu']));
    expect(ids).not.toContain('fast_track');
  });

  it('maps jurisdiction synonyms (fda → us)', () => {
    const r = adviseSpecialDesignation({ jurisdiction: 'fda' });
    expect(r.resolved.jurisdiction).toBe('us');
    expect(r.candidates.every(c => c.jurisdiction === 'us')).toBe(true);
  });

  it('resolves orphan alias to the US orphan record', () => {
    const r = adviseSpecialDesignation({ designation: 'orphan drug' });
    expect(r.resolved.designation).toBe('orphan_us');
    expect(r.brief).toContain('200,000');
  });

  it('lists FDA and EMA designations', () => {
    const ids = listDesignations().map(d => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(['fast_track', 'breakthrough', 'priority_review', 'prime', 'accelerated_assessment']),
    );
  });
});
