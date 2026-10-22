/**
 * A change a person makes to a decision, an assumption or a contradiction's
 * resolution is logged down its dependency cascade as that person.
 *
 * What the code used to do (until 2026-10-15): reactiveDependencyService.
 * propagateChange logs `triggered_by` as the actor its caller states, or as the
 * named machine actor (system+reactive-dependency@…) when none is stated. These
 * callers stated none although each holds the acting user:
 * decisionRecordService.transition (performedBy), assumptionRegistryService.
 * supersede (performedBy) and updateStatus (reviewedBy), and the contradiction
 * resolution bridge (the request's userId). A cascade a person started was
 * logged as the machine. (The contradiction engine's createFinding still states
 * none: a finding is raised by a detector run, which is given no user.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  propagate: vi.fn(),
  orchestrate: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));
vi.mock('../reactive-dependency-service', () => ({
  reactiveDependencyService: { propagateChange: (input: unknown) => H.propagate(input) },
}));
vi.mock('../contradiction-engine-service', () => ({
  contradictionEngineService: { detectAssumptionDrift: async () => [] },
}));
vi.mock('../resolution/ana-resolution-orchestrator', () => ({
  orchestrateResolution: (...a: unknown[]) => H.orchestrate(...a),
}));
vi.mock('../resolution/resolution-planner', () => ({ getProjectResolutionPlans: async () => [] }));
vi.mock('../resolution/bundle-builder', () => ({ getProjectBundles: async () => [] }));

import { decisionRecordService } from '../decision-record-service';
import { assumptionRegistryService } from '../assumption-registry-service';
import { resolveContradiction } from '../resolution/contradiction-resolution-bridge';
import type { ContradictionFinding } from '../contradiction-engine-service';

const NOW = new Date('2026-10-15T00:00:00Z');
const DECISION_ROW = { id: 'dec-1', organization_id: 3, project_id: 12, title: 'Primary endpoint', action_state: 'approved', created_at: NOW, updated_at: NOW };
const ASSUMPTION_ROW = { id: 'asm-1', organization_id: 3, project_id: 12, title: 'Comparator dose', status: 'superseded', created_at: NOW, updated_at: NOW };

/** The one cascade the call started, once its non-blocking propagation has run. */
async function cascade(): Promise<{ triggeredBy?: string; triggerType: string }> {
  await vi.waitFor(() => expect(H.propagate).toHaveBeenCalledTimes(1));
  return H.propagate.mock.calls[0][0];
}

beforeEach(() => {
  H.query.mockReset().mockImplementation(async (sql: string) =>
    ({ rows: [/assumption_records/.test(String(sql)) ? ASSUMPTION_ROW : DECISION_ROW], rowCount: 1 }));
  H.propagate.mockReset().mockResolvedValue({ downstreamImpacted: 0, actions: [] });
  H.orchestrate.mockReset();
});

describe('decisionRecordService.transition', () => {
  it('logs the cascade as the user who performed the transition', async () => {
    await decisionRecordService.transition('dec-1', { organizationId: 3, actionState: 'approved', performedBy: '41' });
    const input = await cascade();
    expect(input.triggerType).toBe('decision_approved');
    expect(input.triggeredBy, 'the cascade was logged as the machine actor').toBe('41');
  });
});

describe('assumptionRegistryService', () => {
  it('supersede logs the cascade as the user who superseded', async () => {
    await assumptionRegistryService.supersede('asm-1', {
      organizationId: 3, replacementId: 'asm-2', reason: 'Dose revised after PK', performedBy: '41',
    });
    const input = await cascade();
    expect(input.triggerType).toBe('assumption_superseded');
    expect(input.triggeredBy).toBe('41');
  });

  it('updateStatus logs a withdrawal as the user who withdrew it', async () => {
    await assumptionRegistryService.updateStatus('asm-1', 3, 'withdrawn', '41');
    const input = await cascade();
    expect(input.triggerType).toBe('assumption_withdrawn');
    expect(input.triggeredBy).toBe('41');
  });
});

describe('the contradiction resolution bridge', () => {
  it('logs each executed step as the user who resolved the contradiction', async () => {
    H.orchestrate.mockResolvedValue({
      decision: 'execute',
      decisionRationale: 'Harmonise the two endpoint definitions',
      receipt: {
        bundleId: 'bundle-1',
        executedSteps: [{ targetType: 'artifact', targetId: 'art-9', targetTitle: 'SAP 9.1', stepType: 'updated', priorState: 'draft', newState: 'draft' }],
        requiresReview: [],
        requiresReapproval: [],
        summary: { executed: 1, prepared: 0, blocked: 0 },
      },
    });
    const finding = {
      id: 'finding-1', organizationId: 3, projectId: 12, contradictionType: 'assumption_drift', severity: 'high',
      authorityState: 'advisory_only', title: 'Endpoint drift', description: 'Protocol and SAP differ',
      objectAType: 'assumption', objectAId: 'asm-1', objectBType: 'assumption', objectBId: 'asm-2',
      confidenceScore: 0.9, reviewState: 'unresolved',
    } as unknown as ContradictionFinding;

    const result = await resolveContradiction({ organizationId: 3, userId: 41, projectId: 12, findingId: 'finding-1', finding });

    expect(result.preflightRefreshTriggered).toBe(true);
    const input = await cascade();
    expect(input.triggerType).toBe('contradiction_resolved');
    expect(input.triggeredBy).toBe('41');
  });
});
