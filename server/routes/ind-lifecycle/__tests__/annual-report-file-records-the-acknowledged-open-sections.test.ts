/**
 * POST /annual-report/file records WHO acknowledged WHICH open 312.33 sections
 * for WHICH sequence in the audit trail, and refuses report fields that would
 * be ignored beside a draftId.
 *
 * What it used to do (until 2026-10-15): an open section filed with its
 * acknowledgement was recorded only on the HTTP response (openSectionsFiled) —
 * nothing in the audit trail said who acknowledged it; and with a draftId, any
 * report fields in the body were silently ignored (the draft's report is filed).
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

const report = () => ({
  productName: 'ZX-9', indNumber: '123456', reportingPeriodStart: '2025-08-01', reportingPeriodEnd: '2026-08-01',
  studyStatuses: [], safetySummary: 'No new signals.', investigationalPlan: 'Part B.',
});
const OPEN = ['individual_study_status', 'ind_safety_reports_list', 'ib_changes', 'phase1_protocol_modifications', 'foreign_marketing_developments', 'outstanding_business'];
const file = (b: Record<string, unknown>) =>
  request(app()).post('/api/ind-lifecycle/annual-report/file').send({ submissionId: 31, sequenceNumber: '0003', ...b });

const draft = {
  id: 'd-1', submissionId: 31, indNumber: '123456', status: 'draft',
  model: {
    reportType: 'IND_ANNUAL_REPORT', indNumber: '123456', productName: 'AS DRAFTED',
    reportingPeriod: { start: '2025-08-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' },
    sections: [{ key: 'outstanding_business', heading: 'Log', cfrRef: '312.33(g)', dsurRef: '', body: '', complete: false }],
    gaps: [{ sectionKey: 'outstanding_business', heading: 'Log', cfrRef: '312.33(g)', message: 'open' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.renderIndAnnualReportPdf.mockImplementation(async () => Buffer.from('%PDF-1.7 test'));
  m.storeRenderedLeafFile.mockImplementation(async () => ({ id: 77 }));
  m.persistAnnualReport.mockImplementation(async (_s: number, sequenceNumber: string, _c: unknown, _src: unknown, ack?: { sectionKeys: string[] }) => ({
    sequence: { id: 501, sequenceNumber, type: 'annual' },
    leaves: [], leavesAwaitingDocument: [],
    ...(ack ? { gapAcknowledgement: { sectionKeys: ack.sectionKeys, auditTrail: { persisted: true, chained: true } } } : {}),
  }));
});

describe('the acknowledgement of open sections is recorded with the filing', () => {
  it('hands the acknowledged section keys to the filing, which audits them against the sequence', async () => {
    const res = await file({ ...report(), acknowledgedGaps: OPEN });
    expect(res.status).toBe(201);
    expect(m.persistAnnualReport.mock.calls[0][4], 'the acknowledgement never reached the filing').toEqual({ sectionKeys: OPEN });
    expect(res.body.gapAcknowledgement).toEqual({ sectionKeys: OPEN, auditTrail: { persisted: true, chained: true } });
  });

  it('a draft filed with acknowledgeGaps: true records every open section of the draft', async () => {
    m.getAnnualReport.mockResolvedValue(draft);
    const res = await file({ draftId: 'd-1', acknowledgeGaps: true });
    expect(res.status).toBe(201);
    expect(m.persistAnnualReport.mock.calls[0][4]).toEqual({ sectionKeys: ['outstanding_business'] });
  });

  it('a filing with no open section records no acknowledgement', async () => {
    m.getAnnualReport.mockResolvedValue({ ...draft, model: { ...draft.model, gaps: [] } });
    const res = await file({ draftId: 'd-1' });
    expect(res.status).toBe(201);
    expect(m.persistAnnualReport.mock.calls[0][4]).toBeUndefined();
  });
});

describe('report fields beside a draftId are refused, not ignored', () => {
  it('400 naming the fields; nothing is loaded, rendered or filed', async () => {
    m.getAnnualReport.mockResolvedValue(draft);
    const res = await file({ draftId: 'd-1', productName: 'FROM THE BODY', safetySummary: 'x', acknowledgedGaps: ['outstanding_business'] });
    expect(res.status, 'report fields beside a draftId were silently ignored').toBe(400);
    expect(res.body.error.message).toContain('productName');
    expect(res.body.error.message).toContain('safetySummary');
    expect(m.persistAnnualReport).not.toHaveBeenCalled();
  });

  it('indNumber is a check against the draft, not a report field', async () => {
    m.getAnnualReport.mockResolvedValue(draft);
    const res = await file({ draftId: 'd-1', indNumber: '123456', acknowledgedGaps: ['outstanding_business'] });
    expect(res.status).toBe(201);
  });
});
