/**
 * Composite readiness is computed only from components that were assessed.
 *
 * computeReadiness scored an empty pattern-warning list as 100 — "no failure
 * pattern is open" — whether or not a pattern replay had ever reached the
 * organization, and left rule-based completeness (the one thing every call
 * assesses) out of the composite. With no trained model, network prior,
 * template validation or reliability data, the warnings were the only
 * component: an NDA draft holding 2 of its required sections scored composite
 * 100, band "ready", beside a recommendation naming its missing critical
 * sections.
 *
 * Now: an empty warning list counts only when a replay has reached the
 * organization; completeness is a component; fewer than two assessed
 * components gives compositeScore null and band 'not_assessed'; and the band
 * is never 'ready' while a required section is missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({
  pool: mockPool,
  getPool: () => mockPool,
  db: mockPool,
  getDb: () => mockPool,
}));

const { computeReadiness } = await import('../regulatory-intelligence');
const { _invalidateModelCacheForTests } = await import('../risk-model');
const { requiredSectionsFor } = await import('../../ectd/required-sections');

interface Stores {
  /** Has any pattern replay ever written a warning for organization 42? */
  replayReachedOrg: boolean;
  /** Latest stored template conformance (0..1), or none. */
  templateConformance: number | null;
}

function stores(s: Stores) {
  mockPool.query.mockImplementation((text: string) => {
    if (/EXISTS[\s\S]*intelligence\.pattern_warnings/.test(text)) {
      return Promise.resolve({ rows: [{ reached: s.replayReachedOrg }] });
    }
    if (/FROM intelligence\.pattern_warnings/.test(text)) return Promise.resolve({ rows: [] }); // nothing open
    if (/intelligence\.template_validations/.test(text)) {
      return Promise.resolve({
        rows: s.templateConformance === null ? [] : [{ conformance_score: String(s.templateConformance), template_name: 'FDA NDA' }],
      });
    }
    return Promise.resolve({ rows: [], rowCount: 0 }); // no model, no prior
  });
}

beforeEach(() => {
  _invalidateModelCacheForTests();
  mockPool.query.mockReset();
});

describe('computeReadiness', () => {
  it('a draft with two required sections and nothing else assessed is not_assessed, not "ready" at 100', async () => {
    stores({ replayReachedOrg: false, templateConformance: null });
    const summary = await computeReadiness({
      organizationId: 42,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      presentSections: ['1.1', '1.2'],
    });

    expect(summary.compositeScore).toBeNull();
    expect(summary.band).toBe('not_assessed');
    expect(summary.componentsAssessed).toEqual(['completeness']);
    expect(summary.componentsNotAssessed).toEqual(
      expect.arrayContaining(['rtf_risk', 'crl_risk', 'template_conformance', 'pattern_warnings', 'signal_reliability']),
    );
    // No replay reached the organization: "0 open warnings" was never checked.
    expect(summary.activeWarnings).toBeNull();
    expect(summary.highSeverityWarnings).toBeNull();
    expect(summary.recommendations.some((r) => /not assessed/i.test(r))).toBe(true);
  });

  it('is never "ready" while a required section is missing, however the other components score', async () => {
    stores({ replayReachedOrg: true, templateConformance: 1 });
    const all = [...(requiredSectionsFor('NDA') ?? [])];
    const missing = all.filter((c) => c.startsWith('5.'))[0];
    const summary = await computeReadiness({
      organizationId: 42,
      submissionType: 'NDA',
      targetAgency: 'FDA',
      presentSections: all.filter((c) => c !== missing),
    });

    expect(summary.riskScores.completeness.rtfRisk.missingCritical.length).toBeGreaterThan(0);
    expect(summary.componentsAssessed).toEqual(['completeness', 'template_conformance', 'pattern_warnings']);
    expect(summary.compositeScore).not.toBeNull();
    expect(summary.compositeScore as number).toBeGreaterThanOrEqual(80);
    expect(summary.band).not.toBe('ready');
    // The replay reached the organization, so an empty open list is a real zero.
    expect(summary.activeWarnings).toBe(0);
  });
});
