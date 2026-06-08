/**
 * Regression — the reviewer "digital twin" Advisory Committee simulation is
 * deterministic, not a Math.random() draw. Locks the fix that removed the
 * per-panelist random "personal bias" and random abstention, which made the
 * predicted vote tally noise that changed on every call. The expected vote
 * split is now derived deterministically from the disclosed clinical-data
 * sentiment, and abstentions (not derivable) are reported as 0, not invented.
 *
 * The legitimate Monte Carlo timing simulation (which aggregates thousands of
 * iterations) intentionally still samples randomness and is not covered here.
 */

import { describe, it, expect, vi } from 'vitest';

// simulateAdvisoryCommittee is pure computation; mock the db import only so
// loading the route module does not attempt a real connection.
vi.mock('../../db', () => ({ db: {}, pool: {} }));

import { RegulatoryDigitalTwin } from '../regulatory-digital-twin';

const TOTAL_PANELISTS = 13;

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    type: 'NDA' as const,
    therapeuticArea: 'oncology',
    indication: 'NSCLC',
    moduleContents: {},
    clinicalData: {
      pivotalTrials: 2,
      totalPatients: 800,
      primaryEndpointMet: true,
      pValue: 0.0005,
      effectSize: 0.6,
      safetySignals: ['mild neutropenia'],
      missingDataPercentage: 5,
    },
    ...overrides,
  };
}

describe('RegulatoryDigitalTwin.simulateAdvisoryCommittee — deterministic, not fabricated', () => {
  it('returns an identical vote prediction across repeated calls (no randomness)', () => {
    const twin = new RegulatoryDigitalTwin();
    const first = twin.simulateAdvisoryCommittee(submission() as any);
    for (let i = 0; i < 8; i++) {
      const next = twin.simulateAdvisoryCommittee(submission() as any);
      expect(next.votePrediction).toEqual(first.votePrediction);
    }
  });

  it('never invents abstentions and conserves the panel size', () => {
    const twin = new RegulatoryDigitalTwin();
    const { votePrediction } = twin.simulateAdvisoryCommittee(submission() as any);
    expect(votePrediction.abstain).toBe(0);
    expect(votePrediction.yes + votePrediction.no).toBe(TOTAL_PANELISTS);
  });

  it('reflects the data: strong evidence yields a favorable majority, weak evidence does not', () => {
    const twin = new RegulatoryDigitalTwin();
    const strong = twin.simulateAdvisoryCommittee(submission() as any);
    const weak = twin.simulateAdvisoryCommittee(
      submission({
        clinicalData: {
          pivotalTrials: 1,
          totalPatients: 120,
          primaryEndpointMet: false,
          safetySignals: ['hepatotoxicity', 'QT prolongation', 'neutropenia'],
          missingDataPercentage: 25,
        },
      }) as any,
    );
    expect(strong.votePrediction.yes).toBeGreaterThan(weak.votePrediction.yes);
  });
});
