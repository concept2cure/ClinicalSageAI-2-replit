/**
 * Tests for counterfactual-replay pure helpers.
 *
 * DB-backed replayPattern / replayRecentlyPromoted are exercised through
 * end-to-end tests separately; here we cover the severity-from-confidence
 * mapping that determines warning rank.
 */

import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(() => { throw new Error('Unreviewed shared content must not be queried'); }) }));
vi.mock('../../../db/runtime.js', () => ({ pool: { query: h.query } }));

import { severityFromConfidence, replayPattern, replayRecentlyPromoted, getActiveWarnings } from '../counterfactual-replay';

describe('severityFromConfidence', () => {
  it('maps to high above 0.8', () => {
    expect(severityFromConfidence(0.95)).toBe('high');
    expect(severityFromConfidence(0.81)).toBe('high');
    expect(severityFromConfidence(0.8)).toBe('high');
  });

  it('maps to medium in [0.55, 0.8)', () => {
    expect(severityFromConfidence(0.79)).toBe('medium');
    expect(severityFromConfidence(0.6)).toBe('medium');
    expect(severityFromConfidence(0.55)).toBe('medium');
  });

  it('maps to low below 0.55', () => {
    expect(severityFromConfidence(0.54)).toBe('low');
    expect(severityFromConfidence(0.3)).toBe('low');
    expect(severityFromConfidence(0)).toBe('low');
  });
});


describe('shared-pattern provenance gate', () => {
  it('does not read or fan out legacy active text before reviewed de-identification exists', async () => {
    h.query.mockClear();
    expect(await replayPattern('legacy-tenant-secret', { minConfidence: 0, lookbackDays: 9999 })).toMatchObject({
      warningsCreated: 0, tenantsWarned: 0, holdReason: 'deidentification_and_human_promotion_required',
    });
    expect(await replayRecentlyPromoted()).toMatchObject({ patternsReplayed: 0, warningsCreated: 0,
      holdReason: 'deidentification_and_human_promotion_required' });
    expect(await getActiveWarnings({ organizationId: 7 })).toEqual([]);
    expect(await getActiveWarnings({ organizationId: 8 })).toEqual([]);
    expect(h.query).not.toHaveBeenCalled();
  });
});
