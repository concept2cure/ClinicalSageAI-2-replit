/**
 * IND lifecycle registers — persistence END-TO-END against in-process PGlite.
 *
 * Exercises the three durable register services that back the audit's
 * "persist lifecycle records" finding — ind-safety-report-persistence (21 CFR
 * 312.32), ind-annual-report-persistence (312.33) and ind-amendment-persistence
 * (312.30/.31) — through their REAL SQL paths (insert/select/update with
 * RETURNING, jsonb roundtrips). Proves for each register:
 *   - persist → retrieve roundtrip (create returns the stored row's id; get
 *     reads it back with the jsonb payload intact),
 *   - org scoping on read AND write (a foreign org can neither fetch, list,
 *     nor mark-filed another org's rows),
 *   - canonical audit emission (DRAFTED / FILED actions with the row id),
 *   - the draft → filed lifecycle and its effect on the overdue feeds.
 *
 * The audit sink is mocked (audit_logs lives in the core schema, out of scope
 * for this IND-table harness) so emissions can be asserted.
 */

import { describe, it, expect, beforeAll, afterAll, vi, type Mock } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import type {
  AdverseEvent,
  EventType,
  SeriousnessCriteria,
  Causality,
  Outcome,
} from '../../compliance/pharmacovigilanceService';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));

import auditService from '../../auditService';
import {
  createSafetyReportDraft,
  listSafetyReports,
  getSafetyReport,
  markSafetyReportFiled,
  listOverdueSafetyReports,
  SafetyReportError,
} from '../ind-safety-report-persistence';
import {
  createAnnualReportDraft,
  listAnnualReports,
  getAnnualReport,
  markAnnualReportFiled,
  listOverdueAnnualReports,
  AnnualReportError,
} from '../ind-annual-report-persistence';
import {
  createAmendmentDraft,
  listAmendments,
  getAmendment,
  markAmendmentFiled,
  AmendmentError,
} from '../ind-amendment-persistence';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };
const foreignCtx = { organizationId: 2, userId: 8 };
const D = new Date('2026-01-01T00:00:00.000Z');

/** Audit calls recorded for a given action (the sink is a vi.fn). */
function auditCalls(action: string): any[] {
  return (auditService.logAction as unknown as Mock).mock.calls
    .map((c) => c[0])
    .filter((p) => p?.action === action);
}

function reportableEvent(id = 'ae-1'): AdverseEvent {
  return {
    id,
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

const annualReportInput = () => ({
  projectId: 'proj-1',
  indNumber: '123456',
  productName: 'C2C-001',
  // ISO strings on purpose: exercises the persistence module's date coercion.
  reportingPeriodStart: '2026-01-01T00:00:00.000Z',
  reportingPeriodEnd: '2026-12-31T00:00:00.000Z',
  studyStatuses: [],
  safetyReportsInPeriod: [],
  ibChanges: [],
});

const amendmentInput = () => ({
  indNumber: '123456',
  projectId: 'proj-1',
  changedDocuments: [
    {
      documentId: 'doc-1',
      title: 'Revised Protocol v2',
      category: 'protocol_amendment_summary' as const,
      changeKind: 'revised' as const,
      replacesLeafGuid: 'guid-1',
    },
  ],
});

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
});
afterAll(async () => {
  await harness.close();
});

