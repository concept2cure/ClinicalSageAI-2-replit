/**
 * IND filing flow — END-TO-END against in-process PGlite (no Neon/docker).
 *
 * Exercises the full chain through the REAL submission-service + persistence
 * adapters: create a submission → file an annual report / safety report as an
 * eCTD sequence + leaves pointing at the RETAINED rendered PDF →
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
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { createSubmission, listSubmissions, listSequences, listLeaves } from '../../submission-service/submission-service';
import { persistAnnualReport, persistSafetyReportIntent } from '../ind-lifecycle-persistence';
import { assembleIndSafetyReport } from '../ind-safety-report-service';
import { buildIndPortfolio, buildIndPortfolioEntry, isIndSubmission } from '../ind-portfolio';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };
/* Retained rendered documents the leaves point at. upsertLeaf refuses a
   rendered_leaf_files id that does not resolve in the caller's organization, so
   these are real rows, seeded below. */
let RENDERED_ANNUAL_ID = 0;
let RENDERED_SAFETY_ID = 0;
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
  const seedRendered = async (renderedFrom: string, sectionCode: string, md5: string) => {
    const r = await harness.pglite.query<{ id: number | string }>(
      `INSERT INTO rendered_leaf_files
         (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from, section_code)
       VALUES ($1,$2,$3,$4,'application/pdf',1024,$5,$6,$7) RETURNING id`,
      [ctx.organizationId, `vv-${renderedFrom}`, `sha-${renderedFrom}`, md5, `${renderedFrom}.pdf`, renderedFrom, sectionCode],
    );
    return Number(r.rows[0].id);
  };
  RENDERED_ANNUAL_ID = await seedRendered('ind_annual_report', 'm1.13', 'md5-annual-abc');
  RENDERED_SAFETY_ID = await seedRendered('ind_safety_report', 'm1.12.4', 'md5-safety-xyz');
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

    const { sequence, leaves } = await persistAnnualReport(submission.id, '0001', ctx, {
      documentTable: 'rendered_leaf_files',
      documentId: RENDERED_ANNUAL_ID,
      checksum: 'md5-annual-abc',
    });
    expect(sequence.type).toBe('annual');
    expect(sequence.submissionId).toBe(submission.id);
    expect(leaves).toHaveLength(1);

    // Read back from the DB: the leaf must carry the RESOLVABLE reference, not
    // just a digest — a checksum with no referent is what left every filed
    // lifecycle sequence assembling with zero leaf files (LIFE-01).
    const persisted = await listLeaves(sequence.id, ctx);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].sectionCode).toBe('m1.13');
    expect(persisted[0].checksum).toBe('md5-annual-abc');
    expect(persisted[0].documentTable).toBe('rendered_leaf_files');
    expect(persisted[0].documentId).toBe(RENDERED_ANNUAL_ID);

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
      { 'm1.12.4': { documentTable: 'rendered_leaf_files', documentId: RENDERED_SAFETY_ID, checksum: 'md5-safety-xyz' } },
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

describe('IND portfolio against PGlite', () => {
  it('lists only IND submissions for the org, with per-submission sequence rollups', async () => {
    const portfolioCtx = { organizationId: 50, userId: 9 };
    const ind1 = await createSubmission({ title: 'IND One', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda' }, portfolioCtx);
    await createSubmission({ title: 'IND Two', applicationType: 'ind', clientType: 'pharma', primaryRegion: 'fda' }, portfolioCtx);
    await createSubmission({ title: 'An NDA', applicationType: 'nda', clientType: 'pharma', primaryRegion: 'fda' }, portfolioCtx);
    await persistAnnualReport(ind1.id, '0001', portfolioCtx);

    // Replicate the portfolio route's service-level logic against the real DB.
    const all = await listSubmissions(portfolioCtx);
    const inds = all.filter(isIndSubmission);
    const entries = await Promise.all(inds.map(async (s) => buildIndPortfolioEntry(s, await listSequences(s.id, portfolioCtx))));
    const portfolio = buildIndPortfolio(entries);

    expect(portfolio.totals.submissions).toBe(2); // the NDA is excluded
    expect(portfolio.entries.map((e) => e.title).sort()).toEqual(['IND One', 'IND Two']);
    expect(portfolio.totals.totalSequences).toBe(1); // only ind1 has a sequence
  });
});
