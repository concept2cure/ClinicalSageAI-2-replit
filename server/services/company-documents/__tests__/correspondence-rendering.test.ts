import AdmZip from 'adm-zip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeTemplateSpec } from '../../../../shared/templates/template-spec';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
const mocks = vi.hoisted(() => ({ history: vi.fn(), pdf: vi.fn(), convert: vi.fn() }));
vi.mock('../history', () => ({ readCompanyPresentationRevision: mocks.history }));
vi.mock('../../../export/renderers', () => ({ renderHtmlToPdfTracked: mocks.pdf }));
vi.mock('../../pdf-converter', () => ({ convertDocxToPdf: mocks.convert }));
import { companyProfileHash } from '../provenance';
import { AuthoringPdfRenderingError, renderAuthoringExport, sectionsDigest } from '../../authoring/authoring-export';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const profile: CompanyDocumentProfile = { version: 1, revision: 4, companyName: 'Historical company', address: 'Historical address', contact: 'legal@example.test', registrationDetails: 'Company registration 123',
  letterhead: normalizeTemplateSpec({ page: { size: 'a4', orientation: 'landscape' }, brand: { logo: { dataBase64: PNG, mimeType: 'image/png', placement: 'header' }, confidentialityNotice: 'Historical confidentiality' },
    header: { text: 'Historical running header', showLogo: true }, footer: { text: 'Historical footer', showPageNumbers: true } }), importedFrom: null,
  applyToReports: false, applyToSubmissionCorrespondence: true, legalDocuments: [] };
const origin = { version: 1, organizationId: 7, programId: PROGRAM, companyDocumentRevision: 4, companyProfileHash: companyProfileHash(profile), companyBrandingApplied: true };
const executor = { query: async () => ({ rows: [] }) };
const args = () => ({ executor, tenantId: 7, doc: { id: 'doc-1', title: 'Correspondence response', client_program_id: PROGRAM, provenance: { source: 'seed', companyCorrespondence: origin } },
  sections: [{ id: 's1', code: 'correspondence', title: 'Response body', content: '<p><strong>Reviewed body.</strong></p>' }], signatures: [] });
const signature = () => ({ signer_email: 'reviewer@example.test', signer_name: 'Verified reviewer', meaning: 'APPROVER', reason: 'Approve reviewed correspondence',
  method: 'PIN', content_hash: sectionsDigest(args().sections), covered_freeze_version: 'v1', pin_verified: true, signed_at: '2026-10-18T00:00:00Z' });
beforeEach(() => { mocks.history.mockReset().mockResolvedValue(profile); mocks.pdf.mockReset(); mocks.convert.mockReset().mockResolvedValue({ pdf: Buffer.from('%PDF-synthetic-converter-test'), backend: 'libreoffice' }); });