describe('safety-report register (312.32) against PGlite', () => {
  it('persists a draft and reads it back with the jsonb payload intact', async () => {
    const row = await createSafetyReportDraft({ submissionId: 7, event: reportableEvent() }, ctx);
    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBe(1); // from ctx, never request input
    expect(row.status).toBe('draft');
    expect(row.obligation).toBe('SEVEN_DAY'); // fatal/life-threatening + unexpected
    expect(row.reportingWindowDays).toBe(7);
    expect(row.deadline).toBeTruthy();

    const got = await getSafetyReport(row.id, ctx);
    expect(got.id).toBe(row.id);
    expect((got.classification as any).obligation).toBe('SEVEN_DAY');
    expect((got.document as any).sections?.length).toBeGreaterThan(0);

    const list = await listSafetyReports(7, ctx);
    expect(list.map((r) => r.id)).toContain(row.id);
  });

  it('emits the canonical DRAFTED audit action with the persisted id', async () => {
    const row = await createSafetyReportDraft({ submissionId: 7, event: reportableEvent('ae-audit') }, ctx);
    const emitted = auditCalls('IND_SAFETY_REPORT_DRAFTED');
    const mine = emitted.find((p) => p.resourceId === row.id);
    expect(mine).toBeTruthy();
    expect(mine.organizationId).toBe(1);
    expect(mine.userId).toBe(9);
    expect(mine.resourceType).toBe('ind_safety_report');
    expect(mine.details.adverseEventId).toBe('ae-audit');
  });

  it('refuses to persist a non-reportable event (fail-closed) and audits nothing', async () => {
    const notReportable: AdverseEvent = {
      ...reportableEvent('ae-nr'),
      causality: 'unrelated' as Causality,
      expectedness: 'expected (listed in IB)',
    };
    const before = (await listSafetyReports(7, ctx)).length;
    const drafted = auditCalls('IND_SAFETY_REPORT_DRAFTED').length;
    await expect(createSafetyReportDraft({ submissionId: 7, event: notReportable }, ctx)).rejects.toThrow(
      SafetyReportError,
    );
    expect((await listSafetyReports(7, ctx)).length).toBe(before);
    expect(auditCalls('IND_SAFETY_REPORT_DRAFTED').length).toBe(drafted);
  });

  it('does not leak or mutate across organizations', async () => {
    const row = await createSafetyReportDraft({ submissionId: 7, event: reportableEvent('ae-org') }, ctx);
    await expect(getSafetyReport(row.id, foreignCtx)).rejects.toThrow(SafetyReportError);
    expect((await listSafetyReports(7, foreignCtx)).map((r) => r.id)).not.toContain(row.id);
    await expect(markSafetyReportFiled(row.id, 42, foreignCtx)).rejects.toThrow(SafetyReportError);
    // The foreign write attempt must not have changed the row.
    expect((await getSafetyReport(row.id, ctx)).status).toBe('draft');
  });

  it('marks a draft filed (audited) and drops it from the overdue feed', async () => {
    const row = await createSafetyReportDraft({ submissionId: 8, event: reportableEvent('ae-file') }, ctx);
    // Deadline (Jan 2026 + 7d) is in the past relative to the default asOf=now.
    expect((await listOverdueSafetyReports(8, ctx)).map((r) => r.id)).toContain(row.id);

    const filed = await markSafetyReportFiled(row.id, 42, ctx);
    expect(filed.status).toBe('filed');
    expect(filed.sequenceId).toBe(42);
    expect(filed.filedAt).toBeTruthy();

    expect((await listOverdueSafetyReports(8, ctx)).map((r) => r.id)).not.toContain(row.id);

    const emitted = auditCalls('IND_SAFETY_REPORT_FILED').find((p) => p.resourceId === row.id);
    expect(emitted).toBeTruthy();
    expect(emitted.details.sequenceId).toBe(42);
  });
});

describe('annual-report register (312.33) against PGlite', () => {
  it('persists a draft (with the 60-day due date) and reads it back', async () => {
    const row = await createAnnualReportDraft(
      { submissionId: 11, report: annualReportInput(), indEffectiveDate: '2026-01-01' },
      ctx,
    );
    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBe(1);
    expect(row.status).toBe('draft');
    expect(row.indNumber).toBe('123456');
    expect(row.dueDate).toBeTruthy();
    expect(typeof row.gapCount).toBe('number');

    const got = await getAnnualReport(row.id, ctx);
    expect(got.id).toBe(row.id);
    expect((got.model as any).indNumber).toBe('123456');
    expect((got.model as any).sections?.length).toBeGreaterThan(0);

    expect((await listAnnualReports(11, ctx)).map((r) => r.id)).toContain(row.id);

    const emitted = auditCalls('IND_ANNUAL_REPORT_DRAFTED').find((p) => p.resourceId === row.id);
    expect(emitted).toBeTruthy();
    expect(emitted.organizationId).toBe(1);
    expect(emitted.resourceType).toBe('ind_annual_report');
  });

  it('does not leak or mutate across organizations', async () => {
    const row = await createAnnualReportDraft({ submissionId: 11, report: annualReportInput() }, ctx);
    await expect(getAnnualReport(row.id, foreignCtx)).rejects.toThrow(AnnualReportError);
    expect((await listAnnualReports(11, foreignCtx)).map((r) => r.id)).not.toContain(row.id);
    await expect(markAnnualReportFiled(row.id, 43, foreignCtx)).rejects.toThrow(AnnualReportError);
    expect((await getAnnualReport(row.id, ctx)).status).toBe('draft');
  });

  it('overdue feed includes an unfiled past-due draft; filing (audited) drops it', async () => {
    const row = await createAnnualReportDraft(
      { submissionId: 12, report: annualReportInput(), indEffectiveDate: '2026-01-01' },
      ctx,
    );
    const farFuture = new Date('2035-01-01T00:00:00.000Z');
    expect((await listOverdueAnnualReports(12, ctx, farFuture)).map((r) => r.id)).toContain(row.id);

    const filed = await markAnnualReportFiled(row.id, 43, ctx);
    expect(filed.status).toBe('filed');
    expect(filed.sequenceId).toBe(43);

    expect((await listOverdueAnnualReports(12, ctx, farFuture)).map((r) => r.id)).not.toContain(row.id);

    const emitted = auditCalls('IND_ANNUAL_REPORT_FILED').find((p) => p.resourceId === row.id);
    expect(emitted).toBeTruthy();
    expect(emitted.details.sequenceId).toBe(43);
  });

  it('refuses a draft with no reporting period dates (VALIDATION) and persists nothing', async () => {
    // Absent dates used to coerce to 1 January 1970 and the draft was stored
    // as a report covering the epoch.
    const before = (await listAnnualReports(31, ctx)).length;
    const noStart: Record<string, unknown> = { ...annualReportInput() };
    delete noStart.reportingPeriodStart;
    await expect(createAnnualReportDraft({ submissionId: 31, report: noStart }, ctx)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      createAnnualReportDraft({ submissionId: 31, report: { ...annualReportInput(), reportingPeriodEnd: 'not a date' } }, ctx),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await listAnnualReports(31, ctx)).length).toBe(before);
  });

  it('a draft without an indEffectiveDate has no due date and never turns overdue', async () => {
    const row = await createAnnualReportDraft({ submissionId: 13, report: annualReportInput() }, ctx);
    expect(row.dueDate).toBeNull();
    expect((await listOverdueAnnualReports(13, ctx, new Date('2099-01-01'))).map((r) => r.id)).not.toContain(row.id);
  });
});

