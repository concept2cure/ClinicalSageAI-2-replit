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
    expect(result.guidelines.length).toBeGreaterThanOrEqual(5);
    // Known entries should be present
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('E6(R3)');
    expect(codes).toContain('M11');
    expect(codes).toContain('Q12');
    expect(codes).toContain('Q14');
    expect(codes).toContain('E8(R1)');
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
    // M11 only: the "M4(R4), Step 2, 2025-06" entry was not M4(R4) at all.
    expect(result.guidelines.length).toBe(1);
    for (const g of result.guidelines) {
      expect(g.category).toBe('M');
    }
  });

  it('filters by since date', () => {
    const result = fetchIchGuidelineUpdates({ since: '2025-01' });
    expect(result.status).toBe('fetched');
    // E6(R3) (2025-01) and M11 (2025-11), not Q12 (2019-11)
    const codes = result.guidelines.map((g) => g.code);
    expect(codes).toContain('E6(R3)');
    expect(codes).toContain('M11');
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

  it('dates Q12 and Q14 at their Step 4, and carries no undated M4 revision', () => {
    // Q12 reached Step 4 in 2019 (as post-approval-knowledge.ts and
    // standards-registry.ts already say) and Q14 in November 2023; the list
    // said 2023-01 and 2024-01, so a correct 2019 citation of Q12 read stale.
    const byCode = new Map(fetchIchGuidelineUpdates().guidelines.map((g) => [g.code, g.stepDate]));
    expect(byCode.get('Q12')).toBe('2019-11');
    expect(byCode.get('Q14')).toBe('2023-11');
    expect(byCode.has('M4(R4)')).toBe(false);
    const [q12] = checkGuidanceFreshness({ citedGuidances: [{ title: 'ICH Q12', citedDate: '2019-11-20' }] }).results;
    expect(q12.current).toBe(true);
  });

  it('combines category and since filters', () => {
    const result = fetchIchGuidelineUpdates({ category: 'Q', since: '2023-06' });
    expect(result.status).toBe('fetched');
    // Q14 (2023-11) should match; Q12 (2019-11) should not
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
    // The LDT rule is void in the currency registry. A bare "LDT" names a
    // kind of test, not the rule, so the citation names the rule.
    const result = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'FDA LDT final rule (2024)' },
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

});

// Identified by a name a document cites it by — never by a retrieval keyword.
describe('checkGuidanceFreshness — names and keywords', () => {
  it.each(['IVD', 'MDR', 'IVDR', 'CTR', 'SaMD', '510(k)', 'De Novo', 'Real-world data', 'clinical trials'])(
    'does not identify "%s" — a retrieval keyword, not the name of a dated fact',
    (title) => {
      const [r] = checkGuidanceFreshness({ citedGuidances: [{ title, citedDate: '2014-07-28' }] }).results;
      expect(r.current).toBeNull();
      expect(r.basis).toBeUndefined();
    },
  );

  it('identifies a fact by a name it is cited by', () => {
    const [estar, ldt, ai] = checkGuidanceFreshness({
      asOf: '2026-10-01',
      citedGuidances: [
        { title: 'Electronic Submission Template for Medical Device 510(k) Submissions', citedDate: '2022-09-01' },
        { title: 'LDT final rule' },
        { title: 'Regulation (EU) 2024/1689 (AI Act)' },
      ],
    }).results;
    expect(estar).toMatchObject({ current: false, basis: { id: 'fda-estar-510k-mandatory' } });
    expect(ldt).toMatchObject({ current: false, basis: { id: 'us-ldt-final-rule-void' } });
    expect(ai.basis?.id).toBe('eu-ai-act-high-risk');
  });

  it('dates "ICH E6(R3) Annex 2" by Annex 2, not by the base guideline', () => {
    const [r] = checkGuidanceFreshness({
      citedGuidances: [{ title: 'ICH E6(R3) Annex 2', citedDate: '2025-03-01' }],
    }).results;
    expect(r.basis?.id).toBe('ich-e6r3-annex2-step4');
    expect(r.current).toBe(false);
  });

  it('does not call a title superseded when it also names what superseded it', () => {
    const [gcp, ctis, eudract] = checkGuidanceFreshness({
      citedGuidances: [
        { title: 'ICH E6(R3) Good Clinical Practice (replaces E6(R2))', citedDate: '2025-06-01' },
        { title: 'CTIS sponsor handbook: transition from EudraCT', citedDate: '2025-06-01' },
        { title: 'EudraCT' },
      ],
    }).results;
    expect(gcp).toMatchObject({ current: true, basis: { id: 'ich-e6r3-gcp-step4' } });
    expect(ctis).toMatchObject({ current: true, basis: { id: 'eu-ctis-only-trials' } });
    expect(eudract.current).toBe(false);
    expect(eudract.warning).toMatch(/superseded/);
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
