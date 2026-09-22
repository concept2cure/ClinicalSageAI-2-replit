/**
 * Governance boundary gates 3 (contradictions) and 4 (fabric readiness) must
 * FAIL CLOSED when they cannot run.
 *
 * Both used to end in an empty `catch {}` commented "non-blocking
 * degradation". `allowed` is `blockedReasons.length === 0`, so a gate that
 * threw was indistinguishable from a gate that passed, and the append-only
 * `governance_boundary_transitions` row said `transitionAllowed: true,
 * blockedReasons: []` for a lock whose contradiction check never ran.
 *
 * Each degraded case below is paired with the healthy control: the same
 * request, gates working, clean result → allowed. Without the control a test
 * that blocks everything would pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  contradiction: {
    mode: 'clean' as 'clean' | 'throws' | 'missing-method' | 'blocking',
  },
  fabric: { mode: 'clean' as 'clean' | 'throws' },
}));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { returning: async () => [{ id: 'transition-1', ...row }] };
      },
    }),
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));

vi.mock('../contradiction-engine-service.js', () => ({
  get contradictionEngineService() {
    if (h.contradiction.mode === 'missing-method') return {};
    return {
      checkPromotionBlocked: async () => {
        if (h.contradiction.mode === 'throws') {
          throw new Error('relation "contradiction_findings" does not exist');
        }
        const blocking = h.contradiction.mode === 'blocking' ? [{ id: 'f1' }] : [];
        return { blocked: blocking.length > 0, blockingFindings: blocking, warningFindings: [] };
      },
    };
  },
}));

vi.mock('../../src/control-plane/governed-document-evaluator.js', () => ({
  evaluateGovernedDocument: () => {
    if (h.fabric.mode === 'throws') throw new Error('fabric evaluator failed');
    return { evaluation: { readiness: { level: 'ready', blockers: [] } } };
  },
}));

import { GovernanceBoundaryService } from '../governance-boundary-service';

function service(): GovernanceBoundaryService {
  const s = new (GovernanceBoundaryService as unknown as { new (): GovernanceBoundaryService })();
  // Isolate gates 3 and 4: no rules, nothing to seed.
  vi.spyOn(s as unknown as { ensureDefaultRules: () => Promise<void> }, 'ensureDefaultRules').mockResolvedValue(undefined);
  vi.spyOn(s, 'getRules').mockResolvedValue([]);
  return s;
}

const LOCK = {
  organizationId: 1,
  projectId: 10,
  artifactId: 77,
  fromBoundary: 'approved' as const,
  toBoundary: 'locked' as const,
  actorId: 5,
  actorRole: 'regulatory_lead',
};

beforeEach(() => {
  h.inserted.length = 0;
  h.contradiction.mode = 'clean';
  h.fabric.mode = 'clean';
});

describe('healthy control — the gates can say yes', () => {
  it('allows the lock when both gates run and find nothing', async () => {
    const r = await service().evaluateTransition(LOCK);
    expect(r.blockedReasons).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  it('blocks on a real blocking contradiction (the gate works when it runs)', async () => {
    h.contradiction.mode = 'blocking';
    const r = await service().evaluateTransition(LOCK);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/1 unresolved blocking contradiction/);
  });
});

describe('gate 3 — contradiction gate fails closed', () => {
  it('blocks when the contradiction check throws', async () => {
    h.contradiction.mode = 'throws';
    const r = await service().evaluateTransition(LOCK);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(
      /Contradiction gate could not be evaluated \(relation "contradiction_findings" does not exist\)\. Failing closed/,
    );
  });

  it('blocks when the engine does not expose checkPromotionBlocked (was a silent skip)', async () => {
    h.contradiction.mode = 'missing-method';
    const r = await service().evaluateTransition(LOCK);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/does not expose checkPromotionBlocked/);
  });
});

describe('gate 4 — fabric readiness gate fails closed', () => {
  it.each(['approved', 'locked', 'submission_ready'] as const)(
    'blocks a transition to %s when the fabric evaluator throws',
    async (toBoundary) => {
      h.fabric.mode = 'throws';
      const fromBoundary = toBoundary === 'approved' ? 'governed_draft' : 'approved';
      const r = await service().evaluateTransition({ ...LOCK, fromBoundary, toBoundary });
      expect(r.allowed).toBe(false);
      expect(r.blockedReasons.join(' ')).toMatch(/Fabric readiness gate could not be evaluated \(fabric evaluator failed\)/);
    },
  );
});

describe('the audit row tells the truth', () => {
  it('records transitionAllowed:false with the reason when a gate could not run', async () => {
    h.contradiction.mode = 'throws';
    await service().evaluateTransition(LOCK);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0].transitionAllowed).toBe(false);
    expect((h.inserted[0].blockedReasons as string[]).join(' ')).toMatch(/Contradiction gate could not be evaluated/);
  });
});
