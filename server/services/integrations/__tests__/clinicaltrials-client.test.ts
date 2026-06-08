/**
 * ClinicalTrials.gov client — unit tests.
 *
 * The live API is unreachable from CI egress, so fetch is mocked. These lock in
 * the query construction (structured filters → v2 params), defensive
 * normalization, base-URL override, and error propagation that AnA's
 * search_clinical_evidence handler relies on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildStudiesQuery,
  normalizeStudy,
  searchTrials,
} from '../clinicaltrials-client';

const SAMPLE_STUDY = {
  protocolSection: {
    identificationModule: { nctId: 'NCT01234567', briefTitle: 'A Study of Drug X in NSCLC' },
    statusModule: {
      overallStatus: 'RECRUITING',
      startDateStruct: { date: '2024-01-01' },
      completionDateStruct: { date: '2026-12-31' },
    },
    designModule: {
      phases: ['PHASE2', 'PHASE3'],
      studyType: 'INTERVENTIONAL',
      enrollmentInfo: { count: 450 },
    },
    conditionsModule: { conditions: ['Non-Small Cell Lung Cancer'] },
    armsInterventionsModule: { interventions: [{ name: 'Drug X' }, { name: 'Placebo' }] },
    sponsorCollaboratorsModule: { leadSponsor: { name: 'Acme Pharma' } },
  },
};

describe('clinicaltrials-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CTGOV_API_BASE_URL;
    vi.restoreAllMocks();
  });

  describe('buildStudiesQuery', () => {
    it('maps structured filters to v2 params', () => {
      const qs = buildStudiesQuery({
        condition: 'NSCLC',
        intervention: 'Drug X',
        sponsor: 'Acme',
        status: 'recruiting',
        phase: 'PHASE3',
        pageSize: 7,
      });
      expect(qs.get('query.cond')).toBe('NSCLC');
      expect(qs.get('query.intr')).toBe('Drug X');
      expect(qs.get('query.spons')).toBe('Acme');
      expect(qs.get('filter.overallStatus')).toBe('RECRUITING');
      expect(qs.get('aggFilters')).toBe('phase:3');
      expect(qs.get('pageSize')).toBe('7');
      expect(qs.get('countTotal')).toBe('true');
      expect(qs.get('format')).toBe('json');
    });

    it('supports free-text query and multiple statuses', () => {
      const qs = buildStudiesQuery({ query: 'melanoma', status: ['recruiting', 'completed'] });
      expect(qs.get('query.term')).toBe('melanoma');
      expect(qs.get('filter.overallStatus')).toBe('RECRUITING,COMPLETED');
    });

    it('clamps pageSize to [1, 50]', () => {
      expect(buildStudiesQuery({ pageSize: 999 }).get('pageSize')).toBe('50');
      expect(buildStudiesQuery({ pageSize: 0 }).get('pageSize')).toBe('1');
      expect(buildStudiesQuery({}).get('pageSize')).toBe('10'); // default
    });
  });

  describe('normalizeStudy', () => {
    it('flattens a v2 study into a citeable trial', () => {
      const t = normalizeStudy(SAMPLE_STUDY);
      expect(t).toEqual({
        nctId: 'NCT01234567',
        title: 'A Study of Drug X in NSCLC',
        status: 'RECRUITING',
        phase: 'PHASE2, PHASE3',
        studyType: 'INTERVENTIONAL',
        conditions: ['Non-Small Cell Lung Cancer'],
        interventions: ['Drug X', 'Placebo'],
        sponsor: 'Acme Pharma',
        enrollment: 450,
        startDate: '2024-01-01',
        completionDate: '2026-12-31',
        url: 'https://clinicaltrials.gov/study/NCT01234567',
      });
    });

    it('is defensive against missing fields', () => {
      const t = normalizeStudy({});
      expect(t.nctId).toBe('');
      expect(t.conditions).toEqual([]);
      expect(t.interventions).toEqual([]);
      expect(t.enrollment).toBeNull();
      expect(t.startDate).toBeNull();
      expect(t.url).toBe('https://clinicaltrials.gov/');
    });
  });

  describe('searchTrials', () => {
    it('returns normalized trials + totalCount on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ studies: [SAMPLE_STUDY], totalCount: 123 }),
      }) as any;

      const result = await searchTrials({ condition: 'NSCLC', pageSize: 5 });
      expect(result.source).toBe('ClinicalTrials.gov');
      expect(result.totalCount).toBe(123);
      expect(result.trials).toHaveLength(1);
      expect(result.trials[0].nctId).toBe('NCT01234567');
      expect(result.trials[0].url).toBe('https://clinicaltrials.gov/study/NCT01234567');

      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://clinicaltrials.gov/api/v2/studies?');
      expect(calledUrl).toContain('query.cond=NSCLC');
    });

    it('honors CTGOV_API_BASE_URL override', async () => {
      process.env.CTGOV_API_BASE_URL = 'https://ctgov-proxy.internal/v2/';
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ studies: [], totalCount: 0 }),
      }) as any;

      await searchTrials({ query: 'x' });
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      // Trailing slash on base is stripped; path is appended once.
      expect(calledUrl.startsWith('https://ctgov-proxy.internal/v2/studies?')).toBe(true);
    });

    it('throws on a non-2xx response (caller degrades gracefully)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
      await expect(searchTrials({ query: 'x' })).rejects.toThrow(/HTTP 503/);
    });
  });
});
