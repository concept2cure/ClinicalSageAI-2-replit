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

import { persistSafetyReportIntent, persistAmendmentPlan, persistAnnualReport } from '../ind-lifecycle-persistence';
import { validateSequenceLeaves } from '../ind-sequence-validation';
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
    // The intent's own leaves PLUS the Module 1 transmittal pair every
    // post-original IND sequence carries.
    expect(upsertLeaf).toHaveBeenCalledTimes(amendmentIntent!.leaves.length + 2);
    // Every leaf is scoped to the created sequence and carries its section code.
    for (const call of upsertLeaf.mock.calls) {
      expect(call[0].sequenceId).toBe(42);
      expect(call[1]).toBe(ctx);
    }
    expect(result.leaves).toHaveLength(amendmentIntent!.leaves.length + 2);
    const codes = upsertLeaf.mock.calls.map((c) => c[0].sectionCode);
    expect(codes).toContain('m1.12.4');
    expect(codes).toContain('m1.1');
    expect(codes).toContain('m1.2');
  });

  it('files a sequence that passes the platform’s own required-placement set', async () => {
    // Before the transmittal pair was placed, a filed 312.32 safety report
    // carried m1.12.4 and nothing else — invalid against ind-sequence-validation
    // from the moment it was created, so the dispatch gate refused a sequence
    // the product had just reported as filed.
    const { amendmentIntent } = assembleIndSafetyReport(reportableEvent(), { icsr: null, now: D });
    await persistSafetyReportIntent(7, amendmentIntent!, '0001', ctx);
    const filed = upsertLeaf.mock.calls.map((c) => ({
      sectionCode: c[0].sectionCode,
      documentType: c[0].documentType,
    }));
    const verdict = validateSequenceLeaves({ filingType: 'safety_report', leaves: filed });
    expect(verdict.missing).toEqual([]);
    expect(verdict.valid).toBe(true);
  });

  it('names the required leaves it created with no document behind them', async () => {
    const { amendmentIntent } = assembleIndSafetyReport(reportableEvent(), { icsr: null, now: D });
    const result = await persistSafetyReportIntent(7, amendmentIntent!, '0001', ctx, {
      'm1.12.4': { documentTable: 'rendered_leaf_files', documentId: 77, checksum: 'deadbeef' },
    });
    // The report itself has bytes; the transmittal pair does not yet.
    expect(result.leavesAwaitingDocument).toEqual(expect.arrayContaining(['m1.1', 'm1.2']));
    expect(result.leavesAwaitingDocument).not.toContain('m1.12.4');
  });
});

describe('persistAnnualReport', () => {
  it('creates an "annual" sequence with a single m1.13 leaf', async () => {
    const result = await persistAnnualReport(7, '0003', ctx);
    expect(createSequence).toHaveBeenCalledWith(
      { submissionId: 7, region: 'fda', sequenceNumber: '0003', type: 'annual' },
      ctx,
    );
    // m1.13 plus the transmittal pair (Form 1571 at m1.1, cover letter at m1.2).
    expect(upsertLeaf).toHaveBeenCalledTimes(3);
    const annual = upsertLeaf.mock.calls.map((c) => c[0]).find((l) => l.sectionCode === 'm1.13');
    expect(annual).toMatchObject({ sequenceId: 42, sectionCode: 'm1.13', lifecycleOp: 'new' });
    expect(result.leaves).toHaveLength(3);
    const verdict = validateSequenceLeaves({
      filingType: 'annual',
      leaves: upsertLeaf.mock.calls.map((c) => ({ sectionCode: c[0].sectionCode, documentType: c[0].documentType })),
    });
    expect(verdict.valid).toBe(true);
  });

  it('points the m1.13 leaf at the retained rendered document when one was stored', async () => {
    // The contract is a leaf SOURCE, not a bare md5: a checksum alone left the
    // leaf unresolvable and the sequence permanently dispatch-blocked (LIFE-01).
    await persistAnnualReport(7, '0004', ctx, {
      'm1.13': { documentTable: 'rendered_leaf_files', documentId: 91, checksum: 'abc123md5' },
    });
    const annual = upsertLeaf.mock.calls.map((c) => c[0]).find((l) => l.sectionCode === 'm1.13');
    expect(annual).toMatchObject({
      sectionCode: 'm1.13',
      documentTable: 'rendered_leaf_files',
      documentId: 91,
      checksum: 'abc123md5',
    });
  });

  it('files the leaf as metadata when nothing was retained — never a checksum with no referent', async () => {
    await persistAnnualReport(7, '0006', ctx);
    const leaf = upsertLeaf.mock.calls.map((c) => c[0]).find((l) => l.sectionCode === 'm1.13')!;
    expect(leaf.sectionCode).toBe('m1.13');
    expect(leaf.documentTable).toBeUndefined();
    expect(leaf.checksum).toBeUndefined();
  });
});

describe('persistSafetyReportIntent — leaf-source pass-through', () => {
  it('points the matching section leaf at the retained rendered document', async () => {
    const { amendmentIntent } = assembleIndSafetyReport(reportableEvent(), { icsr: null, now: D });
    await persistSafetyReportIntent(7, amendmentIntent!, '0005', ctx, {
      'm1.12.4': { documentTable: 'rendered_leaf_files', documentId: 77, checksum: 'deadbeef' },
    });
    const m1Leaf = upsertLeaf.mock.calls.map((c) => c[0]).find((l) => l.sectionCode === 'm1.12.4');
    expect(m1Leaf).toMatchObject({
      documentTable: 'rendered_leaf_files',
      documentId: 77,
      checksum: 'deadbeef',
    });
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
    // The planner already adds its own m1.2 cover letter, so only Form 1571
    // (m1.1) is added here — the pair is matched on documentType, not section.
    expect(upsertLeaf).toHaveBeenCalledTimes(plan.leaves.length + 1);
    expect(result.leaves).toHaveLength(plan.leaves.length + 1);
    const filedCodes = upsertLeaf.mock.calls.map((c) => c[0].sectionCode);
    expect(filedCodes.filter((c) => c === 'm1.2')).toHaveLength(1);
    expect(filedCodes).toContain('m1.1');
    // lifecycleOp is carried through (revised → replace, added → new).
    const ops = upsertLeaf.mock.calls.map((c) => c[0].lifecycleOp);
    expect(ops).toContain('replace');
    expect(ops).toContain('new');
  });
});
