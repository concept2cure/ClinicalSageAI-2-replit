/**
 * Device recall search — unit tests (openFDA fetcher injected).
 * Verifies search-expression construction, normalization + summarization via the
 * underlying post-market module, and the no-term short-circuit.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildDeviceRecallSearch, searchDeviceRecalls } from '../device-recalls';

describe('device-recalls', () => {
  describe('buildDeviceRecallSearch', () => {
    it('prefers device name / query (product_description), else firm', () => {
      expect(buildDeviceRecallSearch({ deviceName: 'infusion pump' })).toBe('product_description:"infusion pump"');
      expect(buildDeviceRecallSearch({ query: 'glucose meter' })).toBe('product_description:"glucose meter"');
      expect(buildDeviceRecallSearch({ manufacturer: 'Acme Medical' })).toBe('recalling_firm:"Acme Medical"');
      expect(buildDeviceRecallSearch({})).toBe('');
    });
  });

  describe('searchDeviceRecalls', () => {
    it('fetches, normalizes, and summarizes recalls by classification', async () => {
      const fetcher = vi.fn().mockResolvedValue({
        json: async () => ({
          results: [
            { recall_number: 'Z-1', classification: 'Class I', reason_for_recall: 'overdose risk', status: 'Ongoing', recalling_firm: 'Acme' },
            { recall_number: 'Z-2', classification: 'Class II', reason_for_recall: 'labeling', status: 'Terminated', recalling_firm: 'Acme' },
          ],
        }),
      });
      const res = await searchDeviceRecalls({ deviceName: 'pump', limit: 10 }, { fetcher });

      expect(res.searchExpression).toBe('product_description:"pump"');
      expect(res.summary.total).toBe(2);
      expect(res.summary.classICount).toBe(1);
      expect(res.recalls.map(r => r.recallNumber)).toEqual(['Z-1', 'Z-2']);
      // The underlying module builds the openFDA device/recall URL.
      expect(fetcher.mock.calls[0][0]).toContain('/device/recall.json');
    });

    it('short-circuits (no fetch) when no usable term is given', async () => {
      const fetcher = vi.fn();
      const res = await searchDeviceRecalls({}, { fetcher });
      expect(fetcher).not.toHaveBeenCalled();
      expect(res.searchExpression).toBe('');
      expect(res.summary.total).toBe(0);
      expect(res.recalls).toEqual([]);
    });
  });
});
