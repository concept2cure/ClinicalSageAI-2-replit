/**
 * Tests for the Guidance Ingestion Service.
 *
 *   1. fetchIchGuidelineUpdates — returns known guidelines, respects category filter
 *   2. checkGuidanceFreshness — flags stale or superseded guidance, and reports what it cannot identify as unverified
 *   3. fetchFdaGuidanceList — says no FDA guidance index is connected, and fetches nothing
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { REGULATORY_FACTS } from '../currency-registry.js';
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
    // A static list is not a fetch from ich.org; the label said it was.
    expect(result.source).toBe('curated_registry');
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

  it('dates M11 as the verified currency registry does', () => {
    // The list said Step 4 in 2024-11; the registry, verified against ICH's
    // own Step 4 document, says 2025-11-19.
    const m11 = fetchIchGuidelineUpdates().guidelines.find((g) => g.code === 'M11');
    const fact = REGULATORY_FACTS.find((f) => f.id === 'ich-m11-cesharp-step4');
    expect(fact).toBeDefined();
    expect(m11?.stepDate).toBe(fact!.effectiveDate.slice(0, 7));
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

  it('reports a guidance it cannot identify as unverified, never as current', () => {
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'Some Unknown Guidance XYZ-123' },
      ],
    });
    expect(result.status).toBe('checked');
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    // It used to answer `current: true` here ("conservatively assume current").
    expect(r.current).toBeNull();
    expect(r.verification).toBe('unverified');
    expect(r.basis).toBeUndefined();
    expect(r.warning).toMatch(/not identified/i);
  });

});

// A citation is identified by an identifier, never by a shared word.
describe('checkGuidanceFreshness — identification', () => {
  it('reports a superseded ICH revision as not current, naming its successor', () => {
    // The registry records E6(R3) as superseding E6(R2); the check never read it.
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'ICH E6(R2) Good Clinical Practice', citedDate: '2019-03-01' }],
    }).results;
    expect(r.current).toBe(false);
    expect(r.verification).toBe('identified');
    expect(r.warning).toMatch(/superseded/i);
    expect(r.warning).toMatch(/E6\(R3\)/);
    expect(r.basis?.id).toBe('ich-e6r3-gcp-step4');
  });

  it('does not read another ICH guideline as E6(R3) because both titles say "ICH"', () => {
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'ICH E9(R1) Statistical Principles for Clinical Trials', citedDate: '2021-01-01' }],
    }).results;
    expect(r.current).toBeNull();
    expect(r.verification).toBe('unverified');
    expect(r.latestKnownDate).toBeUndefined();
  });

  it('does not match a registry keyword found inside another word', () => {
    // "tr-ai-ning" used to match the EU AI Act fact's keyword "AI".
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'Guidance on training requirements for sponsors', citedDate: '2020-05-01' }],
    }).results;
    expect(r.current).toBeNull();
    expect(r.basis).toBeUndefined();
  });

  it('does not date a 510(k) guidance by the eSTAR mandate because both mention 510(k)', () => {
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{
        title: 'Deciding When to Submit a 510(k) for a Change to an Existing Device',
        citedDate: '2017-10-25',
      }],
    }).results;
    expect(r.current).toBeNull();
    expect(r.warning ?? '').not.toMatch(/2023-10-01/);
  });

  it('refuses to identify a fact from another jurisdiction than the one cited', () => {
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'EUDAMED', jurisdiction: 'US' }],
    }).results;
    expect(r.current).toBeNull();
  });

  it('names the registry entry and source every identified verdict rests on', () => {
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'E6(R3)', citedDate: '2026-01-01' }],
    }).results;
    expect(r.verification).toBe('identified');
    expect(r.basis).toMatchObject({ registry: 'currency_registry', id: 'ich-e6r3-gcp-step4' });
    expect(r.basis?.sourceUrl).toMatch(/^https:\/\//);
    expect(r.basis?.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  // It queried openFDA's chemical-substance endpoint and returned each
  // substance as an FDA guidance (`title: r.substance_name`), with the
  // caller's status filter echoed into every record. No FDA guidance index is
  // connected (plan open decision 11), so it says so and fetches nothing.
  it('says no FDA guidance index is connected, and makes no request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ substance_name: 'ACETAMINOPHEN', status: 'final' }] }),
    });
    globalThis.fetch = fetchMock;

    const result = await fetchFdaGuidanceList({ topic: 'biomarker', status: 'final', limit: 5 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('unavailable');
    expect(result.message).toMatch(/no FDA guidance index is connected/i);
    expect(JSON.stringify(result)).not.toMatch(/ACETAMINOPHEN|guidances/);
  });

  it('never throws', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      throw new TypeError('fetch is not defined');
    });
    await expect(fetchFdaGuidanceList()).resolves.toMatchObject({ status: 'unavailable' });
  });
});
