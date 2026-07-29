/**
 * Tests for contradiction-watch — the pure surfacing of unresolved
 * contradiction-engine findings (sort, summarize, render). No DB/IO.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchFindings = vi.fn();
vi.mock('../../contradiction-engine-service.js', () => ({
  contradictionEngineService: { searchFindings: (...args: unknown[]) => searchFindings(...args) },
}));

import {
  sortContradictionsBySeverity,
  summarizeContradictions,
  buildContradictionWatchBlock,
  getOpenContradictionsForOrg,
  type OpenContradiction,
} from '../contradiction-watch.js';

function finding(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    title: 'F',
    severity: 'high',
    contradictionType: 'assumption_drift',
    authorityState: 'requires_review',
    projectId: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    reviewState: 'unresolved',
    ...over,
  };
}

function c(
  severity: OpenContradiction['severity'],
  over: Partial<OpenContradiction> = {}
): OpenContradiction {
  return {
    id: over.id ?? `f-${severity}`,
    title: over.title ?? `Finding ${severity}`,
    severity,
    contradictionType: over.contradictionType ?? 'assumption_drift',
    authorityState: over.authorityState ?? 'requires_review',
    projectId: over.projectId ?? 1,
    createdAt: over.createdAt ?? '2026-06-01T00:00:00.000Z',
    blocksPromotion: over.blocksPromotion ?? false,
  };
}

describe('sortContradictionsBySeverity', () => {
  it('orders critical → low, then newest first within a severity', () => {
    const sorted = sortContradictionsBySeverity([
      c('low'),
      c('critical', { id: 'crit-old', createdAt: '2026-01-01T00:00:00.000Z' }),
      c('high'),
      c('critical', { id: 'crit-new', createdAt: '2026-06-10T00:00:00.000Z' }),
    ]);
    expect(sorted.map(x => x.id)).toEqual(['crit-new', 'crit-old', 'f-high', 'f-low']);
  });
});

describe('summarizeContradictions', () => {
  it('counts by severity and how many block promotion', () => {
    const s = summarizeContradictions([
      c('critical', { authorityState: 'blocks_promotion', blocksPromotion: true }),
      c('high'),
      c('high'),
      c('low'),
    ]);
    expect(s).toEqual({ critical: 1, high: 2, medium: 0, low: 1, blocksPromotion: 1, total: 4 });
  });
});

describe('buildContradictionWatchBlock', () => {
  it('returns empty string when there are no contradictions', () => {
    expect(buildContradictionWatchBlock([])).toBe('');
  });

  it('flags blocks-promotion findings and caps the list', () => {
    const items = [
      c('critical', { title: 'M2.5 vs M5 ORR', authorityState: 'blocks_promotion', blocksPromotion: true }),
      ...Array.from({ length: 10 }, (_, i) => c('medium', { id: `m${i}`, title: `Drift ${i}` })),
    ];
    const block = buildContradictionWatchBlock(items, { maxItems: 3 });
    expect(block).toContain('<open_contradictions');
    expect(block).toContain('BLOCKS PROMOTION');
    expect(block).toContain('(1 block promotion)');
    // open tag + counts line + 3 capped items + closing tag = 6 lines
    expect(block.split('\n').length).toBe(6);
  });
});

describe('getOpenContradictionsForOrg', () => {
  beforeEach(() => searchFindings.mockReset());

  it('excludes closed (approved_resolution / superseded) findings and maps blocksPromotion', async () => {
    searchFindings.mockResolvedValue([
      finding({ id: 'open-unresolved', reviewState: 'unresolved' }),
      finding({ id: 'open-under-review', reviewState: 'under_review' }),
      finding({ id: 'open-reviewed', reviewState: 'reviewed' }),
      finding({ id: 'closed-approved', reviewState: 'approved_resolution' }),
      finding({ id: 'closed-superseded', reviewState: 'superseded' }),
      finding({ id: 'blocker', authorityState: 'blocks_promotion', severity: 'critical' }),
    ]);
    const open = await getOpenContradictionsForOrg(7);
    const ids = open.map(o => o.id);
    expect(ids).toContain('open-unresolved');
    expect(ids).toContain('open-under-review');
    expect(ids).toContain('open-reviewed');
    expect(ids).not.toContain('closed-approved');
    expect(ids).not.toContain('closed-superseded');
    expect(open.find(o => o.id === 'blocker')?.blocksPromotion).toBe(true);
    // org-scoped, no single review-state equality filter (we filter in-process)
    expect(searchFindings).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 7 })
    );
    expect(searchFindings.mock.calls[0][0].reviewState).toBeUndefined();
  });

  it('respects the cap after filtering', async () => {
    searchFindings.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => finding({ id: `o${i}`, reviewState: 'unresolved' }))
    );
    const open = await getOpenContradictionsForOrg(2, 3);
    expect(open.length).toBe(3);
  });

  it('is resilient — returns [] on a malformed / failed engine response', async () => {
    // A missing table or transport error surfaces as a rejected/!array result;
    // the watch must never propagate it (it would otherwise break the digest).
    searchFindings.mockResolvedValue(null);
    expect(await getOpenContradictionsForOrg(1)).toEqual([]);
  });
});
