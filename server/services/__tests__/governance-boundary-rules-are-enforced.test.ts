/**
 * A boundary rule's requirements are checked, or the transition is refused
 * with the reason — and an allowed transition says what was checked.
 *
 * What the code used to do (until 2026-10-15): evaluateTransition matched a
 * rule and then checked only part of it, and recorded the transition as allowed
 * under that rule:
 *   - requiresReview: an empty block ("recorded as an advisory signal" — it was
 *     recorded nowhere);
 *   - requiresApproval: never read;
 *   - minimumConfidence: skipped when no decisionId was given, and skipped when
 *     the named decision was not on record; a decision of another project could
 *     satisfy it;
 *   - requiredRoles: skipped when no actor role was given;
 *   - requiresAllAssumptionsApproved / requiresAllDecisionsResolved: skipped
 *     when no project was identified.
 * POST /mark-submission-ready then recorded "… strong confidence. Ready for
 * submission." for a strong-confidence rule that never ran. And a document
 * promotion with no actor ran the readiness fabric as actor 'system', which
 * records a governed decision in that name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GovernanceBoundaryRule } from '../../../shared/schema/operating-system';

const h = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  queries: [] as string[],
  unsettledAssumptions: 0,
  unresolvedDecisions: 0,
  decision: null as null | { confidence_level: string | null },
  artifact: null as null | Record<string, unknown>,
  fabricActor: [] as string[],
}));

/** The text of a drizzle sql`` object, to tell its queries apart. */
function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((c) => (Array.isArray((c as { value?: unknown }).value) ? ((c as { value: string[] }).value).join('') : ''))
    .join(' ');
}

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { returning: async () => [{ id: 'transition-1', ...row }] };
      },
    }),
    execute: vi.fn(async (query: unknown) => {
      const text = sqlText(query);
      h.queries.push(text);
      if (text.includes('FROM assumption_records')) return { rows: [{ unsettled: h.unsettledAssumptions }] };
      if (text.includes('confidence_level')) return { rows: h.decision ? [h.decision] : [] };
      if (text.includes('FROM decision_records')) return { rows: [{ unresolved: h.unresolvedDecisions }] };
      if (text.includes('FROM concept2cure_artifacts')) return { rows: h.artifact ? [h.artifact] : [] };
      throw new Error(`unexpected query: ${text}`);
    }),
  },
}));

vi.mock('../contradiction-engine-service.js', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: async () => ({ blocked: false, blockingFindings: [], warningFindings: [] }),
  },
}));

vi.mock('../../src/control-plane/governed-document-evaluator.js', () => ({
  evaluateGovernedDocument: (input: { context: { actorId: string } }) => {
    h.fabricActor.push(input.context.actorId);
    return { evaluation: { readiness: { level: 'ready', blockers: [] } } };
  },
}));

import { GovernanceBoundaryService, type TransitionRequest } from '../governance-boundary-service';

