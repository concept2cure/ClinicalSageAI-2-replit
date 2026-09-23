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
  fabricInput: null as null | Record<string, any>,
  artifact: null as null | Record<string, unknown>,
}));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { returning: async () => [{ id: 'transition-1', ...row }] };
      },
    }),
    // Gate 4 is the only execute() reached (rules are stubbed empty).
    execute: vi.fn(async () => ({ rows: h.artifact ? [h.artifact] : [] })),
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
  evaluateGovernedDocument: (input: Record<string, any>) => {
    h.fabricInput = input;
    if (h.fabric.mode === 'throws') throw new Error('fabric evaluator failed');
    return { evaluation: { readiness: { level: 'ready', blockers: [] } } };
  },
}));

import {
  GovernanceBoundaryService,
  documentBoundaryRequirements,
  documentReadinessFacts,
} from '../governance-boundary-service';

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

const ARTIFACT = {
  status: 'approved', content: 'Section 2.5 clinical overview text.', content_hash: 'abc',
  citations: [{ id: 'c1' }], ctd_section: 'm2.5', type: 'clinical_overview',
};

beforeEach(() => {
  h.artifact = { ...ARTIFACT };
  h.fabricInput = null;
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
      if (toBoundary === 'submission_ready') h.artifact = { ...ARTIFACT, status: 'locked' };
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

describe('gate 4 — judges the real artifact, not asserted facts', () => {
  it('fails closed when the artifact is not in this organization and project', async () => {
    h.artifact = null;
    const r = await service().evaluateTransition(LOCK);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/artifact 77 was not found in this organization and project/);
  });

  it('feeds the fabric what the row records — no hard-coded trues', async () => {
    h.artifact = { ...ARTIFACT, citations: [], content_hash: null };
    await service().evaluateTransition(LOCK);
    const st = h.fabricInput?.documentState;
    expect(st.hasEvidence).toBe(false);          // was hard-coded true
    expect(st.evidenceCount).toBe(0);
    expect(st.hasProvenance).toBe(false);        // was hard-coded true; not evaluated here
    expect(st.hasApproval).toBe(true);           // the row says approved
    expect(st.placementValid).toBe(true);
  });

  it('blocks locking an artifact with no content', async () => {
    h.artifact = { ...ARTIFACT, content: '   ' };
    const r = await service().evaluateTransition(LOCK);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/has no content/);
  });

  it('blocks submission-ready for an artifact that was never locked', async () => {
    h.artifact = { ...ARTIFACT, status: 'approved' };
    const r = await service().evaluateTransition({ ...LOCK, fromBoundary: 'locked', toBoundary: 'submission_ready' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/only a locked artifact can be marked submission-ready/);
  });

  it('blocks submission-ready with no CTD placement', async () => {
    h.artifact = { ...ARTIFACT, status: 'locked', ctd_section: null };
    const r = await service().evaluateTransition({ ...LOCK, fromBoundary: 'locked', toBoundary: 'submission_ready' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/no CTD placement/);
  });

  it('allows submission-ready for a locked, placed artifact with content (control)', async () => {
    h.artifact = { ...ARTIFACT, status: 'locked' };
    const r = await service().evaluateTransition({ ...LOCK, fromBoundary: 'locked', toBoundary: 'submission_ready' });
    expect(r.blockedReasons).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  it('does not judge a transition with no artifact as a document', async () => {
    h.artifact = null;
    const r = await service().evaluateTransition({ ...LOCK, artifactId: undefined });
    expect(r.blockedReasons.join(' ')).not.toMatch(/Document readiness gate|Fabric readiness gate/);
  });
});

describe('documentBoundaryRequirements — pure', () => {
  const facts = (over: Partial<Parameters<typeof documentReadinessFacts>[0]> = {}) =>
    documentReadinessFacts({ ...ARTIFACT, ...over } as Parameters<typeof documentReadinessFacts>[0]);

  it('rejects a code-shaped-invalid placement by name', () => {
    expect(documentBoundaryRequirements('submission_ready', facts({ status: 'locked', ctd_section: 'estar.device' })).join(' '))
      .toMatch(/"estar.device" is not a valid CTD section code/);
  });

  it('approve needs content only (status stays the route\'s check)', () => {
    expect(documentBoundaryRequirements('approved', facts({ status: 'review' }))).toEqual([]);
  });
});
