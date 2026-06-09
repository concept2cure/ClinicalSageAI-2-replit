/**
 * IND lifecycle persistence adapter — verifies that safety-report intents and
 * amendment plans are routed into submission-service as an amendment sequence +
 * its leaves. submission-service is mocked, so no DB is touched: we assert the
 * orchestration (createSequence once; upsertLeaf once per leaf, with the right
 * section codes / lifecycle ops scoped to the sequence).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSequence, upsertLeaf } = vi.hoisted(() => ({
  createSequence: vi.fn(async (input: any, _ctx: any) => ({ id: 42, ...input })),
  upsertLeaf: vi.fn(async (input: any, _ctx: any) => ({ id: Math.floor(Math.random() * 1000), ...input })),
}));

vi.mock('../../submission-service/submission-service', () => ({ createSequence, upsertLeaf }));

import { persistSafetyReportIntent, persistAmendmentPlan } from '../ind-lifecycle-persistence';
import { assembleIndSafetyReport } from '../ind-safety-report-service';
import { planIndAmendment } from '../ind-amendment-service';
import type {
  AdverseEvent,
  EventType,
  SeriousnessCriteria,
  Causality,
  Outcome,
} from '../../compliance/pharmacovigilanceService';

const D = new Date('2026-01-01T00:00:00.000Z');
const ctx = { organizationId: 1, userId: 9 };

function reportableEvent(): AdverseEvent {
  return {
    id: 'ae-1',
    organizationId: 'org-1',
    projectId: 'proj-1',
    eventType: 'SAE' as EventType,
    patientId: 'subj-001',
    eventDescription: 'Acute hepatic failure.',
    onsetDate: D,
    reportDate: D,
    seriousnessCriteria: 'life_threatening' as SeriousnessCriteria,
    causality: 'probable' as Causality,
    outcome: 'not_recovered' as Outcome,
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: D,
    reportedToAuthorities: false,
    expeditedReportRequired: true,
    expectedness: 'unexpected',
    createdAt: D,
  };
}

beforeEach(() => {
  createSequence.mockClear();
  upsertLeaf.mockClear();
});

describe('persistSafetyReportIntent', () => {
  it('creates one amendment sequence and a leaf per intent leaf', async () => {
    const { amendmentIntent } = assembleIndSafetyReport(reportableEvent(), { icsr: null, now: D });
    expect(amendmentIntent).not.toBeNull();

    const result = await persistSafetyReportIntent(7, amendmentIntent!, '0001', ctx);

    expect(createSequence).toHaveBeenCalledTimes(1);
    expect(createSequence).toHaveBeenCalledWith(
      { submissionId: 7, region: 'fda', sequenceNumber: '0001', type: 'amendment' },
      ctx,
    );
    expect(upsertLeaf).toHaveBeenCalledTimes(amendmentIntent!.leaves.length);
    // Every leaf is scoped to the created sequence and carries its section code.
    for (const call of upsertLeaf.mock.calls) {
      expect(call[0].sequenceId).toBe(42);
      expect(call[1]).toBe(ctx);
    }
    expect(result.leaves).toHaveLength(amendmentIntent!.leaves.length);
    expect(upsertLeaf.mock.calls.map((c) => c[0].sectionCode)).toContain('m1.12.4');
  });
});

describe('persistAmendmentPlan', () => {
  it('creates an amendment sequence and persists each planned leaf', async () => {
    const plan = planIndAmendment({
      organizationId: 'org-1',
      projectId: 'proj-1',
      indNumber: '123456',
      changedDocuments: [
        { documentId: 'd1', title: 'Revised Protocol v2', category: 'protocol', changeKind: 'revised', replacesLeafGuid: 'guid-1' },
        { documentId: 'd2', title: 'CMC update', category: 'cmc', changeKind: 'added' },
      ],
    });

    const result = await persistAmendmentPlan(7, plan, '0002', ctx);

    expect(createSequence).toHaveBeenCalledWith(
      { submissionId: 7, region: 'fda', sequenceNumber: '0002', type: plan.sequenceType },
      ctx,
    );
    expect(upsertLeaf).toHaveBeenCalledTimes(plan.leaves.length);
    expect(result.leaves).toHaveLength(plan.leaves.length);
    // lifecycleOp is carried through (revised → replace, added → new).
    const ops = upsertLeaf.mock.calls.map((c) => c[0].lifecycleOp);
    expect(ops).toContain('replace');
    expect(ops).toContain('new');
  });
});
