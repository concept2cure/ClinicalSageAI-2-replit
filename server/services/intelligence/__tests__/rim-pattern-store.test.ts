/**
 * RIM Pattern Store — verifies the tenant-scoped persistence + deterministic read
 * path that activates Lane E (the RIM learning loop). Pure store, so the suite is
 * hermetic (no mocks, no IO).
 *
 * Coverage:
 *   - recordPattern → getPatterns round-trips the pattern
 *   - recording the same signal twice increments occurrences and bumps confidence,
 *     never exceeding the confidence bound
 *   - getPatterns is tenant-isolated: it returns ONLY the queried org's patterns
 *   - an unknown org returns an empty set (no throw)
 *   - the `recall_rim_patterns` read path (getPatterns with optional domain) is
 *     deterministic and tenant-isolated, exactly as the AnA handler invokes it
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryRimPatternStore,
  getPatterns,
  recordPattern,
  rimPatternStore,
  CONFIDENCE_MAX,
  CONFIDENCE_STEP,
  type RimPattern,
} from '../rim-pattern-store';

const ORG_A = 101;
const ORG_B = 202;

describe('InMemoryRimPatternStore — record + read', () => {
  let store: InMemoryRimPatternStore;

  beforeEach(() => {
    store = new InMemoryRimPatternStore();
  });

  it('recordPattern then getPatterns returns the recorded pattern', () => {
    const recorded = store.recordPattern({
      orgId: ORG_A,
      domain: 'csr',
      signalType: 'reviewer_trigger',
      observation: 'Missing screen-failure disposition triggers reviewer queries',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    const read = store.getPatterns({ orgId: ORG_A });
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject<Partial<RimPattern>>({
      id: recorded.id,
      orgId: ORG_A,
      domain: 'csr',
      signalType: 'reviewer_trigger',
      occurrences: 1,
    });
    expect(read[0].firstSeen).toBe('2026-01-01T00:00:00.000Z');
    expect(read[0].lastSeen).toBe('2026-01-01T00:00:00.000Z');
  });

  it('recording the same signal twice increments occurrences (no duplicate)', () => {
    const first = store.recordPattern({
      orgId: ORG_A,
      domain: 'fda_compliance',
      signalType: 'deficiency',
      observation: 'Inadequate QTc characterization',
      observedAt: '2026-01-01T00:00:00.000Z',
      confidence: 50,
    });
    const second = store.recordPattern({
      orgId: ORG_A,
      domain: 'fda_compliance',
      signalType: 'deficiency',
      observation: 'Inadequate QTc characterization',
      observedAt: '2026-02-01T00:00:00.000Z',
      confidence: 50,
    });

    expect(second.id).toBe(first.id);
    expect(second.occurrences).toBe(2);
    expect(second.confidence).toBe(50 + CONFIDENCE_STEP);
    expect(second.firstSeen).toBe('2026-01-01T00:00:00.000Z');
    expect(second.lastSeen).toBe('2026-02-01T00:00:00.000Z');

    // Still a single pattern, not two.
    expect(store.getPatterns({ orgId: ORG_A })).toHaveLength(1);
  });

  it('confidence rises with repetition but never exceeds the bound', () => {
    let last: RimPattern | undefined;
    // Seed near the ceiling, then observe many times.
    for (let i = 0; i < 50; i++) {
      last = store.recordPattern({
        orgId: ORG_A,
        domain: 'csr',
        signalType: 'risk_signal',
        observation: 'Unsupported efficacy claim',
        confidence: 90,
        observedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      });
    }
    expect(last).toBeDefined();
    expect(last!.confidence).toBe(CONFIDENCE_MAX);
    expect(last!.confidence).toBeLessThanOrEqual(CONFIDENCE_MAX);
    expect(last!.occurrences).toBe(50);
  });

  it('getPatterns is tenant-isolated — only the queried org is returned', () => {
    store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Org A pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    store.recordPattern({
      orgId: ORG_B, domain: 'csr', signalType: 'deficiency',
      observation: 'Org B pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    const aPatterns = store.getPatterns({ orgId: ORG_A });
    const bPatterns = store.getPatterns({ orgId: ORG_B });

    expect(aPatterns).toHaveLength(1);
    expect(bPatterns).toHaveLength(1);
    expect(aPatterns.every(p => p.orgId === ORG_A)).toBe(true);
    expect(bPatterns.every(p => p.orgId === ORG_B)).toBe(true);
    expect(aPatterns[0].observation).toBe('Org A pattern');
    expect(bPatterns[0].observation).toBe('Org B pattern');
  });

  it('unknown org returns an empty set without throwing', () => {
    store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Org A pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(() => store.getPatterns({ orgId: 999999 })).not.toThrow();
    expect(store.getPatterns({ orgId: 999999 })).toEqual([]);
  });

  it('domain filter narrows results within an org', () => {
    store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'CSR pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    store.recordPattern({
      orgId: ORG_A, domain: '510k', signalType: 'deficiency',
      observation: '510k pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(store.getPatterns({ orgId: ORG_A })).toHaveLength(2);
    const csrOnly = store.getPatterns({ orgId: ORG_A, domain: 'csr' });
    expect(csrOnly).toHaveLength(1);
    expect(csrOnly[0].domain).toBe('csr');
  });

  it('rejects invalid provenance (non-positive org, empty domain/observation)', () => {
    expect(() => store.recordPattern({
      orgId: 0, domain: 'csr', signalType: 'deficiency', observation: 'x',
    })).toThrow();
    expect(() => store.recordPattern({
      orgId: ORG_A, domain: '   ', signalType: 'deficiency', observation: 'x',
    })).toThrow();
    expect(() => store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency', observation: '   ',
    })).toThrow();
  });

  it('getPatterns returns strongest patterns first (deterministic ordering)', () => {
    store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Weak', confidence: 40, observedAt: '2026-01-01T00:00:00.000Z',
    });
    store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Strong', confidence: 90, observedAt: '2026-01-01T00:00:00.000Z',
    });

    const read = store.getPatterns({ orgId: ORG_A });
    expect(read.map(p => p.observation)).toEqual(['Strong', 'Weak']);
  });
});

describe('module-level helpers (default store used by the recall_rim_patterns handler)', () => {
  beforeEach(() => {
    rimPatternStore.clear();
  });

  it('recordPattern helper persists and getPatterns helper reads it back, tenant-scoped', () => {
    recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'reviewer_trigger',
      observation: 'Default-store pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    // Mirrors exactly how the recall_rim_patterns handler reads the store.
    const aResult = getPatterns({ orgId: ORG_A });
    expect(aResult).toHaveLength(1);
    expect(aResult[0].observation).toBe('Default-store pattern');

    // A different org sees nothing — tenant isolation through the read path.
    expect(getPatterns({ orgId: ORG_B })).toEqual([]);
  });

  it('recordPattern helper is non-throwing on invalid input (returns null)', () => {
    expect(recordPattern({
      orgId: -1, domain: 'csr', signalType: 'deficiency', observation: 'bad',
    })).toBeNull();
    // Nothing persisted from the bad call.
    expect(getPatterns({ orgId: ORG_A })).toEqual([]);
  });
});
