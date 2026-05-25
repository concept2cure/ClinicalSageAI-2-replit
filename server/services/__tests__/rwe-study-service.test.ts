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
  logisticRegression,
  propensityAdjustedEffect,
  incidenceRateRatio,
  runRWEStudy,
  RWESourceNotConfiguredError,
  type PatientRecord,
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

  describe('logisticRegression', () => {
    it('recovers the sign of a separating covariate', () => {
      // y increases with the covariate; X includes an intercept column.
      const X = [
        [1, -2], [1, -1.5], [1, -1], [1, -0.5],
        [1, 0.5], [1, 1], [1, 1.5], [1, 2],
      ];
      const y = [0, 0, 0, 0, 1, 1, 1, 1];
      const beta = logisticRegression(X, y);
      expect(beta).not.toBeNull();
      expect(beta![1]).toBeGreaterThan(0); // positive slope on the covariate
    });
  });

  describe('incidenceRateRatio', () => {
    it('computes IRR and CI from events and person-time', () => {
      const t = incidenceRateRatio(20, 1000, 10, 1000);
      expect(t.incidenceRateRatio).toBeCloseTo(2, 5);
      expect(t.incidenceRateRatioCI).not.toBeNull();
    });
    it('returns null IRR when person-time is zero', () => {
      const t = incidenceRateRatio(5, 0, 5, 100);
      expect(t.incidenceRateRatio).toBeNull();
      expect(t.incidenceRateRatioCI).toBeNull();
    });
  });

  describe('propensityAdjustedEffect', () => {
    it('returns an IPTW-adjusted effect with risks in [0,1]', () => {
      const patients: PatientRecord[] = [];
      // Exposure correlated with age; outcome present in some of each arm.
      for (let i = 0; i < 40; i++) {
        const age = 40 + (i % 40);
        const exposed = age > 60;
        patients.push({ exposed, outcome: i % 3 === 0, covariates: [age, i % 2] });
      }
      const eff = propensityAdjustedEffect(patients);
      expect(eff).not.toBeNull();
      expect(eff!.riskExposed).toBeGreaterThanOrEqual(0);
      expect(eff!.riskExposed).toBeLessThanOrEqual(1);
      expect(eff!.modeledPatients).toBe(40);
    });
    it('returns null with too few usable records', () => {
      expect(propensityAdjustedEffect([{ exposed: true, outcome: false, covariates: [NaN, 1] }])).toBeNull();
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
