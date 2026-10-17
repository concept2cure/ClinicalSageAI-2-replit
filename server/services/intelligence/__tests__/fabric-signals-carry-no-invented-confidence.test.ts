/**
 * Governed-document decisions enter RIM without an invented confidence, and an
 * unreadable RIM context says so (finding 32, 2026-10-15).
 *
 * What the code used to do:
 *   - interceptFabricDecision filed each decision as a signal at a constant
 *     confidence chosen by outcome: block 90, review 80, degraded 40, allow
 *     60 + 0.3 × readiness. Those fed the same signal averages AnA cited.
 *   - buildRIMContextForFabric turned any failure into "No RIM intelligence
 *     available" with hasHighRiskSignals false — the same answer as an empty,
 *     healthy store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ failSummary: false }));

vi.mock('../signal-capture', async importOriginal => {
  const actual = await importOriginal<typeof import('../signal-capture')>();
  return {
    ...actual,
    getSignalSummary: (org: number, project: number) => {
      if (h.failSummary) throw new Error('signal store unreadable');
      return actual.getSignalSummary(org, project);
    },
  };
});

import { buildRIMContextForFabric, interceptFabricDecision } from '../fabric-signal-bridge';
import { querySignals } from '../signal-capture';

const DECISION = {
  organizationId: 81,
  decisionId: 'd1',
  intent: 'export',
  readinessLevel: 'ready',
  blockerCount: 0,
  warningCount: 0,
  blockerCategories: [],
  exportGateOutcome: 'allow',
  publishGateOutcome: 'allow',
  consequenceTypes: [],
};

beforeEach(() => {
  h.failSummary = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('interceptFabricDecision', () => {
  it.each([
    ['block', 82, 40],
    ['allow', 83, 80],
  ])('a %s decision carries no confidence nobody computed', (outcome, projectId, readinessScore) => {
    interceptFabricDecision({ ...DECISION, projectId, outcome, readinessScore });
    const [signal] = querySignals({ organizationId: 81, projectId });
    expect(signal.score).toBe(readinessScore);
    expect(signal.confidence).toBeNull();
  });
});

describe('buildRIMContextForFabric', () => {
  it('a failure is unavailable, not "no intelligence" with no high-risk signals', () => {
    h.failSummary = true;
    const ctx = buildRIMContextForFabric(81, 84);
    expect(ctx.available).toBe(false);
    expect('hasHighRiskSignals' in ctx).toBe(false);
  });

  it('an empty, readable store says no signals were captured', () => {
    const ctx = buildRIMContextForFabric(81, 85);
    expect(ctx.available).toBe(true);
    expect(ctx.available && ctx.compactSummary).toBe('No RIM signals captured for this project');
  });
});