describe('amendment register (312.30/.31) against PGlite', () => {
  it('plans + persists a draft and reads the stored plan back', async () => {
    const row = await createAmendmentDraft({ submissionId: 21, amendment: amendmentInput() }, ctx);
    expect(row.id).toBeTruthy();
    expect(row.organizationId).toBe(1);
    expect(row.status).toBe('draft');
    expect(row.indNumber).toBe('123456');
    expect(row.amendmentClasses).toEqual(['protocol']);
    expect(row.leafCount).toBe(2); // the changed document + the auto cover letter
    expect(row.warningCount).toBe(0);

    const got = await getAmendment(row.id, ctx);
    expect(got.id).toBe(row.id);
    expect((got.plan as any).sequenceType).toBe('amendment');
    expect((got.plan as any).leaves).toHaveLength(2);
    const stored = (got.plan as any).leaves.find((l: any) => l.documentId === 'doc-1');
    expect(stored).toMatchObject({ documentId: 'doc-1', parentLeafGuid: 'guid-1', sectionCode: 'm1.2', lifecycleOp: 'replace' });

    expect((await listAmendments(21, ctx)).map((r) => r.id)).toContain(row.id);

    const emitted = auditCalls('IND_AMENDMENT_DRAFTED').find((p) => p.resourceId === row.id);
    expect(emitted).toBeTruthy();
    expect(emitted.organizationId).toBe(1);
    expect(emitted.resourceType).toBe('ind_amendment');
    expect(emitted.details.leafCount).toBe(2);
  });

  it('does not leak or mutate across organizations', async () => {
    const row = await createAmendmentDraft({ submissionId: 21, amendment: amendmentInput() }, ctx);
    await expect(getAmendment(row.id, foreignCtx)).rejects.toThrow(AmendmentError);
    expect((await listAmendments(21, foreignCtx)).map((r) => r.id)).not.toContain(row.id);
    await expect(markAmendmentFiled(row.id, 44, foreignCtx)).rejects.toThrow(AmendmentError);
    expect((await getAmendment(row.id, ctx)).status).toBe('draft');
  });

  it('marks a draft filed and emits the canonical FILED audit action', async () => {
    const row = await createAmendmentDraft({ submissionId: 22, amendment: amendmentInput() }, ctx);
    const filed = await markAmendmentFiled(row.id, 44, ctx);
    expect(filed.status).toBe('filed');
    expect(filed.sequenceId).toBe(44);
    expect(filed.filedAt).toBeTruthy();

    const emitted = auditCalls('IND_AMENDMENT_FILED').find((p) => p.resourceId === row.id);
    expect(emitted).toBeTruthy();
    expect(emitted.details.sequenceId).toBe(44);
  });

  it('rejects an empty amendment (nothing to file) without persisting', async () => {
    const before = (await listAmendments(23, ctx)).length;
    await expect(
      createAmendmentDraft({ submissionId: 23, amendment: { ...amendmentInput(), changedDocuments: [] } }, ctx),
    ).rejects.toThrow(/IND_AMENDMENT_NO_DOCUMENTS/);
    expect((await listAmendments(23, ctx)).length).toBe(before);
  });
});