function rule(over: Partial<GovernanceBoundaryRule>): GovernanceBoundaryRule {
  return {
    id: 'rule-1', organizationId: 1, projectId: null, ruleName: 'Test rule', ruleDescription: null,
    fromBoundary: 'locked', toBoundary: 'submission_ready',
    requiresReview: false, requiresApproval: false,
    requiresAllAssumptionsApproved: false, requiresAllDecisionsResolved: false,
    minimumConfidence: null, requiredRoles: [], artifactTypes: [], domainTrack: null, regulatorBody: null,
    isActive: true, createdById: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as GovernanceBoundaryRule;
}

function service(rules: GovernanceBoundaryRule[]): GovernanceBoundaryService {
  const s = new (GovernanceBoundaryService as unknown as { new (): GovernanceBoundaryService })();
  vi.spyOn(s as unknown as { ensureDefaultRules: () => Promise<void> }, 'ensureDefaultRules').mockResolvedValue(undefined);
  vi.spyOn(s, 'getRules').mockResolvedValue(rules);
  return s;
}

const READY: TransitionRequest = {
  organizationId: 1, projectId: 10, artifactId: 77,
  fromBoundary: 'locked', toBoundary: 'submission_ready',
  actorId: 5, actorRole: 'submission_lead',
};

/** The seeded "Locked to Submission Ready" rule. */
const LOCKED_TO_READY = rule({
  ruleName: 'Locked to Submission Ready',
  requiresAllAssumptionsApproved: true, requiresAllDecisionsResolved: true, minimumConfidence: 'strong',
});

beforeEach(() => {
  h.inserted.length = 0;
  h.queries.length = 0;
  h.fabricActor.length = 0;
  h.unsettledAssumptions = 0;
  h.unresolvedDecisions = 0;
  h.decision = null;
  h.artifact = { status: 'locked', content: 'Clinical overview text.', content_hash: 'abc', citations: [{ id: 'c1' }], ctd_section: 'm2.5', type: 'clinical_overview' };
});

describe('review and approval requirements are not passed unchecked', () => {
  it('a rule requiring review refuses, naming the review it cannot see', async () => {
    const r = await service([rule({ ruleName: 'Advisory to Governed Draft', fromBoundary: 'advisory', toBoundary: 'governed_draft', requiresReview: true })])
      .evaluateTransition({ ...READY, fromBoundary: 'advisory', toBoundary: 'governed_draft' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Advisory to Governed Draft.*requires a review/);
    expect(h.inserted[0].transitionAllowed).toBe(false);
  });

  it('a rule requiring approval refuses, naming the approval it cannot see', async () => {
    h.artifact = { ...h.artifact, status: 'review' };
    const r = await service([rule({ ruleName: 'Governed Draft to Approved', fromBoundary: 'governed_draft', toBoundary: 'approved', requiresApproval: true })])
      .evaluateTransition({ ...READY, fromBoundary: 'governed_draft', toBoundary: 'approved' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Governed Draft to Approved.*requires an explicit approval/);
  });
});

describe('a minimum confidence is rated against a recorded decision, or refused', () => {
  it('refuses when no decision is named to rate, naming decisionId', async () => {
    const r = await service([LOCKED_TO_READY]).evaluateTransition(READY);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/at least "strong".*no decision was named \(decisionId\)/);
  });

  it('refuses when the named decision is not on record', async () => {
    const r = await service([LOCKED_TO_READY]).evaluateTransition({ ...READY, decisionId: 'dec-missing' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/decision dec-missing is not on record/);
  });

  it('reads the decision within this project, not anywhere in the organization', async () => {
    h.decision = { confidence_level: 'high' };
    await service([LOCKED_TO_READY]).evaluateTransition({ ...READY, decisionId: 'dec-1' });
    const confidenceQuery = h.queries.find((q) => q.includes('confidence_level')) ?? '';
    expect(confidenceQuery).toMatch(/project_id/);
  });

  it('refuses a decision that records no confidence (control: unchanged)', async () => {
    h.decision = { confidence_level: null };
    const r = await service([LOCKED_TO_READY]).evaluateTransition({ ...READY, decisionId: 'dec-1' });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/confidence could not be compared/);
  });

  it('allows a decision whose recorded confidence meets the minimum, and says what was checked', async () => {
    h.decision = { confidence_level: 'high' };
    const r = await service([LOCKED_TO_READY]).evaluateTransition({ ...READY, decisionId: 'dec-1' });
    expect(r.blockedReasons).toEqual([]);
    expect(r.allowed).toBe(true);
    const met = (r as { metRequirements?: string[] }).metRequirements ?? [];
    expect(met.join(' ')).toMatch(/decision dec-1 records confidence "high", which meets the minimum "strong"/);
    expect(met.join(' ')).toMatch(/every assumption in the project is approved/);
    expect(met.join(' ')).toMatch(/no decision in the project is unresolved/);
    expect(met.join(' ')).toMatch(/Contradiction gate/);
    expect(met.join(' ')).toMatch(/Document readiness gate: artifact 77 has content, is locked and is placed at m2.5/);
  });
});

describe('the other requirements are not skipped for a missing input', () => {
  it('a rule requiring a role refuses when no actor role is given', async () => {
    const r = await service([rule({ requiredRoles: ['submission_lead'] })])
      .evaluateTransition({ ...READY, actorRole: undefined });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/requires one of the roles submission_lead.*no actor role was given/);
  });

  it('a rule requiring approved assumptions refuses when no project is identified', async () => {
    const r = await service([rule({ requiresAllAssumptionsApproved: true })])
      .evaluateTransition({ ...READY, projectId: 0, artifactId: undefined });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/every assumption to be approved.*no project was identified/);
  });

  it('a rule requiring resolved decisions refuses when no project is identified', async () => {
    const r = await service([rule({ requiresAllDecisionsResolved: true })])
      .evaluateTransition({ ...READY, projectId: 0, artifactId: undefined });
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/every decision to be resolved.*no project was identified/);
  });
});

describe('a document promotion names its actor (finding 27)', () => {
  it('does not run the readiness fabric — which records a decision — as "system" when no actor is given', async () => {
    h.artifact = { ...h.artifact, status: 'review' };
    const r = await service([]).evaluateTransition({ ...READY, fromBoundary: 'governed_draft', toBoundary: 'approved', actorId: undefined });
    expect(h.fabricActor).toEqual([]);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/requires an identified actor/);
  });

  it('runs it as the actor given (control)', async () => {
    h.artifact = { ...h.artifact, status: 'review' };
    const r = await service([]).evaluateTransition({ ...READY, fromBoundary: 'governed_draft', toBoundary: 'approved' });
    expect(h.fabricActor).toEqual(['5']);
    expect(r.allowed).toBe(true);
  });
});
