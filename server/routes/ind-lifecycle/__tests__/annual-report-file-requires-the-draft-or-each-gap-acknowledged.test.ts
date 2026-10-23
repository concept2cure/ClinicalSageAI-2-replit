/**
 * POST /annual-report/file files a 312.33 report with an open section only when
 * the filer has acknowledged that section — or the named, reviewed draft is
 * what is filed.
 *
 * What the route used to do (until 2026-10-15):
 *   - without a draftId it filed whatever report the body held, every open
 *     312.33 section included, and never looked at the gaps it had just
 *     computed — the IND screen's "File into sequence" filed four or more open
 *     sections, unacknowledged, every time;
 *   - with no productName / indNumber in the body it still filed an `annual`
 *     sequence, with no report behind its m1.13 leaf;
 *   - with a draftId it gated on the DRAFT's gaps but rendered the filed PDF
 *     from the BODY, so a complete draft could carry an incomplete filing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../db', () => ({ db: {} }));

const m = vi.hoisted(() => ({
  persistAnnualReport: vi.fn(),
  storeRenderedLeafFile: vi.fn(),
  renderIndAnnualReportPdf: vi.fn(),
  getAnnualReport: vi.fn(),
  markAnnualReportFiled: vi.fn(),
}));
vi.mock('../../../services/ind-lifecycle/ind-lifecycle-persistence', () => ({
  persistAnnualReport: m.persistAnnualReport,
  persistSafetyReportIntent: vi.fn(),
  persistAmendmentPlan: vi.fn(),
}));
vi.mock('../../../services/ectd/rendered-leaf-files', () => ({
  storeRenderedLeafFile: m.storeRenderedLeafFile,
  leafSourceFor: (stored: { id: number }) => ({ documentTable: 'rendered_leaf_files', documentId: stored.id, checksum: 'md5' }),
}));
vi.mock('../../../services/ind-lifecycle/ind-document-renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/ind-lifecycle/ind-document-renderer')>()),
  renderIndAnnualReportPdf: m.renderIndAnnualReportPdf,
}));
vi.mock('../../../services/ind-lifecycle/ind-annual-report-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/ind-lifecycle/ind-annual-report-persistence')>()),
  getAnnualReport: m.getAnnualReport,
  markAnnualReportFiled: m.markAnnualReportFiled,
}));

import filingRoutes from '../filing.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  a.use('/api/ind-lifecycle', filingRoutes);
  return a;
}

/** What the IND screen's annual-report card sends: five 312.33 sections are open. */
const cardReport = () => ({
  productName: 'ZX-9 First-in-Human',
  indNumber: '123456',
  reportingPeriodStart: '2025-08-01',
  reportingPeriodEnd: '2026-08-01',
  studyStatuses: [],
  safetySummary: 'No new signals.',
  investigationalPlan: 'Complete Part B dose expansion.',
});
const OPEN = ['individual_study_status', 'ind_safety_reports_list', 'ib_changes', 'phase1_protocol_modifications', 'foreign_marketing_developments', 'outstanding_business'];

const file = (b: Record<string, unknown>) =>
  request(app()).post('/api/ind-lifecycle/annual-report/file').send({ submissionId: 31, sequenceNumber: '0003', ...b });

beforeEach(() => {
  vi.clearAllMocks();
  m.renderIndAnnualReportPdf.mockImplementation(async () => Buffer.from('%PDF-1.7 test'));
  m.storeRenderedLeafFile.mockImplementation(async () => ({ id: 77 }));
  m.persistAnnualReport.mockImplementation(async (_s: number, sequenceNumber: string) => ({
    sequence: { id: 501, sequenceNumber, type: 'annual' },
    leaves: [{ sectionCode: 'm1.13', documentId: 77 }],
    leavesAwaitingDocument: [],
  }));
});

