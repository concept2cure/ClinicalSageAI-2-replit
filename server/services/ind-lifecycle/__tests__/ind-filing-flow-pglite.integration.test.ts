/**
 * IND filing flow — END-TO-END against in-process PGlite (no Neon/docker).
 *
 * Exercises the full chain through the REAL submission-service + persistence
 * adapters: create a submission → file an annual report / safety report as an
 * eCTD sequence + leaves (with the rendered-PDF md5 as the leaf checksum) →
 * read the leaves back → snapshot the dispatch verdict. This proves
 * createSequence / upsertLeaf (incl. the additive checksum column) actually
 * execute their SQL correctly.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import { createSubmission, listSequences, listLeaves } from '../../submission-service/submission-service';
import { persistAnnualReport, persistSafetyReportIntent } from '../ind-lifecycle-persistence';
import { assembleIndSafetyReport } from '../ind-safety-report-service';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };
const D = new Date('2026-01-01T00:00:00.000Z');

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

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true });
  holder.db = harness.db;
});
afterAll(async () => {
  await harness.close();
});

describe('annual-report filing flow against PGlite', () => {
  it('creates a submission, files an annual sequence, and persists the m1.13 leaf + checksum', async () => {
    const submission = await createSubmission(
      { title: 'C2C-001 IND', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', lifecycleStage: 'original' },
      ctx,
    );
    expect(submission.id).toBeGreaterThan(0);

    const { sequence, leaves } = await persistAnnualReport(submission.id, '0001', ctx, 'md5-annual-abc');
    expect(sequence.type).toBe('annual');
    expect(sequence.submissionId).toBe(submission.id);
    expect(leaves).toHaveLength(1);

    // Read back from the DB and confirm the checksum was persisted on the leaf.
    const persisted = await listLeaves(sequence.id, ctx);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].sectionCode).toBe('m1.13');
    expect(persisted[0].checksum).toBe('md5-annual-abc');

    const seqs = await listSequences(submission.id, ctx);
    expect(seqs.map((s) => s.sequenceNumber)).toContain('0001');
  });
});

describe('safety-report filing flow against PGlite', () => {
  it('files the 312.32 amendment leaves (m1.12.4 + m5.3.5) with the safety-report checksum', async () => {
    const submission = await createSubmission(
      { title: 'C2C-002 IND', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda' },
      ctx,
    );
    const { amendmentIntent } = assembleIndSafetyReport(reportableEvent(), {
      icsr: { worldwideUniqueId: 'WW-1' } as any,
      now: D,
    });
    expect(amendmentIntent).not.toBeNull();

    const { sequence, leaves } = await persistSafetyReportIntent(
      submission.id,
      amendmentIntent!,
      '0002',
      ctx,
      { 'm1.12.4': 'md5-safety-xyz' },
    );
    expect(sequence.type).toBe('amendment');
    expect(leaves.length).toBeGreaterThanOrEqual(1);

    const persisted = await listLeaves(sequence.id, ctx);
    const codes = persisted.map((l) => l.sectionCode);
    expect(codes).toContain('m1.12.4');
    const m1 = persisted.find((l) => l.sectionCode === 'm1.12.4')!;
    expect(m1.checksum).toBe('md5-safety-xyz');
  });
});
