/**
 * ICD-10-CM client — unit tests (fetch mocked).
 * Locks in the Clinical Tables array-shape parsing, request construction,
 * base-URL override, and error propagation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseClinicalTables, lookupIcd10 } from '../icd10-client';

describe('parseClinicalTables', () => {
  it('parses the [total, codes, _, display] shape', () => {
    const data = [3, ['E11.9', 'E11.65'], null, [['E11.9', 'Type 2 diabetes mellitus without complications'], ['E11.65', 'Type 2 diabetes mellitus with hyperglycemia']]];
    const { total, codes } = parseClinicalTables(data);
    expect(total).toBe(3);
    expect(codes).toEqual([
      { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
      { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia' },
    ]);
  });

  it('falls back to the code list when display is empty, and is defensive on junk', () => {
    expect(parseClinicalTables([2, ['A00', 'A01'], null, []]).codes.map(c => c.code)).toEqual(['A00', 'A01']);
    expect(parseClinicalTables(null)).toEqual({ total: 0, codes: [] });
    expect(parseClinicalTables({})).toEqual({ total: 0, codes: [] });
  });
});

describe('lookupIcd10', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ICD10_API_BASE_URL;
    vi.restoreAllMocks();
  });

  it('queries the search endpoint and returns normalized codes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [1, ['E11.9'], null, [['E11.9', 'Type 2 diabetes mellitus without complications']]],
    }) as any;

    const r = await lookupIcd10('type 2 diabetes', 5);
    expect(r.source).toBe('NLM ICD-10-CM (Clinical Tables)');
    expect(r.total).toBe(1);
    expect(r.codes[0]).toEqual({ code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' });

    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?');
    expect(url).toContain('terms=type+2+diabetes'); // URLSearchParams encodes spaces as '+'
    expect(url).toContain('maxList=5');
  });

  it('honors ICD10_API_BASE_URL override and throws on HTTP error', async () => {
    process.env.ICD10_API_BASE_URL = 'https://icd-proxy.internal/v3/';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as any;
    await expect(lookupIcd10('x')).rejects.toThrow(/HTTP 500/);
    expect((fetchMock.mock.calls[0][0] as string).startsWith('https://icd-proxy.internal/v3/search?')).toBe(true);
  });
});
