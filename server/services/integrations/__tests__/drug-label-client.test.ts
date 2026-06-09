/**
 * openFDA drug label client — unit tests (fetch mocked).
 * Verifies single-clause search construction, SPL normalization + section
 * capping, total extraction, the empty-on-404 behavior, and base-URL override.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildDrugLabelSearch, normalizeLabel, searchDrugLabels } from '../drug-label-client';

describe('drug-label-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.OPENFDA_API_BASE_URL;
    delete process.env.OPENFDA_API_KEY;
    vi.restoreAllMocks();
  });

  describe('buildDrugLabelSearch', () => {
    it('prefers brand/query, else generic, else empty', () => {
      expect(buildDrugLabelSearch({ brandName: 'Keytruda' })).toBe('openfda.brand_name:"Keytruda"');
      expect(buildDrugLabelSearch({ query: 'Humira' })).toBe('openfda.brand_name:"Humira"');
      expect(buildDrugLabelSearch({ genericName: 'pembrolizumab' })).toBe('openfda.generic_name:"pembrolizumab"');
      expect(buildDrugLabelSearch({})).toBe('');
    });
  });

  describe('normalizeLabel', () => {
    it('flattens openFDA SPL arrays and caps long sections', () => {
      const longText = 'x'.repeat(2000);
      const label = normalizeLabel({
        id: 'spl-1',
        openfda: { brand_name: ['Keytruda'], generic_name: ['pembrolizumab'], manufacturer_name: ['Merck'] },
        indications_and_usage: [longText],
        boxed_warning: ['Severe immune-mediated reactions'],
        dosage_and_administration: ['200 mg every 3 weeks'],
      });
      expect(label.brandName).toBe('Keytruda');
      expect(label.genericName).toBe('pembrolizumab');
      expect(label.manufacturer).toBe('Merck');
      expect(label.warnings).toBe('Severe immune-mediated reactions');
      expect(label.dosage).toBe('200 mg every 3 weeks');
      expect(label.indications.endsWith('…')).toBe(true);
      expect(label.indications.length).toBeLessThan(longText.length);
    });
  });

  describe('searchDrugLabels', () => {
    it('queries drug/label.json and normalizes results + total', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          meta: { results: { total: 7 } },
          results: [{ openfda: { brand_name: ['Keytruda'] }, indications_and_usage: ['melanoma'] }],
        }),
      }) as any;

      const res = await searchDrugLabels({ brandName: 'Keytruda', limit: 3 });
      expect(res.total).toBe(7);
      expect(res.labels[0].brandName).toBe('Keytruda');
      expect(res.labels[0].indications).toBe('melanoma');
      const url = (global.fetch as any).mock.calls[0][0] as string;
      expect(url).toContain('https://api.fda.gov/drug/label.json?');
      expect(decodeURIComponent(url)).toContain('openfda.brand_name:"Keytruda"');
    });

    it('treats a 404 as empty (zero matches), honors base-URL override', async () => {
      process.env.OPENFDA_API_BASE_URL = 'https://openfda-proxy.internal/';
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
      const res = await searchDrugLabels({ query: 'nonexistent' });
      expect(res.total).toBe(0);
      expect(res.labels).toEqual([]);
      expect((global.fetch as any).mock.calls[0][0]).toContain('https://openfda-proxy.internal/drug/label.json');
    });

    it('short-circuits with no term, and throws on non-404 HTTP error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as any;
      const empty = await searchDrugLabels({});
      expect(empty.searchExpression).toBe('');
      expect(fetchMock).not.toHaveBeenCalled();

      await expect(searchDrugLabels({ brandName: 'X' })).rejects.toThrow(/HTTP 500/);
    });
  });
});
