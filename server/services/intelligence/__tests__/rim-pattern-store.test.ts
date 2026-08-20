/**
 * RIM Pattern Store — verifies the tenant-scoped persistence + deterministic read
 * path that activates Lane E (the RIM learning loop). Persistence is mocked with
 * an in-memory fake so the suite stays hermetic; the REAL database persistence is
 * covered end-to-end by rim-learning-loop.pglite.integration.test.ts.
 *
 * Coverage:
 *   - recordPattern → getPatterns round-trips the pattern
 *   - recording the same signal twice increments occurrences and bumps confidence,
 *     never exceeding the confidence bound
 *   - getPatterns is tenant-isolated: it returns ONLY the queried org's patterns
 *   - an unknown org returns an empty set (no throw)
 *   - the `recall_rim_patterns` read path (getPatterns with optional domain) is
 *     deterministic and tenant-isolated, exactly as the AnA handler invokes it
 *   - HYDRATION IS AWAITED: the FIRST read of a process returns persisted
 *     patterns, and a write from a fresh process merges onto persisted state
 *     instead of clobbering it. Both were real defects: the store used to fire
 *     hydration and read/write the map in the same tick, so every process
 *     started from [] — and its first persist overwrote the org's history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory persistence fake, per-org, reset per test.
const persisted = new Map<string, unknown[]>();
vi.mock('../rim-pattern-persistence', () => ({
  persistPatterns: vi.fn(async (orgId: string, patterns: unknown[]) => {
    persisted.set(orgId, JSON.parse(JSON.stringify(patterns)));
  }),
  loadPersistedPatterns: vi.fn(async (orgId: string) => persisted.get(orgId) ?? []),
}));

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

/** The fire-and-forget persist runs post-return; wait for it to settle. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('InMemoryRimPatternStore — record + read', () => {
  let store: InMemoryRimPatternStore;

  beforeEach(() => {
    persisted.clear();
    store = new InMemoryRimPatternStore();
  });

  it('recordPattern then getPatterns returns the recorded pattern', async () => {
    const recorded = await store.recordPattern({
      orgId: ORG_A,
      domain: 'csr',
      signalType: 'reviewer_trigger',
      observation: 'Missing screen-failure disposition triggers reviewer queries',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    const read = await store.getPatterns({ orgId: ORG_A });
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

  it('recording the same signal twice increments occurrences (no duplicate)', async () => {
    const first = await store.recordPattern({
      orgId: ORG_A,
      domain: 'fda_compliance',
      signalType: 'deficiency',
      observation: 'Inadequate QTc characterization',
      observedAt: '2026-01-01T00:00:00.000Z',
      confidence: 50,
    });
    const second = await store.recordPattern({
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
    expect(await store.getPatterns({ orgId: ORG_A })).toHaveLength(1);
  });

  it('confidence rises with repetition but never exceeds the bound', async () => {
    let last: RimPattern | undefined;
    // Seed near the ceiling, then observe many times.
    for (let i = 0; i < 50; i++) {
      last = await store.recordPattern({
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

  it('getPatterns is tenant-isolated — only the queried org is returned', async () => {
    await store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Org A pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.recordPattern({
      orgId: ORG_B, domain: 'csr', signalType: 'deficiency',
      observation: 'Org B pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    const aPatterns = await store.getPatterns({ orgId: ORG_A });
    const bPatterns = await store.getPatterns({ orgId: ORG_B });

    expect(aPatterns).toHaveLength(1);
    expect(bPatterns).toHaveLength(1);
    expect(aPatterns.every(p => p.orgId === ORG_A)).toBe(true);
    expect(bPatterns.every(p => p.orgId === ORG_B)).toBe(true);
    expect(aPatterns[0].observation).toBe('Org A pattern');
    expect(bPatterns[0].observation).toBe('Org B pattern');
  });

  it('unknown org returns an empty set without throwing', async () => {
    await store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Org A pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(store.getPatterns({ orgId: 999999 })).resolves.toEqual([]);
  });

  it('domain filter narrows results within an org', async () => {
    await store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'CSR pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.recordPattern({
      orgId: ORG_A, domain: '510k', signalType: 'deficiency',
      observation: '510k pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(await store.getPatterns({ orgId: ORG_A })).toHaveLength(2);
    const csrOnly = await store.getPatterns({ orgId: ORG_A, domain: 'csr' });
    expect(csrOnly).toHaveLength(1);
    expect(csrOnly[0].domain).toBe('csr');
  });

  it('rejects invalid provenance (non-positive org, empty domain/observation)', async () => {
    await expect(store.recordPattern({
      orgId: 0, domain: 'csr', signalType: 'deficiency', observation: 'x',
    })).rejects.toThrow();
    await expect(store.recordPattern({
      orgId: ORG_A, domain: '   ', signalType: 'deficiency', observation: 'x',
    })).rejects.toThrow();
    await expect(store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency', observation: '   ',
    })).rejects.toThrow();
  });

  it('getPatterns returns strongest patterns first (deterministic ordering)', async () => {
    await store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Weak', confidence: 40, observedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Strong', confidence: 90, observedAt: '2026-01-01T00:00:00.000Z',
    });

    const read = await store.getPatterns({ orgId: ORG_A });
    expect(read.map(p => p.observation)).toEqual(['Strong', 'Weak']);
  });
});

describe('hydration — persisted judgment survives a process restart', () => {
  beforeEach(() => {
    persisted.clear();
  });

  it('the FIRST read of a fresh process returns persisted patterns (the race regression)', async () => {
    // "An earlier process" learns a pattern and persists it.
    const earlier = new InMemoryRimPatternStore();
    await earlier.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Persisted across restarts', observedAt: '2026-01-01T00:00:00.000Z',
    });
    await flush();
    expect(persisted.get(String(ORG_A))).toHaveLength(1);

    // "A fresh process": brand-new store, FIRST call. The pre-fix store fired
    // hydration and read the map in the same tick, so this returned [] — the
    // whole subsystem's dormancy in one line.
    const fresh = new InMemoryRimPatternStore();
    const firstRead = await fresh.getPatterns({ orgId: ORG_A });
    expect(firstRead).toHaveLength(1);
    expect(firstRead[0].observation).toBe('Persisted across restarts');
  });

  it('a write from a fresh process MERGES onto persisted state, never clobbers it', async () => {
    const earlier = new InMemoryRimPatternStore();
    await earlier.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'History worth keeping', observedAt: '2026-01-01T00:00:00.000Z',
    });
    await flush();

    // Fresh process records a DIFFERENT pattern before ever reading. The
    // pre-fix store persisted its full (unhydrated) set — one pattern —
    // destroying the org's history.
    const fresh = new InMemoryRimPatternStore();
    await fresh.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'rejection',
      observation: 'New observation', observedAt: '2026-02-01T00:00:00.000Z',
    });
    await flush();

    const stored = (persisted.get(String(ORG_A)) ?? []) as RimPattern[];
    expect(stored.map(p => p.observation).sort()).toEqual([
      'History worth keeping',
      'New observation',
    ]);
  });

  it('a repeat of a persisted observation INCREMENTS it instead of re-seeding', async () => {
    const earlier = new InMemoryRimPatternStore();
    await earlier.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Seen before', observedAt: '2026-01-01T00:00:00.000Z', confidence: 60,
    });
    await flush();

    const fresh = new InMemoryRimPatternStore();
    const repeat = await fresh.recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'deficiency',
      observation: 'Seen before', observedAt: '2026-03-01T00:00:00.000Z',
    });

    expect(repeat.occurrences).toBe(2);
    expect(repeat.confidence).toBe(60 + CONFIDENCE_STEP);
    expect(repeat.firstSeen).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('module-level helpers (default store used by the recall_rim_patterns handler)', () => {
  beforeEach(() => {
    persisted.clear();
    rimPatternStore.clear();
  });

  it('recordPattern helper persists and getPatterns helper reads it back, tenant-scoped', async () => {
    await recordPattern({
      orgId: ORG_A, domain: 'csr', signalType: 'reviewer_trigger',
      observation: 'Default-store pattern', observedAt: '2026-01-01T00:00:00.000Z',
    });

    // Mirrors exactly how the recall_rim_patterns handler reads the store.
    const aResult = await getPatterns({ orgId: ORG_A });
    expect(aResult).toHaveLength(1);
    expect(aResult[0].observation).toBe('Default-store pattern');

    // A different org sees nothing — tenant isolation through the read path.
    expect(await getPatterns({ orgId: ORG_B })).toEqual([]);
  });

  it('recordPattern helper is non-throwing on invalid input (resolves null)', async () => {
    await expect(recordPattern({
      orgId: -1, domain: 'csr', signalType: 'deficiency', observation: 'bad',
    })).resolves.toBeNull();
    // Nothing persisted from the bad call.
    expect(await getPatterns({ orgId: ORG_A })).toEqual([]);
  });
});
