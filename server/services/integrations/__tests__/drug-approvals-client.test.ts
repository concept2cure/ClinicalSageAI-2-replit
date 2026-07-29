/**
 * Drugs@FDA approvals client — unit tests (fetch mocked).
 * Verifies single-clause search precedence, submission/approval normalization
 * (date formatting, AP-status counting, latest date), 404-as-empty, base-URL
 * override, and the no-term short-circuit.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildDrugApprovalSearch,
  normalizeApproval,
  searchDrugApprovals,
} from '../drug-approvals-client';

describe('drug-approvals-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.OPENFDA_API_BASE_URL;
    delete process.env.OPENFDA_API_KEY;
    vi.restoreAllMocks();
  });

  describe('buildDrugApprovalSearch', () => {
    it('uses application number, then brand/query, then generic', () => {
      expect(buildDrugApprovalSearch({ applicationNumber: 'BLA125514' })).toBe('application_number:"BLA125514"');
      expect(buildDrugApprovalSearch({ brandName: 'Keytruda' })).toBe('products.brand_name:"Keytruda"');
      expect(buildDrugApprovalSearch({ query: 'Humira' })).toBe('products.brand_name:"Humira"');
      expect(buildDrugApprovalSearch({ genericName: 'pembrolizumab' })).toBe('openfda.generic_name:"pembrolizumab"');
      expect(buildDrugApprovalSearch({})).toBe('');
    });
  });

  describe('normalizeApproval', () => {
    it('summarizes submissions (AP count, latest date) and names', () => {
      const a = normalizeApproval({
        application_number: 'BLA125514',
        sponsor_name: 'MERCK',
        openfda: { brand_name: ['KEYTRUDA'], generic_name: ['pembrolizumab', 'pembrolizumab'] },
        products: [{ brand_name: 'KEYTRUDA', marketing_status: 'Prescription' }],
        submissions: [
          { submission_status: 'AP', submission_status_date: '20140904' },
          { submission_status: 'AP', submission_status_date: '20170511' },
          { submission_status: 'TA', submission_status_date: '20160101' },
        ],
      });
      expect(a.applicationNumber).toBe('BLA125514');
      expect(a.sponsor).toBe('MERCK');
      expect(a.brandNames).toEqual(['KEYTRUDA']);
      expect(a.genericNames).toEqual(['pembrolizumab']); // de-duped
      expect(a.marketingStatus).toBe('Prescription');
      expect(a.approvalCount).toBe(2); // only AP submissions
      expect(a.latestApprovalDate).toBe('2017-05-11'); // formatted + latest
    });
  });

  describe('searchDrugApprovals', () => {
    it('queries drugsfda.json and normalizes results + total', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          meta: { results: { total: 1 } },
          results: [{ application_number: 'NDA021', sponsor_name: 'ACME', submissions: [] }],
        }),
      }) as any;
      const res = await searchDrugApprovals({ brandName: 'Acme Drug' });
      expect(res.total).toBe(1);
      expect(res.approvals[0].applicationNumber).toBe('NDA021');
      expect((global.fetch as any).mock.calls[0][0]).toContain('https://api.fda.gov/drug/drugsfda.json?');
    });

    it('treats 404 as empty and honors base-URL override', async () => {
      process.env.OPENFDA_API_BASE_URL = 'https://openfda-proxy.internal/';
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
      const res = await searchDrugApprovals({ query: 'nope' });
      expect(res.total).toBe(0);
      expect(res.approvals).toEqual([]);
      expect((global.fetch as any).mock.calls[0][0]).toContain('https://openfda-proxy.internal/drug/drugsfda.json');
    });

    it('short-circuits with no term and throws on non-404 HTTP error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as any;
      expect((await searchDrugApprovals({})).searchExpression).toBe('');
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(searchDrugApprovals({ brandName: 'X' })).rejects.toThrow(/HTTP 500/);
    });
  });
});
