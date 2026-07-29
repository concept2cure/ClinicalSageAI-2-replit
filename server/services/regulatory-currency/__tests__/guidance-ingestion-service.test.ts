/**
 * Tests for the Guidance Ingestion Service.
 *
 *   1. fetchIchGuidelineUpdates — returns known guidelines, respects category filter
 *   2. checkGuidanceFreshness — flags stale guidance, marks current as current
 *   3. fetchFdaGuidanceList — returns unavailable on network failure (mock fetch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchIchGuidelineUpdates,
  checkGuidanceFreshness,
  fetchFdaGuidanceList,
} from '../guidance-ingestion-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// fetchIchGuidelineUpdates
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchIchGuidelineUpdates', () => {
  it('returns all known ICH guidelines when no filters are provided', () => {
    const result = fetchIchGuidelineUpdates();
    expect(result.status).toBe('fetched');
    expect(result.source).toBe('ich.org');
    expect(result.guidelines.length).toBeGreaterThanOrEqual(6);
    // Known entries should be present
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('E6(R3)');
    expect(codes).toContain('M11');
    expect(codes).toContain('Q12');
    expect(codes).toContain('Q14');
    expect(codes).toContain('E8(R1)');
    expect(codes).toContain('M4(R4)');
  });

  it('filters by category Q', () => {
    const result = fetchIchGuidelineUpdates({ category: 'Q' });
    expect(result.status).toBe('fetched');
    expect(result.guidelines.length).toBe(2);
    for (const g of result.guidelines) {
      expect(g.category).toBe('Q');
    }
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('Q12');
    expect(codes).toContain('Q14');
  });

  it('filters by category E', () => {
    const result = fetchIchGuidelineUpdates({ category: 'E' });
    expect(result.status).toBe('fetched');
    expect(result.guidelines.length).toBe(2);
    for (const g of result.guidelines) {
      expect(g.category).toBe('E');
    }
  });

  it('filters by category M', () => {
    const result = fetchIchGuidelineUpdates({ category: 'M' });
    expect(result.status).toBe('fetched');
    expect(result.guidelines.length).toBe(2);
    for (const g of result.guidelines) {
      expect(g.category).toBe('M');
    }
  });

  it('filters by since date', () => {
    const result = fetchIchGuidelineUpdates({ since: '2025-01' });
    expect(result.status).toBe('fetched');
    // Should include E6(R3) (2025-01), M4(R4) (2025-06), but not Q12 (2023-01)
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('E6(R3)');
    expect(codes).toContain('M4(R4)');
    expect(codes).not.toContain('Q12');
    expect(codes).not.toContain('E8(R1)');
  });

  it('combines category and since filters', () => {
    const result = fetchIchGuidelineUpdates({ category: 'Q', since: '2024-01' });
    expect(result.status).toBe('fetched');
    // Q14 (2024-01) should match; Q12 (2023-01) should not
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('Q14');
    expect(codes).not.toContain('Q12');
  });

  it('returns empty when category has no results', () => {
    const result = fetchIchGuidelineUpdates({ category: 'S' });
    expect(result.status).toBe('fetched');
    expect(result.guidelines).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkGuidanceFreshness
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGuidanceFreshness', () => {
  it('flags stale guidance when citedDate predates effectiveDate', () => {
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'E6(R3)', citedDate: '2024-01-01' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.current).toBe(false);
    expect(r.warning).toBeDefined();
  });

  it('marks current guidance as current', () => {
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'E6(R3)', citedDate: '2026-01-01' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.current).toBe(true);
  });

  it('flags void guidance from the currency registry', () => {
    // The LDT rule is void in the currency registry
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'LDT' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    // LDT rule has status 'void', so current should be false
    expect(r.current).toBe(false);
    expect(r.warning).toBeDefined();
    expect(r.warning).toMatch(/void/i);
  });

  it('handles unknown guidances gracefully', () => {
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'Some Unknown Guidance XYZ-123' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    // Conservatively assumes current when not found, but warns
    expect(r.current).toBe(true);
    expect(r.warning).toMatch(/not found/i);
  });

  it('throws when citedGuidances is missing', () => {
    expect(() =>
      checkGuidanceFreshness({ citedGuidances: [] }),
    ).toThrow('citedGuidances is required');
  });

  it('checks multiple guidances at once', () => {
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'E6(R3)', citedDate: '2026-01-01' },
        { title: 'LDT' },
        { title: 'EUDAMED' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchFdaGuidanceList
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchFdaGuidanceList', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns unavailable on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await fetchFdaGuidanceList({ topic: 'biomarker' });
    expect(result.status).toBe('unavailable');
    expect((result as any).message).toMatch(/Network error/);
  });

  it('returns unavailable on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    const result = await fetchFdaGuidanceList({ topic: 'biomarker' });
    expect(result.status).toBe('unavailable');
    expect((result as any).message).toMatch(/500/);
  });

  it('returns fetched data on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            substance_name: 'Test Guidance',
            issue_date: '2024-06-01',
            category: 'biomarker',
            url: 'https://fda.gov/test',
            status: 'final',
          },
        ],
      }),
    });

    const result = await fetchFdaGuidanceList({ topic: 'biomarker', limit: 5 });
    expect(result.status).toBe('fetched');
    if (result.status === 'fetched') {
      expect(result.source).toBe('fda.gov');
      expect(result.fetchedAt).toBeDefined();
      expect(result.guidances).toHaveLength(1);
      expect(result.guidances[0].title).toBe('Test Guidance');
    }
  });

  it('never throws even on unexpected errors', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      throw new TypeError('fetch is not defined');
    });
    const result = await fetchFdaGuidanceList();
    expect(result.status).toBe('unavailable');
  });

  it('passes an abort timeout signal to fetch so a hung upstream cannot stall the worker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    globalThis.fetch = fetchMock;

    await fetchFdaGuidanceList({ topic: 'biomarker' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  it('maps a timed-out request to unavailable with a timeout message', async () => {
    const timeoutErr = new Error('The operation was aborted due to timeout');
    timeoutErr.name = 'TimeoutError';
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutErr);

    const result = await fetchFdaGuidanceList({ topic: 'biomarker' });
    expect(result.status).toBe('unavailable');
    expect((result as any).message).toMatch(/timed out after 30000ms/);
  });
});
