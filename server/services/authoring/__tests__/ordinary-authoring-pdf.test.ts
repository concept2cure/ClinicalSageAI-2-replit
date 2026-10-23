import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { Packer } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ convert: vi.fn(), html: vi.fn() }));
vi.mock('../../pdf-converter', () => ({ convertDocxToPdf: mocks.convert }));
vi.mock('../../../export/renderers', () => ({ renderHtmlToPdfTracked: mocks.html }));

import { renderAuthoringExport, sectionsDigest, type RenderExportArgs } from '../authoring-export';
import { ConversionCapacityError } from '../../conversion-slots';

const SAFE_MESSAGE = 'The formatted PDF could not be completed. Nothing was delivered or filed. Download Word or contact an administrator.';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const input = (): RenderExportArgs => ({
  executor: { query: async () => ({ rows: [] }) }, tenantId: 7,
  doc: { id: '11111111-1111-4111-8111-111111111111', title: 'Ordinary clinical overview', status: 'APPROVED' },
  sections: [{ id: 's1', code: '2.5', title: 'Overview', content:
    `<p>A <strong>reviewed</strong> ordinary document.</p><table><tr><th>Dose</th><th>Finding</th></tr>` +
    `<tr><td>10 mg</td><td>Retained result</td></tr></table><img src="${PNG}" alt="Study figure">` }],
  format: 'pdf', signatures: [],
});
const word = () => new AdmZip(mocks.convert.mock.calls[0][0] as Buffer);
let pdf: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  const document = await PDFDocument.create();
  document.addPage().drawText('Synthetic strict-converter output');
  pdf = Buffer.from(await document.save());
  mocks.convert.mockResolvedValue({ pdf, backend: 'libreoffice' });
  mocks.html.mockResolvedValue({ buffer: pdf, usedFallback: false });
});

describe('ordinary Authoring PDFs share the rich Word converter', () => {
  it('supplies real rich Word to the strict converter and hashes the actual returned PDF', async () => {
    const args = input();
    args.signatures = [{ signer_email: 'reviewer@example.test', signer_name: 'Reviewed signer', meaning: 'APPROVER',
      reason: 'Approved', method: 'PIN', content_hash: sectionsDigest(args.sections),
      covered_freeze_version: '1', pin_verified: true, signed_at: '2026-10-23T00:00:00Z' }];
    const output = await renderAuthoringExport(args);
    expect(mocks.convert).toHaveBeenCalledOnce();
    expect(mocks.convert.mock.calls[0][1]).toEqual({ backend: 'libreoffice' });
    expect(mocks.html).not.toHaveBeenCalled();
    const zip = word(), body = zip.readAsText('word/document.xml');
    expect(body).toContain('<w:tbl>');
    for (const text of ['Ordinary clinical overview', '10 mg', 'Retained result', 'Signed by: Reviewed signer',
      'this signature covers the content of this document']) expect(body).toContain(text);
    expect(zip.getEntries().some(entry => entry.entryName.startsWith('word/media/'))).toBe(true);
    expect(output).toMatchObject({ fileContent: pdf, rendering: 'formatted', contentType: 'application/pdf',
      fileName: 'Ordinary_clinical_overview.pdf', artifactSha256: createHash('sha256').update(pdf).digest('hex') });
  });

  it('carries repeated working-copy banners and its signature disclaimer in the converted Word input', async () => {
    await renderAuthoringExport({ ...input(), workingCopy: { banner: 'DRAFT — uncontrolled working copy' } });
    expect(mocks.convert).toHaveBeenCalledOnce();
    const zip = word();
    const banners = zip.getEntries().filter(entry => /^word\/(?:header|footer)\d+\.xml$/.test(entry.entryName));
    expect(banners).toHaveLength(2);
    for (const entry of banners) expect(entry.getData().toString()).toContain('uncontrolled working copy');
    expect(zip.readAsText('word/document.xml')).toContain('No electronic signature applies to this copy');
  });

  it('retains pending insertions and deletions as genuine Word revisions at the converter boundary', async () => {
    const args = input();
    args.sections[0].content = '<p>Dose <ins data-author-name="Writer" data-at="2026-10-23T00:00:00Z">20 mg</ins>' +
      '<del data-author-name="Reviewer" data-at="2026-10-23T00:00:00Z">10 mg</del>.</p>';
    await renderAuthoringExport(args);
    expect(mocks.convert).toHaveBeenCalledOnce();
    const body = word().readAsText('word/document.xml');
    expect(body).toMatch(/<w:ins\b/); expect(body).toMatch(/<w:del\b/);
    expect(body).toContain('unresolved tracked changes');
  });

  it('returns a safe definite conversion refusal while keeping the original failure private', async () => {
    const cause = new Error('LibreOffice failed at /private/converter/path with confidential diagnostics');
    mocks.convert.mockRejectedValue(cause);
    const error = await renderAuthoringExport(input()).then(() => null, failure => failure);
    expect(error).toMatchObject({ name: 'AuthoringPdfRenderingError', status: 503,
      code: 'PDF_RENDERER_UNAVAILABLE', message: SAFE_MESSAGE });
    expect(error.cause).toBe(cause);
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(false);
    expect(JSON.stringify(error)).not.toContain('/private/converter/path');
    expect(mocks.html).not.toHaveBeenCalled();
  });

  it('preserves the canonical capacity refusal and retry delay', async () => {
    const busy = new ConversionCapacityError('libreoffice', 120_000, 2, 45);
    mocks.convert.mockRejectedValue(busy);
    await expect(renderAuthoringExport(input())).rejects.toBe(busy);
    expect(busy).toMatchObject({ code: 'CONVERTER_BUSY', retryAfterSeconds: 45 });
    expect(mocks.html).not.toHaveBeenCalled();
  });

  it('does not relabel a Word-building failure as a converter failure', async () => {
    const cause = new Error('The source Word document could not be built');
    const packing = vi.spyOn(Packer, 'toBuffer').mockRejectedValueOnce(cause);
    try {
      await expect(renderAuthoringExport(input())).rejects.toBe(cause);
      expect(mocks.convert).not.toHaveBeenCalled();
    } finally { packing.mockRestore(); }
  });

  it('keeps source refusals ahead of rendering and leaves Word/XML independent of PDF availability', async () => {
    const args = input();
    args.doc.provenance = { projectSourceReferences: [{ sectionCode: '2.5', sources: 'malformed' }] };
    await expect(renderAuthoringExport(args)).rejects.toMatchObject({ code: 'SOURCE_REFERENCES_UNAVAILABLE' });
    mocks.convert.mockRejectedValue(new Error('Converter unavailable'));
    const docx = await renderAuthoringExport({ ...input(), format: 'docx' });
    const xml = await renderAuthoringExport({ ...input(), format: 'xml' });
    expect(new AdmZip(docx.fileContent).readAsText('word/document.xml')).toContain('Retained result');
    expect(xml.fileContent.toString()).toContain('Retained result');
    expect(mocks.convert).not.toHaveBeenCalled(); expect(mocks.html).not.toHaveBeenCalled();
  });
});