describe('correspondence uses its retained presentation through canonical Authoring exports', () => {
  it('renders actual Word with the historical logo/header/footer, rich body and mandatory signature statement', async () => {
    const out = await renderAuthoringExport({ ...args(), format: 'docx' });
    expect(mocks.history).toHaveBeenCalledWith(executor, 7, 4);
    const zip = new AdmZip(out.fileContent);
    const xml = zip.getEntries().filter(entry => /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(entry.entryName)).map(entry => entry.getData().toString()).join('\n');
    for (const text of ['Historical company', 'Historical address', 'Historical running header', 'Historical confidentiality', 'Historical footer', 'Reviewed body.', 'Electronic signatures', 'No electronic signatures are recorded']) expect(xml).toContain(text);
    expect(xml).toContain('landscape'); expect(xml).toContain('PAGE');
    expect(zip.getEntries().filter(entry => entry.entryName.startsWith('word/media/')).some(entry => entry.getData().equals(Buffer.from(PNG, 'base64')))).toBe(true);
  });

  it('keeps the working-copy banner and excludes signature manifestation while retaining stationery', async () => {
    const out = await renderAuthoringExport({ ...args(), signatures: [signature()], format: 'docx', workingCopy: { banner: 'DRAFT — uncontrolled working copy' } });
    const zip = new AdmZip(out.fileContent);
    const header = zip.getEntries().filter(entry => /^word\/header\d+\.xml$/.test(entry.entryName)).map(entry => entry.getData().toString()).join('\n');
    expect(header).toContain('Historical company'); expect(header).toContain('uncontrolled working copy');
    expect(zip.readAsText('word/document.xml')).toContain('No electronic signature applies to this copy');
    expect(zip.readAsText('word/document.xml')).not.toContain('Verified reviewer');
  });

  it('keeps a covering internal signature manifestation alongside historical company stationery', async () => {
    const out = await renderAuthoringExport({ ...args(), signatures: [signature()], format: 'docx' });
    const zip = new AdmZip(out.fileContent), body = zip.readAsText('word/document.xml');
    expect(body).toContain('Signed by: Verified reviewer'); expect(body).toContain('Meaning: Approval');
    expect(body).toContain('this signature covers the content of this document');
    expect(zip.getEntries().filter(entry => /^word\/header\d+\.xml$/.test(entry.entryName)).map(entry => entry.getData().toString()).join('\n')).toContain('Historical company');
  });

  it('loads an explicitly selected published variant by its immutable key even when automatic application is disabled', async () => {
    const variantId = '44444444-4444-4444-8444-444444444444';
    mocks.history.mockResolvedValue({ ...profile, variantId, applyToSubmissionCorrespondence: false });
    const input = args();
    const out = await renderAuthoringExport({ ...input, doc: { ...input.doc, provenance: { source: 'seed', companyCorrespondence: { ...origin, variantId, explicitSelection: true } } }, format: 'docx' });
    expect(mocks.history).toHaveBeenCalledWith(executor, 7, 4, variantId);
    const zip = new AdmZip(out.fileContent);
    expect(zip.getEntries().filter(entry => /^word\/header\d+\.xml$/.test(entry.entryName)).map(entry => entry.getData().toString()).join('\n')).toContain('Historical company');
  });

  it('converts the same rich historical Word artifact through strict LibreOffice without a fallback', async () => {
    await renderAuthoringExport({ ...args(), format: 'pdf' });
    const [word, options] = mocks.convert.mock.calls[0];
    expect(options).toEqual({ backend: 'libreoffice' }); expect(mocks.pdf).not.toHaveBeenCalled();
    const zip = new AdmZip(word); expect(zip.readAsText('word/document.xml')).toContain('Reviewed body.');
    expect(zip.readAsText('word/document.xml')).toContain('Electronic signatures');
    expect(zip.getEntries().filter(entry => /^word\/header\d+\.xml$/.test(entry.entryName)).map(entry => entry.getData().toString()).join('\n')).toContain('Historical company');
  });

  it('fails closed when the strict converter is unavailable instead of dropping the letterhead', async () => {
    const cause = new Error('LibreOffice unavailable');
    mocks.convert.mockRejectedValue(cause);
    const failure = await renderAuthoringExport({ ...args(), format: 'pdf' }).catch(error => error);
    expect(failure).toBeInstanceOf(AuthoringPdfRenderingError);
    expect(failure).toMatchObject({ status: 503, code: 'PDF_RENDERER_UNAVAILABLE',
      message: 'The formatted PDF could not be completed. Nothing was delivered or filed. Download Word or contact an administrator.' });
    expect(failure.cause).toBe(cause);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it.each(['hash', 'tenant', 'project', 'missing revision'] as const)('refuses %s mismatches before rendering instead of substituting current branding', async mode => {
    const input = args();
    if (mode === 'hash') input.doc.provenance.companyCorrespondence = { ...origin, companyProfileHash: 'b'.repeat(64) };
    if (mode === 'tenant') input.tenantId = 99;
    if (mode === 'project') input.doc.client_program_id = '33333333-3333-4333-8333-333333333333';
    if (mode === 'missing revision') mocks.history.mockRejectedValue(new Error('Retained revision unavailable'));
    await expect(renderAuthoringExport({ ...input, format: 'pdf' })).rejects.toBeTruthy();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.convert).not.toHaveBeenCalled();
  });
});
