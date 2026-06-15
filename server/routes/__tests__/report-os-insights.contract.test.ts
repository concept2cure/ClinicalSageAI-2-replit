/**
 * Light contract test for the Insights router + prediction report-type seeds.
 *
 * Deliberately does NOT spin up a server or touch the DB: the db facade is
 * mocked so importing the router (which transitively pulls the subscription
 * service) never opens a real connection. We only assert structural contracts:
 *   - the router default export is an Express router (a function);
 *   - the three prediction report types exist, have unique typeIds, valid
 *     allowedScopes, and Part 11 governance.
 */

import { describe, it, expect, vi } from 'vitest';

// Prevent any real DB connection when the router's transitive imports load.
vi.mock('../../db', () => ({
  db: {},
  pool: {},
  getPool: () => ({}),
  getDb: () => ({}),
  query: vi.fn(),
  transaction: vi.fn(),
}));

import insightsRouter from '../report-os-insights';
import { PREDICTION_REPORT_TYPES } from '../../services/report-os/prediction/report-types';
import { reportScopeEnum } from '@shared/schema/report-os';

describe('report-os-insights router contract', () => {
  it('exports an Express router (a function)', () => {
    expect(typeof insightsRouter).toBe('function');
    // Express routers also carry a stack of mounted layers.
    expect(Array.isArray((insightsRouter as any).stack)).toBe(true);
  });
});

describe('PREDICTION_REPORT_TYPES contract', () => {
  it('defines exactly three prediction report types', () => {
    expect(PREDICTION_REPORT_TYPES).toHaveLength(3);
  });

  it('has unique typeIds in the prediction family', () => {
    const ids = PREDICTION_REPORT_TYPES.map(t => t.typeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'prediction.deficiency_risk',
        'prediction.readiness_trajectory',
        'prediction.trial_pos',
      ]),
    );
  });

  it('uses only valid allowedScopes', () => {
    const valid = new Set(reportScopeEnum as readonly string[]);
    for (const t of PREDICTION_REPORT_TYPES) {
      expect(t.allowedScopes.length).toBeGreaterThan(0);
      for (const scope of t.allowedScopes) {
        expect(valid.has(scope)).toBe(true);
      }
    }
  });

  it('requires Part 11 governance on every prediction type', () => {
    for (const t of PREDICTION_REPORT_TYPES) {
      expect(t.governanceRequirements.part11).toBe(true);
      expect(t.governanceRequirements.auditTrail).toBe(true);
    }
  });
});
