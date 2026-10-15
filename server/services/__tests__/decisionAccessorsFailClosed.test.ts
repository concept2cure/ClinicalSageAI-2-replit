/**
 * Decision records live in in-memory Maps. There is no FORCE'd RLS behind
 * them, so whatever these accessors decide IS the tenant boundary.
 *
 * Passing `organizationId` at every call site is a convention, and a
 * convention is only as good as the next call site somebody adds. The
 * accessors have to fail closed on their own: no tenant supplied must mean
 * no records, never every record. Otherwise the one caller that forgets
 * reads across every organization on the platform and nothing catches it.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// A preflight decision is recorded durably or not at all (2026-10-15); the
// ledger write is stood in for so the accessors have a record to scope.
vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: { create: vi.fn(async () => ({ id: 'row_1' })) },
}));

const ORG_A = 1;
const ORG_B = 2;
const PROJECT = '77001';

let svc: typeof import('../decision-lifecycle-service').decisionLifecycleService;

beforeAll(async () => {
  ({ decisionLifecycleService: svc } = await import('../decision-lifecycle-service'));
  await svc.recordPreflightDecision({
    projectId: PROJECT,
    organizationId: ORG_A,
    kind: 'section-preflight-judgment',
    sectionCode: '2.5',
    moduleCode: 'm2',
    overall: 'blocked',
    summary: 'Org A only',
    sourceSignals: [],
    // A decision names who made it; with no user it is refused (2026-10-15).
    createdById: 'u1',
  });
});

describe('decision accessors fail closed without a tenant', () => {
  it('getProjectDecisions returns the owning tenant its own records', () => {
    expect(svc.getProjectDecisions(PROJECT, { organizationId: ORG_A })).toHaveLength(1);
  });

  it('getProjectDecisions returns nothing to a different tenant', () => {
    expect(svc.getProjectDecisions(PROJECT, { organizationId: ORG_B })).toEqual([]);
  });

  it('getProjectDecisions with NO tenant returns nothing, not everything', () => {
    expect(svc.getProjectDecisions(PROJECT, { limit: 50 })).toEqual([]);
    expect(svc.getProjectDecisions(PROJECT)).toEqual([]);
  });

  it('getDecisionContext with NO tenant returns nothing', () => {
    expect(svc.getDecisionContext(PROJECT, { limit: 10 })).toEqual([]);
  });

  it('getContradictionDecisionContext with NO tenant returns nothing', () => {
    expect(svc.getContradictionDecisionContext(PROJECT, { limit: 10 })).toEqual([]);
  });

  it('computeDecisionAwareStatus with NO tenant sees no decisions', () => {
    const status = svc.computeDecisionAwareStatus(PROJECT, {});
    expect(status.blockedDecisions).toEqual([]);
    expect(status.pendingApprovals).toBe(0);
    expect(status.pendingConfirmations).toBe(0);
  });

  it('getDecision by id with NO tenant returns nothing', () => {
    const [own] = svc.getProjectDecisions(PROJECT, { organizationId: ORG_A });
    expect(own).toBeDefined();
    // The id is a real, valid id — only the tenant argument is missing.
    expect(svc.getDecision(own.id)).toBeUndefined();
    expect(svc.getDecision(own.id, ORG_A)).toBeDefined();
    expect(svc.getDecision(own.id, ORG_B)).toBeUndefined();
  });
});
