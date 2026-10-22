/**
 * The boundary's rules are loaded, read and scoped — or the transition is
 * refused with the reason. A rule set that could not be loaded, a rule row
 * that cannot be read, and a rule whose scope cannot be decided are never a
 * silent pass.
 *
 * What the code used to do (until 2026-10-15):
 *   - ensureDefaultRules swallowed a seeding failure ("non-blocking"), so an
 *     organization whose default rules could not be written had no rules, and
 *     a boundary with no rules applied none: the transition was allowed with
 *     nothing checked. The four default rules were also written one by one, so
 *     a failure part-way left a partial set that was never re-seeded;
 *   - a rule applied to every transition between its two boundaries whatever
 *     its artifactTypes / domainTrack / regulatorBody scope said;
 *   - a rule row's required_roles was read `?? []`: NULL meant "no role
 *     required", an object was skipped (`.length` undefined), and a string
 *     threw a TypeError out of evaluateTransition.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GovernanceBoundaryRule } from '../../../shared/schema/operating-system';

const h = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  failSeedContaining: null as string | null,
  transitions: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db', async () => {
  const schema = await import('../../../shared/schema/operating-system');
  return {
    db: {
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown> | Array<Record<string, unknown>>) => ({
          returning: async () => {
            const rows = Array.isArray(v) ? v : [v];
            if (table !== schema.governanceBoundaryRules) {
              h.transitions.push(...rows);
              return rows.map((r) => ({ id: 'transition-1', ...r }));
            }
            // One INSERT statement is all-or-nothing, as in Postgres.
            if (rows.some((r) => r.ruleName === h.failSeedContaining)) {
              throw new Error('insert on table "governance_boundary_rules" violates foreign key constraint');
            }
            const stored = rows.map((r, i) => ({ id: `rule-${h.rules.length + i + 1}`, projectId: null, isActive: true, ...r }));
            h.rules.push(...stored);
            return stored;
          },
        }),
      }),
      select: () => ({ from: () => ({ where: async () => [...h.rules] }) }),
      execute: vi.fn(async () => ({ rows: [] })),
    },
  };
});

import { GovernanceBoundaryService, type TransitionRequest } from '../governance-boundary-service';

const fresh = () => new (GovernanceBoundaryService as unknown as { new (): GovernanceBoundaryService })();

function rule(over: Partial<GovernanceBoundaryRule>): GovernanceBoundaryRule {
  return {
    id: 'rule-scoped', organizationId: 1, projectId: null, ruleName: 'Scoped rule', ruleDescription: null,
    fromBoundary: 'advisory', toBoundary: 'governed_draft',
    requiresReview: false, requiresApproval: false,
    requiresAllAssumptionsApproved: false, requiresAllDecisionsResolved: false,
    minimumConfidence: null, requiredRoles: [], artifactTypes: [], domainTrack: null, regulatorBody: null,
    isActive: true, createdById: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
  } as GovernanceBoundaryRule;
}

/** A service whose rule store holds exactly these rules (no seeding). */
function withRules(rules: GovernanceBoundaryRule[]): GovernanceBoundaryService {
  const s = fresh();
  vi.spyOn(s as unknown as { ensureDefaultRules: () => Promise<void> }, 'ensureDefaultRules').mockResolvedValue(undefined);
  vi.spyOn(s, 'getRules').mockResolvedValue(rules);
  return s;
}

/** No artifact: the contradiction and readiness gates do not run, so only rules decide. */
const DRAFT: TransitionRequest = {
  organizationId: 1, projectId: 10, fromBoundary: 'advisory', toBoundary: 'governed_draft', actorId: 5, actorRole: 'qa_lead',
};

beforeEach(() => {
  h.rules.length = 0;
  h.transitions.length = 0;
  h.failSeedContaining = null;
});

