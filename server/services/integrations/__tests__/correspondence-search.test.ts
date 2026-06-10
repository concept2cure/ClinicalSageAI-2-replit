/**
 * Regulatory-correspondence search — unit tests.
 * Gmail is injected, so this verifies the configured-gate, keyword filtering,
 * normalization (date → ISO), and limit handling without the Gmail client/DB.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  searchRegulatoryCorrespondence,
  type CorrespondenceDeps,
} from '../correspondence-search';

const MESSAGES = [
  { id: '1', threadId: 't1', subject: 'FDA Information Request — Module 2.5', from: 'reviewer@fda.gov', to: 'us@co.com', date: new Date('2026-05-01T10:00:00Z'), snippet: 'Please clarify the endpoint', body: 'deficiency details' },
  { id: '2', threadId: 't2', subject: 'Newsletter', from: 'news@vendor.com', to: 'us@co.com', date: new Date('2026-05-02T10:00:00Z'), snippet: 'monthly update', body: 'marketing' },
];

function makeDeps(over: Partial<CorrespondenceDeps> = {}): CorrespondenceDeps {
  return {
    isConfigured: () => true,
    fetchRecent: vi.fn().mockResolvedValue(MESSAGES),
    ...over,
  };
}

describe('searchRegulatoryCorrespondence', () => {
  it('returns a not-configured note (without calling Gmail) when unconfigured', async () => {
    const fetchRecent = vi.fn();
    const res = await searchRegulatoryCorrespondence({}, { isConfigured: () => false, fetchRecent });
    expect(res.configured).toBe(false);
    expect(res.messages).toEqual([]);
    expect(res.note).toMatch(/not connected/i);
    expect(fetchRecent).not.toHaveBeenCalled();
  });

  it('filters by keyword across subject/sender/snippet/body and normalizes dates', async () => {
    const deps = makeDeps();
    const res = await searchRegulatoryCorrespondence({ query: 'fda' }, deps);
    expect(res.configured).toBe(true);
    expect(res.resultCount).toBe(1);
    expect(res.messages[0].subject).toContain('FDA Information Request');
    expect(res.messages[0].date).toBe('2026-05-01T10:00:00.000Z');
    expect((res.messages[0] as any).body).toBeUndefined(); // body stripped for compactness
  });

  it('returns the most recent (up to limit) when no keyword is given', async () => {
    const deps = makeDeps();
    const res = await searchRegulatoryCorrespondence({ limit: 1 }, deps);
    expect(deps.fetchRecent).toHaveBeenCalledWith(1); // no-keyword window == limit
    expect(res.messages).toHaveLength(1);
  });

  it('widens the fetch window when filtering, then caps to limit', async () => {
    const deps = makeDeps();
    await searchRegulatoryCorrespondence({ query: 'x', limit: 5 }, deps);
    // window = max(limit*2, 12) = 12
    expect(deps.fetchRecent).toHaveBeenCalledWith(12);
  });
});
