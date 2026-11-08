/**
 * The pre-submission gate says what it assessed, and nothing it did not.
 *
 * - CRL and RTF risk came from regulatory-precedent-intelligence, whose
 *   CRL/RTF families ADR 0013 keeps unwired from the product. On a tenant
 *   whose library is empty — every tenant but those POST /api/tenants seeded
 *   with uncited rates — both answered "low", risk 0, and the verdict read
 *   "CRL/RTF risk acceptable". They are now reported as not assessed.
 * - A missing submission type was assessed and audited as an NDA.
 * - An ICH check that failed read as "not evaluated · no CMC project linked".
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runGovernedIssueParser } from '../../services/regulatory-correspondence/issue-parser';

const LETTER = 'Missing CMC stability data.';
function confirmedSourceRow(text = LETTER) {
  const issue = runGovernedIssueParser(text, 'local').issues.find(item => item.blocker)!;
  const extraction = issue.structuredExtraction!;
  extraction.feedbackCoding!.humanConfirmed = true;
  extraction.humanReview = { reviewedBy: 17, reviewedAt: '2026-11-06T12:00:00.000Z', sourceTextDigest: extraction.sourceTextDigest!, status: 'confirmed' };
  return { id: 'issue-1', correspondence_id: 'local', category: issue.category, blocker: true, human_review_status: 'confirmed',
    resolution_status: 'open', source_excerpt: issue.sourceExcerpt, structured_extraction: extraction, parsed_text: text, direction: 'inbound' };
}

const h = vi.hoisted(() => ({
  assessCRLRisk: vi.fn(),
  generatePreventionReport: vi.fn(),
  runIchComplianceCheck: vi.fn(),
  insert: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../services/orchestration', () => ({
  executeWorkflow: vi.fn(),
  cancelWorkflow: vi.fn(() => true),
  getWorkflowExecution: vi.fn(() => null),
  getProjectWorkflows: vi.fn(() => []),
  getRegisteredTemplates: vi.fn(() => []),
  assembleCrossObjectPayload: vi.fn(async () => ({
    cmcSignals: { sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0,
      contradictionCounts: { critical: 0, open: 0 }, contradictions: [] },
    lastSignalAt: null,
  })),
  computeReadinessAssessment: vi.fn(() => ({
    overallScore: 82, status: 'on_track', scores: {}, unassessedDimensions: [], blockers: [], moduleBreakdown: [],
  })),
  generateRecommendations: vi.fn(() => ({ recommendations: [] })),
  generateContinuitySnapshot: vi.fn(),
  getLatestSnapshot: vi.fn(() => null),
}));
vi.mock('../../services/regulatory-precedent-intelligence', () => ({
  crlTriggerService: { assessCRLRisk: h.assessCRLRisk },
  rtfTriggerService: { generatePreventionReport: h.generatePreventionReport },
}));
vi.mock('../../services/cmc/ich-compliance-checker', () => ({ runIchComplianceCheck: h.runIchComplianceCheck }));
vi.mock('../../db.js', () => ({
  db: { insert: () => ({ values: h.insert }) },
  getPool: () => ({ query: h.query }),
}));

import orchestrationRouter from '../orchestration';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 1, email: 'runner@example.test', role: 'admin', name: 'R. Unner' };
    next();
  });
  a.use('/api/orchestration', orchestrationRouter);
  return a;
}

const LOW = { overallRisk: 'low', riskScore: 0, matchedPatterns: [], trajectoryPrediction: {}, mitigationStrategies: [],
  preventionChecklist: [], estimatedRecoveryDays: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  h.assessCRLRisk.mockResolvedValue(LOW);
  h.generatePreventionReport.mockResolvedValue(LOW);
  h.insert.mockResolvedValue(undefined);
  h.query.mockReset().mockResolvedValue({ rows: [] });
});

describe('POST /pre-submission-gate', () => {
  it('reports CRL and RTF risk as not assessed, and never calls them acceptable', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
    expect(r.status).toBe(200);
    expect(h.assessCRLRisk).not.toHaveBeenCalled();
    expect(h.generatePreventionReport).not.toHaveBeenCalled();
    expect(r.body.crl).toMatchObject({ overallRisk: 'not_assessed', riskScore: null });
    expect(r.body.rtf).toMatchObject({ overallRisk: 'not_assessed', riskScore: null });
    expect(r.body.crl.reason).toMatch(/not assessed/i);
    expect(r.body.verdictRationale.join(' ')).not.toMatch(/CRL\/RTF risk acceptable/);
  });

  it('assesses no submission type it was not given', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7 });
    expect(r.status).toBe(200);
    expect(r.body.submissionType).toBeNull();
  });

  it('reports an ICH check that failed as incomplete, not as no CMC project linked', async () => {
    h.runIchComplianceCheck.mockRejectedValue(new Error('stability read failed'));
    const r = await request(app()).post('/api/orchestration/pre-submission-gate')
      .send({ projectId: 7, submissionType: 'NDA', cmcProjectId: '0b7e1d2a-1111-4222-8333-944455556666' });
    expect(r.status).toBe(200);
    expect(r.body.ich).toMatchObject({ overallStatus: 'incomplete', counts: null });
    expect(r.body.verdict).toBe('conditional');
    expect(r.body.verdictRationale.join(' ')).toMatch(/ICH compliance could not be evaluated/);
  });

  it('says the ICH check was not run when no CMC project was linked', async () => {
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
    expect(r.body.ich).toBeNull();
    expect(r.body.verdictRationale.join(' ')).not.toMatch(/ICH compliance clean/);
  });

  it('holds on real confirmed correspondence blockers, scoped to the tenant, project and submission type', async () => {
    h.query.mockResolvedValue({ rows: [
      confirmedSourceRow(),
    ] });
    const r = await request(app()).post('/api/orchestration/pre-submission-gate')
      .send({ projectId: 7, submissionType: 'NDA', correspondenceReview: { status: 'assessed', blockingIssueIds: [] } });
    expect(r.status).toBe(200);
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining('c.organization_id = $1 AND c.project_id = $2'), [1, 7, 'NDA']);
    expect(h.query.mock.calls[0][0]).toContain('s.organization_id = $1 AND s.project_id = $2');
    expect(h.query.mock.calls[0][0]).toContain("c.direction = 'inbound'");
    expect(r.body.verdict).toBe('hold');
    expect(r.body.correspondenceReview).toMatchObject({ status: 'assessed', blockingIssueIds: ['issue-1'], subjectiveFit: 'not_assessed' });
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({
      newValue: expect.objectContaining({ correspondenceReview: r.body.correspondenceReview }),
    }));
  });

  it('reports unconfirmed blocker classifications as pending human review', async () => {
    h.query.mockResolvedValue({ rows: [
      { id: 'issue-2', blocker: true, human_review_status: 'pending', resolution_status: 'open' },
    ] });
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7 });
    expect(r.status).toBe(200);
    expect(r.body.verdict).toBe('conditional');
    expect(r.body.correspondenceReview.pendingIssueIds).toEqual(['issue-2']);
    expect(h.query.mock.calls[0][1]).toEqual([1, 7, null]);
  });

  it('holds on an unreadable correspondence store without leaking the database failure', async () => {
    h.query.mockRejectedValue(new Error('private database failure details'));
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7 });
    expect(r.status).toBe(200);
    expect(r.body.verdict).toBe('hold');
    expect(r.body.correspondenceReview).toMatchObject({ status: 'unavailable', checkedIssueCount: null });
    expect(JSON.stringify(r.body)).not.toContain('private database failure details');
  });

  it('does not return a successful governed verdict when its audit could not be recorded', async () => {
    h.insert.mockRejectedValue(new Error('audit write unavailable'));
    const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7 });
    expect(r.status).toBe(500);
    expect(r.body.verdict).toBeUndefined();
  });

});

describe('the pre-submission gate reads current tenant sources', () => {
  it('executes the scoped SQL against PostgreSQL semantics and excludes foreign tenants and mismatched parents', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
      // Only the columns this read consumes, with the existing table names.
      // This proves its join/predicate behavior, not the deployment's RLS.
      await db.exec(`
        CREATE TABLE c2c_submissions (id text PRIMARY KEY, organization_id integer, project_id integer, submission_type text);
        CREATE TABLE c2c_correspondence (id text PRIMARY KEY, submission_id text, organization_id integer, project_id integer, direction text, parsed_text text);
        CREATE TABLE c2c_correspondence_issues (id text PRIMARY KEY, correspondence_id text, blocker boolean, human_review_status text, resolution_status text, category text,source_excerpt text,structured_extraction jsonb);
        INSERT INTO c2c_submissions VALUES ('local',1,7,'NDA'),('foreign',2,7,'NDA'),('other-project',1,8,'NDA'),('other-type',1,7,'IND');
        INSERT INTO c2c_correspondence VALUES
          ('local','local',1,7,'inbound',''),('foreign','foreign',2,7,'inbound',''),
          ('mismatched','foreign',1,7,'inbound',''),('other-project','other-project',1,8,'inbound',''),
          ('outbound','local',1,7,'outbound',''),('other-type','other-type',1,7,'inbound','');
        INSERT INTO c2c_correspondence_issues (id,correspondence_id,blocker,human_review_status,resolution_status) VALUES
          ('local-issue','local',true,'confirmed','open'),('foreign-issue','foreign',true,'confirmed','open'),
          ('mismatched-issue','mismatched',true,'confirmed','open'),('other-project-issue','other-project',true,'confirmed','open'),
          ('outbound-issue','outbound',true,'confirmed','open'),('other-type-issue','other-type',true,'confirmed','open');
      `);
      const current = confirmedSourceRow();
      await db.query('UPDATE c2c_correspondence SET parsed_text=$1', [LETTER]);
      await db.query('UPDATE c2c_correspondence_issues SET category=$1,source_excerpt=$2,structured_extraction=$3::jsonb',
        [current.category,current.source_excerpt,JSON.stringify(current.structured_extraction)]);
      h.query.mockImplementation((sql, params) => db.query(sql, params));
      const r = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
      expect(r.status).toBe(200);
      expect(r.body.correspondenceReview).toMatchObject({ checkedIssueCount: 1, blockingIssueIds: ['local-issue'] });
      expect(r.body.verdict).toBe('hold');
      for (const status of ['pending', 'rejected']) {
        await db.query("UPDATE c2c_correspondence_issues SET human_review_status=$1 WHERE id='local-issue'", [status]);
        const updated = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
        expect(updated.body.correspondenceReview.blockingIssueIds).toEqual([]);
        expect(updated.body.verdict).toBe(status === 'pending' ? 'conditional' : 'ready');
      }
      const subjective = confirmedSourceRow('Please improve the clarity and risk framing of the safety presentation.');
      await db.query("UPDATE c2c_correspondence SET parsed_text=$1 WHERE id='local'", [subjective.parsed_text]);
      await db.query("UPDATE c2c_correspondence_issues SET human_review_status='confirmed',category=$1,source_excerpt=$2,structured_extraction=$3::jsonb WHERE id='local-issue'",
        [subjective.category,subjective.source_excerpt,JSON.stringify(subjective.structured_extraction)]);
      const fit = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
      expect(fit.body.correspondenceReview).toMatchObject({ blockingIssueIds: [], pendingIssueIds: [], subjectiveFit: 'not_assessed' });
      await db.exec("UPDATE c2c_correspondence SET parsed_text='Changed letter' WHERE id='local'");
      const stale = await request(app()).post('/api/orchestration/pre-submission-gate').send({ projectId: 7, submissionType: 'NDA' });
      expect(stale.body.correspondenceReview).toMatchObject({ blockingIssueIds: [], pendingIssueIds: ['local-issue'] });
      expect(stale.body.verdict).toBe('conditional');
    } finally {
      await db.close();
    }
  }, 60_000);
});
