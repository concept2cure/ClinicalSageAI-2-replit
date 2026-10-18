import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATE_SPEC } from '../../../shared/templates/template-spec';
import type { CompanyDesignDetail } from '../../../shared/company-document-designs';

const h = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn(), stage: vi.fn(), review: vi.fn(), publish: vi.fn(), activate: vi.fn(),
  audit: vi.fn(), rejectAudit: false, authenticated: true }));
vi.mock('../../services/company-documents/profile', () => ({
  context: async () => {
    if (!h.authenticated) throw Object.assign(new Error('Current membership required'), { status: 403, code: 'AUTH_REQUIRED' });
    return { organizationId: 7, userId: 4 };
  },
  companyDocumentsFailure: (error: { status?: number; code?: string; message?: string }) => ({ status: error.status ?? 500,
    code: error.code ?? 'COMPANY_DOCUMENTS_UNAVAILABLE', message: error.message ?? 'Could not load company designs' }),
}));
vi.mock('../../services/company-documents/designs', () => ({
  readCompanyDesign: h.read, listCompanyDesigns: h.list, stageCompanyDesign: h.stage,
  reviewCompanyDesign: h.review, publishCompanyDesign: h.publish, activateCompanyDefaultDesign: h.activate,
}));
vi.mock('../../services/templates', async () => ({
  renderDocxWithTemplate: (await import('../../services/templates/templateRenderAdapter')).renderDocxWithTemplate,
}));
vi.mock('../../services/export/governedExportConsequence', () => ({
  isUnauditedExportRefusal: (error: { code?: string }) => error.code === 'AUDIT_LOST',
  sendAuditedDownload: async (res: express.Response, envelope: { buffer: Buffer; filename: string; mimeType: string }) => {
    h.audit(envelope);
    if (h.rejectAudit) throw Object.assign(new Error('Audit unavailable'), { code: 'AUDIT_LOST' });
    res.setHeader('Content-Type', envelope.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${envelope.filename}"`);
    res.send(envelope.buffer);
  },
}));
vi.mock('../../services/submission-service/submission-request-read', () => ({ SubmissionReadError: class extends Error {} }));
import router from '../company-document-designs';

const app = express(); app.use(express.json()); app.use('/company', router);
const ID = '11111111-1111-4111-8111-111111111111';
const HASH = 'a'.repeat(64);
function entry(): CompanyDesignDetail {
  const spec = globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC);
  spec.header = { text: 'Controlled running header', alignment: 'left' };
  spec.brand.confidentialityNotice = 'Customer confidential';
  return { design: { id: ID, name: 'Published Japan subsidiary', templateId: 'tpl_test', state: 'published', sha256: HASH,
    scope: { programId: null, market: 'JP', language: null, subsidiary: null }, createdBy: 3, createdAt: '2026-10-18T00:00:00Z',
    reviewedBy: 4, reviewedAt: '2026-10-18T01:00:00Z', publishedBy: 4, publishedAt: '2026-10-18T02:00:00Z',
    publishedRevision: 1, publishedProfileHash: 'b'.repeat(64) },
  candidate: { companyName: 'Actual subsidiary identity', address: 'Recorded address', contact: 'Recorded contact', registrationDetails: '',
    letterhead: spec, importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false }, changedFields: ['companyName'],
  canReview: false, canPublish: false, reviewBlocker: 'Already published', publishBlocker: 'Already published',
  canActivateDefault: false, activationBlocker: 'This design has a restricted market.' };
}
beforeEach(() => {
  vi.clearAllMocks(); h.read.mockResolvedValue(entry()); h.rejectAudit = false; h.authenticated = true;
});

describe('named company design proof delivery', () => {
  it('routes explicit default activation to the canonical profile response and preserves truthful refusals', async () => {
    const body = { expectedRevision: 7, expectedHash: HASH, reason: 'Activate the independently reviewed default',
      applyToReports: true, applyToSubmissionCorrespondence: false };
    h.activate.mockResolvedValueOnce({ data: { revision: 8, approvedDefaultDesignId: ID }, canManage: true });
    const response = await request(app).post(`/company/designs/${ID}/activate-default`).send(body);
    expect(response.status).toBe(200); expect(response.body.data.revision).toBe(8);
    expect(h.activate.mock.calls[0][1]).toBe(ID); expect(h.activate.mock.calls[0][2]).toEqual(body);
    h.activate.mockRejectedValueOnce(Object.assign(new Error('Only an organization-wide design may be activated.'),
      { status: 409, code: 'COMPANY_DEFAULT_SCOPED_DESIGN' }));
    const refused = await request(app).post(`/company/designs/${ID}/activate-default`).send(body);
    expect(refused.status).toBe(409); expect(refused.body.error).toBe('COMPANY_DEFAULT_SCOPED_DESIGN');
    expect(refused.body).not.toHaveProperty('data');
  });

  it('renders the exact persisted candidate through the canonical Word factory and records its variant/hash', async () => {
    const response = await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: HASH });
    expect(response.status).toBe(200);
    const buffer = h.audit.mock.calls[0][0].buffer as Buffer;
    const zip = await JSZip.loadAsync(buffer);
    const document = await zip.file('word/document.xml')!.async('string');
    const header = await zip.file('word/header1.xml')!.async('string');
    expect(document).toContain('PUBLISHED STATIONERY DESIGN PROOF');
    expect(document).toContain('does not establish legal sufficiency');
    expect(header).toContain('Actual subsidiary identity');
    expect(header).toContain('Recorded address');
    expect(header).toContain('Controlled running header');
    expect(h.audit.mock.calls[0][0].metadata).toMatchObject({ designId: ID, designHash: HASH, variantId: ID, companyDocumentRevision: 1 });
    expect(h.stage).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled();
  });

  it('labels unreviewed proof as a draft and does not claim publication', async () => {
    const draft = entry(); draft.design.state = 'draft'; draft.design.publishedRevision = null; h.read.mockResolvedValue(draft);
    const response = await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: HASH });
    expect(response.status).toBe(200);
    const zip = await JSZip.loadAsync(h.audit.mock.calls[0][0].buffer);
    expect(await zip.file('word/document.xml')!.async('string')).toContain('NOT PUBLISHED');
    expect(h.audit.mock.calls[0][0].metadata.variantId).toBeNull();
  });

  it('refuses a stale hash or a changed candidate during rendering before audited delivery', async () => {
    expect((await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: 'c'.repeat(64) })).status).toBe(409);
    const changed = entry(); changed.design.sha256 = 'd'.repeat(64);
    h.read.mockReset().mockResolvedValueOnce(entry()).mockResolvedValueOnce(changed);
    expect((await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: HASH })).status).toBe(409);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('delivers no document when current membership or mandatory audit is unavailable', async () => {
    h.authenticated = false;
    expect((await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: HASH })).status).toBe(403);
    expect(h.audit).not.toHaveBeenCalled();
    h.authenticated = true; h.rejectAudit = true;
    const response = await request(app).post(`/company/designs/${ID}/proof`).send({ expectedHash: HASH });
    expect(response.status).toBe(503); expect(response.body.error).toBe('UNAUDITED_EXPORT_REFUSED');
    expect(response.headers['content-disposition']).toBeUndefined();
  });
});
