/**
 * CMS Coverage client — unit tests (fetch mocked; live API unreachable from CI).
 * Lock in endpoint selection, defensive envelope extraction, citeable MCD viewer
 * URLs, client-side keyword filtering, and graceful error propagation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  extractItems,
  buildViewerUrl,
  normalizeDoc,
  searchMedicareCoverage,
} from '../cms-coverage-client';

// Shape observed from the live CMS Coverage API (national-coverage-ncd report).
const NCD_ENVELOPE = {
  result: {
    count: 3,
    total: 12,
    items: [
      {
        document_id: 105,
        document_version: 2,
        document_display_id: '10.6',
        document_type: 'NCD',
        title: 'Anesthesia in Cardiac Pacemaker Surgery',
        last_updated: '08/16/2023',
        url: '/data/ncd?ncdid=105&ncdver=2',
      },
      {
        document_id: 62,
        document_version: 3,
        document_display_id: '20.25',
        document_type: 'NCD',
        title: 'Cardiac Catheterization Performed in Other than a Hospital Setting',
        last_updated: '12/03/2024',
        url: '/data/ncd?ncdid=62&ncdver=3',
      },
      {
        document_id: 999,
        document_version: 1,
        document_display_id: '30.1',
        document_type: 'NCD',
        title: 'Acupuncture',
        last_updated: '01/01/2020',
        url: '/data/ncd?ncdid=999&ncdver=1',
      },
    ],
  },
};

describe('cms-coverage-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CMS_COVERAGE_API_BASE_URL;
    vi.restoreAllMocks();
  });

  describe('extractItems', () => {
    it('finds items across envelope shapes', () => {
      expect(extractItems(NCD_ENVELOPE)).toHaveLength(3);
      expect(extractItems({ items: [{ a: 1 }] })).toHaveLength(1);
      expect(extractItems({ data: [{ a: 1 }, { b: 2 }] })).toHaveLength(2);
      expect(extractItems([{ a: 1 }])).toHaveLength(1);
      expect(extractItems({ nope: true })).toEqual([]);
      expect(extractItems(null)).toEqual([]);
    });
  });

  describe('buildViewerUrl', () => {
    it('builds NCD and LCD viewer URLs, and falls back without an id', () => {
      expect(buildViewerUrl('ncd', 105, 2)).toBe(
        'https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=105&ncdver=2'
      );
      expect(buildViewerUrl('lcd', 34567, 4)).toBe(
        'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=34567&ver=4'
      );
      expect(buildViewerUrl('ncd', '', undefined)).toBe(
        'https://www.cms.gov/medicare-coverage-database/search.aspx'
      );
    });
  });

  describe('normalizeDoc', () => {
    it('flattens a report item to a citeable doc', () => {
      const d = normalizeDoc(NCD_ENVELOPE.result.items[0], 'ncd');
      expect(d).toEqual({
        documentId: '10.6',
        title: 'Anesthesia in Cardiac Pacemaker Surgery',
        type: 'NCD',
        lastUpdated: '08/16/2023',
        url: 'https://www.cms.gov/medicare-coverage-database/view/ncd.aspx?ncdid=105&ncdver=2',
      });
    });
  });

  describe('searchMedicareCoverage', () => {
    it('hits the NCD endpoint and filters by keyword client-side', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => NCD_ENVELOPE }) as any;

      const result = await searchMedicareCoverage({ keyword: 'cardiac', type: 'ncd', limit: 10 });
      expect(result.type).toBe('ncd');
      expect(result.totalAvailable).toBe(3);
      expect(result.matched).toBe(2); // "Acupuncture" filtered out
      expect(result.documents.map(d => d.documentId)).toEqual(['10.6', '20.25']);

      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://api.coverage.cms.gov/v1/reports/national-coverage-ncd/');
      expect(calledUrl).toContain('keyword=cardiac');
    });

    it('uses the final-LCD endpoint for type=lcd and honors base-URL override', async () => {
      process.env.CMS_COVERAGE_API_BASE_URL = 'https://cms-proxy.internal/v1/';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: { items: [] } }),
      }) as any;

      await searchMedicareCoverage({ keyword: 'x', type: 'lcd' });
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl.startsWith('https://cms-proxy.internal/v1/reports/local-coverage-final-lcds')).toBe(true);
    });

    it('throws on a non-2xx response (caller degrades gracefully)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
      await expect(searchMedicareCoverage({ keyword: 'x' })).rejects.toThrow(/HTTP 500/);
    });
  });
});