describe('a failed seed of the default rules fails closed', () => {
  it('refuses the transition when the default rules could not be written — never allowed with no rule applied', async () => {
    h.failSeedContaining = 'Advisory to Governed Draft';
    const r = await fresh().evaluateTransition(DRAFT);
    expect(r.allowed, 'a failed seed left no rules and the boundary applied none').toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Governance rules could not be loaded/);
    expect(h.transitions[0]?.transitionAllowed).toBe(false);
  });

  it('writes the four default rules together or not at all, so a failure leaves no partial set', async () => {
    h.failSeedContaining = 'Approved to Locked';
    const r = await fresh().evaluateTransition({ ...DRAFT, fromBoundary: 'approved', toBoundary: 'locked' });
    expect(h.rules, 'the rules written before the failure stayed, and were never re-seeded').toHaveLength(0);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Governance rules could not be loaded/);
  });

  it('seeds the full set once the store accepts it, and the rules then apply (control)', async () => {
    const r = await fresh().evaluateTransition({ ...DRAFT, fromBoundary: 'approved', toBoundary: 'locked' });
    expect(h.rules.map((x) => x.ruleName)).toEqual([
      'Advisory to Governed Draft', 'Governed Draft to Approved', 'Approved to Locked', 'Locked to Submission Ready',
    ]);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Approved to Locked/);
  });
});

describe('a rule applies only where its declared scope matches', () => {
  const byType = rule({ ruleName: 'Overview review', artifactTypes: ['clinical_overview'], requiresReview: true });

  it('does not apply a rule scoped to other artifact types', async () => {
    const r = await withRules([byType]).evaluateTransition({ ...DRAFT, artifactType: 'protocol' } as TransitionRequest);
    expect(r.blockedReasons, 'a rule scoped to clinical_overview was applied to a protocol').toEqual([]);
    expect(r.allowed).toBe(true);
    expect(h.transitions[0]?.ruleId).toBeUndefined();
  });

  it('refuses, naming the undetermined scope, when the request does not state the artifact type', async () => {
    const r = await withRules([byType]).evaluateTransition(DRAFT);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Overview review.*applies only to artifact types clinical_overview.*does not state.*could not be determined/);
  });

  it('applies the rule to a stated type inside its scope (control)', async () => {
    const r = await withRules([byType]).evaluateTransition({ ...DRAFT, artifactType: 'Clinical_Overview' } as TransitionRequest);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Overview review.*requires a review/);
  });

  it('scopes by domain track and by regulator the same way', async () => {
    const byTrack = rule({ ruleName: 'Device review', domainTrack: 'device', requiresReview: true });
    const byRegulator = rule({ ruleName: 'FDA review', regulatorBody: 'FDA', requiresReview: true });
    expect((await withRules([byTrack]).evaluateTransition({ ...DRAFT, domainTrack: 'biotech' } as TransitionRequest)).allowed).toBe(true);
    expect((await withRules([byRegulator]).evaluateTransition({ ...DRAFT, regulatorBody: 'EMA' } as TransitionRequest)).allowed).toBe(true);
    const unstated = await withRules([byTrack, byRegulator]).evaluateTransition(DRAFT);
    expect(unstated.allowed).toBe(false);
    expect(unstated.blockedReasons.join(' ')).toMatch(/Device review.*domain track device.*could not be determined/);
    expect(unstated.blockedReasons.join(' ')).toMatch(/FDA review.*regulator FDA.*could not be determined/);
  });
});

describe('a rule row that cannot be read is an error, not a rule with no requirement', () => {
  it.each([
    ['an object', { role: 'qa_lead' }],
    ['NULL', null],
    ['text', 'qa_lead'],
  ])('refuses when required_roles is %s', async (_label, requiredRoles) => {
    const r = await withRules([rule({ ruleName: 'Role rule', requiredRoles: requiredRoles as unknown as string[] })]).evaluateTransition(DRAFT);
    expect(r.allowed, 'a malformed rule row passed as a rule with no role requirement').toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Governance rules could not be loaded.*Role rule.*required_roles/);
  });

  it('refuses when artifact_types is not a list', async () => {
    const r = await withRules([rule({ ruleName: 'Typed rule', artifactTypes: 'clinical_overview' as unknown as string[] })]).evaluateTransition(DRAFT);
    expect(r.allowed).toBe(false);
    expect(r.blockedReasons.join(' ')).toMatch(/Governance rules could not be loaded.*Typed rule.*artifact_types/);
  });

  it('reads a well-formed role list and says what it checked (control)', async () => {
    const r = await withRules([rule({ ruleName: 'Role rule', requiredRoles: ['qa_lead'] })]).evaluateTransition(DRAFT);
    expect(r.blockedReasons).toEqual([]);
    expect(r.allowed).toBe(true);
    expect(r.metRequirements.join(' ')).toMatch(/actor role "qa_lead" is one of qa_lead/);
  });
});
