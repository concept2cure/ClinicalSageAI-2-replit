/**
 * Tests for the Real-World Evidence study-execution engine.
 *
 * Validates the analytic statistics (computed from real counts) and the
 * orchestration: FHIR-backed cohort counting (mocked), fail-loud behavior when
 * no source is connected or a vendor source is requested, and the
 * insufficient-data path. No real network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  comparativeStatistics,
  runRWEStudy,
  RWESourceNotConfiguredError,
} from '../rwe-study-service';

function countResponse(total: number) {
  return { ok: true, status: 200, json: async () => ({ total }) } as Response;
}

describe('rwe-study-service', () => {
  describe('comparativeStatistics', () => {
    it('computes risk ratio, difference, CI, and p-value from real counts', () => {
      const s = comparativeStatistics(20, 100, 10, 100); // 0.20 vs 0.10
      expect(s.riskRatio).toBeCloseTo(2, 5);
      expect(s.riskDifference).toBeCloseTo(0.1, 5);
      expect(s.riskRatioCI).not.toBeNull();
      expect(s.riskRatioCI![0]).toBeLessThan(s.riskRatio!);
      expect(s.riskRatioCI![1]).toBeGreaterThan(s.riskRatio!);
      expect(s.pValue).not.toBeNull();
      expect(s.pValue!).toBeGreaterThan(0);
      expect(s.pValue!).toBeLessThan(1);
    });

    it('returns null risk ratio when the comparator risk is zero (no fabrication)', () => {
      const s = comparativeStatistics(15, 100, 0, 100);
      expect(s.riskDifference).toBeCloseTo(0.15, 5);
      expect(s.riskRatio).toBeNull();
      expect(s.riskRatioCI).toBeNull();
    });

    it('returns null measures when a cohort is empty', () => {
      const s = comparativeStatistics(0, 0, 5, 50);
      expect(s.riskRatio).toBeNull();
      expect(s.riskDifference).toBeNull();
      expect(s.pValue).toBeNull();
    });
  });

  describe('runRWEStudy', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      delete process.env.FHIR_BASE_URL;
    });

    it('throws for a licensed vendor source that is not configured', async () => {
      process.env.FHIR_BASE_URL = 'https://fhir.example.org/r4';
      await expect(
        runRWEStudy({ dataSource: 'aetion', exposureCode: 'A', outcomeCode: 'O' })
      ).rejects.toBeInstanceOf(RWESourceNotConfiguredError);
    });

    it('throws when no FHIR source is connected', async () => {
      delete process.env.FHIR_BASE_URL;
      await expect(
        runRWEStudy({ dataSource: 'fhir', exposureCode: 'A', outcomeCode: 'O' })
      ).rejects.toBeInstanceOf(RWESourceNotConfiguredError);
    });

    it('executes a real comparative study from FHIR counts', async () => {
      process.env.FHIR_BASE_URL = 'https://fhir.example.org/r4';
      // Route mocked counts by the cohort code and whether an outcome filter is present.
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          const u = String(url);
          const hasOutcome = u.includes('Condition');
          const isExposed = u.includes('EXP');
          if (isExposed) return Promise.resolve(countResponse(hasOutcome ? 20 : 100));
          return Promise.resolve(countResponse(hasOutcome ? 10 : 100)); // comparator
        })
      );

      const result = await runRWEStudy({
        dataSource: 'fhir',
        exposureCode: 'EXP',
        comparatorCode: 'CMP',
        outcomeCode: 'OUT',
      });

      expect(result.status).toBe('completed');
      expect(result.cohorts.exposed).toMatchObject({ n: 100, events: 20 });
      expect(result.cohorts.comparator).toMatchObject({ n: 100, events: 10 });
      expect(result.statistics?.riskRatio).toBeCloseTo(2, 5);
      expect(result.provenance.source).toBe('FHIR R4');
    });

    it('returns insufficient_data with null statistics when a cohort is too small', async () => {
      process.env.FHIR_BASE_URL = 'https://fhir.example.org/r4';
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          const u = String(url);
          const hasOutcome = u.includes('Condition');
          const isExposed = u.includes('EXP');
          if (isExposed) return Promise.resolve(countResponse(hasOutcome ? 0 : 0)); // empty exposed
          return Promise.resolve(countResponse(hasOutcome ? 5 : 50));
        })
      );

      const result = await runRWEStudy({
        dataSource: 'fhir',
        exposureCode: 'EXP',
        comparatorCode: 'CMP',
        outcomeCode: 'OUT',
        minCohortSize: 10,
      });

      expect(result.status).toBe('insufficient_data');
      expect(result.statistics).toBeNull();
    });
  });
});