describe('without a draft — each open section is acknowledged by the filer, or nothing is filed', () => {
  it('refuses 409 naming every open section when none is acknowledged; nothing is rendered or filed', async () => {
    const res = await file(cardReport());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GAPS_NOT_ACKNOWLEDGED');
    expect(res.body.error.openGaps.map((g: { sectionKey: string }) => g.sectionKey)).toEqual(OPEN);
    expect(res.body.error.message).toContain('Individual Study Information (312.33(a))');
    expect(m.persistAnnualReport).not.toHaveBeenCalled();
    expect(m.storeRenderedLeafFile).not.toHaveBeenCalled();
  });

  it('a partial acknowledgement is refused, naming only what is still unacknowledged', async () => {
    const res = await file({ ...cardReport(), acknowledgedGaps: OPEN.slice(1) });
    expect(res.status).toBe(409);
    expect(res.body.error.openGaps.map((g: { sectionKey: string }) => g.sectionKey)).toEqual(['individual_study_status']);
    expect(m.persistAnnualReport).not.toHaveBeenCalled();
  });

  it('acknowledging each one files it, and the response names the sections filed open', async () => {
    const res = await file({ ...cardReport(), acknowledgedGaps: OPEN });
    expect(res.status).toBe(201);
    expect(res.body.filedWithOpenGaps).toBe(OPEN.length);
    expect(res.body.openSectionsFiled).toEqual(OPEN);
    expect(m.persistAnnualReport.mock.calls[0][3]).toMatchObject({ 'm1.13': { documentId: 77 } });
  });

  it('a complete report needs no acknowledgement', async () => {
    const res = await file({
      ...cardReport(),
      studyStatuses: [{ studyId: 'ZX9-101', title: 'FIH', phase: '1', status: 'ongoing' }],
      noSafetyReportsInPeriod: true,
      noIbChangesInPeriod: true,
      phase1ProtocolModifications: 'None of significance.',
      foreignMarketingDevelopments: 'Not marketed anywhere.',
      outstandingBusiness: 'No outstanding business.',
    });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('filedWithOpenGaps');
  });

  it('with neither a draft nor a report to file, it refuses 400 — no annual sequence without a report', async () => {
    const res = await file({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/draftId/);
    expect(m.persistAnnualReport).not.toHaveBeenCalled();
  });
});

describe('with a draft — the reviewed draft is what is filed', () => {
  const draft = {
    id: 'd-1',
    submissionId: 31,
    indNumber: '123456',
    status: 'draft',
    gapCount: 1,
    model: {
      reportType: 'IND_ANNUAL_REPORT',
      indNumber: '123456',
      productName: 'AS DRAFTED',
      reportingPeriod: { start: '2025-08-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
      sections: [{ key: 'outstanding_business', heading: 'Log of Outstanding Business with FDA', cfrRef: '312.33(g)', dsurRef: 'E2F §2', body: '', complete: false }],
      gaps: [{ sectionKey: 'outstanding_business', heading: 'Log of Outstanding Business with FDA', cfrRef: '312.33(g)', message: 'open' }],
    },
  };

  it('renders the PDF from the draft\'s stored report, not from the body', async () => {
    m.getAnnualReport.mockResolvedValue(draft);
    m.markAnnualReportFiled.mockResolvedValue({ ...draft, status: 'filed', sequenceId: 501 });
    // 2026-10-15: report fields beside a draftId are refused (400), no longer
    // silently ignored, so the draft alone is sent.
    const res = await file({ indNumber: '123456', draftId: 'd-1', acknowledgedGaps: ['outstanding_business'] });
    expect(res.status).toBe(201);
    expect(m.renderIndAnnualReportPdf).toHaveBeenCalledTimes(1);
    expect(m.renderIndAnnualReportPdf.mock.calls[0][0].productName).toBe('AS DRAFTED');
    expect(res.body.openSectionsFiled).toEqual(['outstanding_business']);
  });

  it('an open section of the draft is still refused until acknowledged', async () => {
    m.getAnnualReport.mockResolvedValue(draft);
    const res = await file({ draftId: 'd-1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRAFT_INCOMPLETE');
    expect(m.persistAnnualReport).not.toHaveBeenCalled();
  });
});
